import { Notice } from 'obsidian';
import type { FactorinAccount, FactorinBootstrap } from './api/types';
import type { FactorinBackendContext, FactorinBackendSettings } from './backend';
import type { FactorinServerConfig } from './config';
import type { FactorinContextTranslate, FactorinSettingTranslate } from './setting';
import type { FactorinPullOnlyContext } from './sync/pull-only';
import { FactorinAuthError, fetchBootstrap, pickDefaultAccount } from './api/client';
import { registerFactorinBackend } from './backend';
import { FACTORIN_CONFIG_FALLBACKS, SUPPRESSED_UPSTREAM_SETTING_PRIORITIES } from './config';
import { en, zh } from './i18n';
import { registerFactorinIcon } from './icon';
import factorinSetting from './setting';
import { FACTORIN_PULL_ONLY_DECIDER, registerPullOnlyDecider } from './sync/pull-only';

/*
 * Re-exported so the plugin's onload (packages/plugin/src/index.ts) can seed its
 * settings literal from the same single source of truth — see ./config.
 */
export {
	FACTORIN_CONFIG_FALLBACKS,
	FACTORIN_CONFLICT_RESOLVER,
	SUPPRESSED_UPSTREAM_SETTING_PRIORITIES,
} from './config';

/**
 * The locales Factor.In ships translations for.
 *
 * A narrowing of the SDK's `ObsidianLanguageCode`, declared here rather than
 * imported. `@hesprs/sync-engine-sdk` *is* `packages/plugin`, and its types are
 * published from `packages/plugin/dist`, which turbo's `postinstall`
 * (`turbo run compile -F @hesprs/sync-engine-sdk`) is in the middle of producing at
 * the moment this file first enters a compiler. Because `packages/plugin` bundles
 * Factor.In from source, importing the SDK from here means the SDK build has to
 * type a file that imports the SDK's own not-yet-emitted `dist/index.d.ts` — that
 * is what broke declaration emit for this file (`tsgo did not generate dts file
 * for packages/factorin/src/index.ts`).
 *
 * Narrowing is safe in the direction that matters: `FactorinContext` only has to
 * be a supertype of the real kernel context, and a `registerI18n` accepting every
 * `ObsidianLanguageCode` is assignable to one accepting just these two.
 *
 * **Keep this package free of `@hesprs/sync-engine-sdk`.** It is not a dependency
 * at all any more: dropping it is what lets `packages/plugin` depend on
 * `@factorin/module` without cycling Turbo's task graph.
 */
export type FactorinLanguageCode = 'en' | 'zh';

/**
 * The shape `registerI18n` accepts, narrowed from the SDK's
 * `Record<string, string | Fragment<General>>`. Factor.In's resources are plain
 * strings; see {@link FactorinLanguageCode} for why this is not imported.
 */
export type FactorinTranslationResource = Record<string, string>;

/**
 * The slice of the kernel context this module needs.
 *
 * Upstream's *downloadable* modules (`packages/webdav`, `packages/smart-merge`)
 * spell this as `SelectFromContext<{…}>`, which expands to `Context extends O ? O
 * : never`. Factor.In cannot: it is an **internal** module, a member of the
 * plugin's own `internalModules` array, so the plugin's `Context` is defined in
 * terms of this class. Naming `Context` here would make the two types reference
 * each other through their own definitions. Upstream's internal modules (see
 * `Extensibility`) sidestep this the same way — declare the members structurally,
 * using only leaf types.
 *
 * **Keep it that way as the module grows**: add members to this type, never
 * `Context` / `SelectFromContext` / `Settings` / `Translations`.
 */
type FactorinContext = FactorinBackendContext &
	FactorinPullOnlyContext & {
		registerI18n: (locale: FactorinLanguageCode, resource: FactorinTranslationResource) => void;
		registerSetting: (entry: {
			apply: (el: HTMLElement) => void;
			priority: number;
		}) => () => void;
		/** Kick a sync — the "Sync now" button; same entry point the ribbon uses. */
		requestSync: (trigger: string) => Promise<unknown>;
		rerenderSettingTab: () => void;
		saveSettings: () => Promise<void>;
		translate: FactorinContextTranslate;
	};

/**
 * Factor.In's own state: the backend's configuration
 * ({@link FactorinBackendSettings}: Drive URL, account slug, `secretStorage` key
 * for the `fi_…` token, base directory) plus the connected user's display name
 * for the settings tab's status line.
 *
 * Internal modules do not get the `settings.modules[id]` persistence path that
 * downloaded ones do — `Extensibility.loadModule` is what writes that, and it
 * only ever sees modules it downloaded. So this object lives and dies with the
 * plugin instance, and the connect flow mirrors every field into the root store
 * under `factorin`-prefixed keys (see the class's `settings` declaration and the
 * `onload` settings literal in `packages/plugin/src/index.ts`; Overview document
 * §5.1, §11). `start()` hydrates it back from those keys.
 *
 * The token is never part of this shape in either case — only the key it is
 * stored under.
 */
export type FactorinSettings = FactorinBackendSettings & {
	/** The connected user's display name — status line only, never sent anywhere. */
	userName: string;
};

/**
 * The `secretStorage` key the raw `fi_…` token lives under. A fixed string
 * rather than something generated: there is exactly one Factor.In token per
 * vault, and a stable key is what lets a reconnect overwrite the old secret
 * instead of stranding it.
 *
 * Obsidian validates this ID: **lowercase alphanumeric with optional dashes,
 * ≤64 chars** (`SecretStorage.setSecret`, `@throws` on a bad ID) — so no
 * camelCase and no underscores. Keep it dash-cased.
 */
export const FACTORIN_TOKEN_KEY = 'factorin-api-token';

/**
 * Where the Factor.In section sorts in the settings tab. Deliberately the slot
 * upstream's WebDAV module uses for its backend section (`packages/webdav`,
 * priority 749): after the head section (0), before features (1000). The two
 * never collide — the branded build ships no downloadable modules (Overview §2).
 */
export const FACTORIN_SETTING_PRIORITY = 749;

/**
 * Retry policy for a startup re-auth that failed *transiently* (network down,
 * 5xx — anything but the server rejecting the token). The mount keeps working
 * on cached config meanwhile (Drive auth is per-request), so the retry only
 * exists to eventually restore `permissions`; a short bounded series is enough,
 * and giving up just leaves the pre-§6.3 behavior until the next reload.
 */
const REAUTH_RETRY_DELAY = 30_000;
const REAUTH_MAX_ATTEMPTS = 3;

/**
 * The Factor.In module.
 *
 * Authored against the same contract as an upstream module package
 * (`moduleSettings` + `constructor(ctx)` + `start()` + `dispose()`), but compiled
 * into the plugin as an internal kernel module rather than downloaded. It is
 * registered **last** in `internalModules` so its `start()` sees every other
 * module's registrations.
 *
 * It registers its i18n resources, the Factor.In icon, the single first-party
 * `factorin` remote FS (see `src/backend/`), the pull-only decider (see
 * `src/sync/pull-only.ts`), and the API-token settings section (see
 * `src/setting.ts`); when a token is stored it also silently re-authenticates
 * at startup (§6.3, see `reauthenticate`). The workflow UI arrives in a later
 * milestone.
 */
export default class Factorin {
	/** Unregister callbacks accumulated by `start()`, drained by `dispose()`. */
	private readonly cleanup: Array<() => void> = [];

	/**
	 * The bootstrap fetched by this session's connect — the in-memory half of the
	 * connection (Overview document §6.2): the account list behind the settings
	 * tab's picker and the token's permissions behind {@link permissions}. Gone
	 * after a reload by design; the persisted half is `moduleSettings`, and the
	 * startup re-auth (§6.3, see {@link reauthenticate}) refetches this from the
	 * stored token.
	 */
	private connection?: FactorinBootstrap;

	/**
	 * Cancels the scheduled transient-failure retry of {@link reauthenticate} —
	 * set while one is pending, invoked by `dispose()`. A closure over the timer
	 * handle rather than the handle itself: the repo's usual `window.setTimeout`
	 * is not available under `bun test`, and the bare global's *return* type
	 * differs between the DOM and Bun typings this package compiles against.
	 */
	private cancelReauthRetry?: () => void;

	/*
	 * `ctx` is held, not just read, because every later registration (`registerRemoteFs`,
	 * `registerSetting`, `addCommand`, …) is made from `start()`, not the constructor.
	 */
	constructor(private readonly ctx: FactorinContext) {
		/*
		 * `baseDirectory` is left empty: Factor.In is one-account-one-library, so every
		 * vault syncs the account's Drive root (`/<slug>/`) and they all converge on the
		 * same tree. A non-empty prefix would namespace each vault into its own subfolder
		 * and fragment that shared library. The backend skips the base-dir wrapper when
		 * this is empty (see `registerRemoteFsWrapper` in `./backend`).
		 */
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
	}

	readonly moduleSettings: FactorinSettings = {
		accountSlug: '',
		baseDirectory: '',
		driveUrl: '',
		tokenKey: '',
		userName: '',
	};

	/**
	 * This module's slice of the root settings store, declared structurally with
	 * leaf types only (never the merged `Settings` — Overview document §4.1). The
	 * kernel injects the store; declaring the members here is what forces the
	 * `onload` settings literal in `packages/plugin/src/index.ts` to carry their
	 * defaults, which is the persistence path internal modules get (§5.1, §11).
	 *
	 * `decider` is upstream's own key (also declared by `Registrar`): the connect
	 * flow writes it to honor the token's `drive` grant — `write` → bidirectional,
	 * anything less → pull-only.
	 */
	declare settings: {
		decider: string;
		factorinAccountSlug: string;
		factorinBaseDirectory: string;
		factorinDriveUrl: string;
		factorinTokenKey: string;
		factorinUserName: string;
		/*
		 * Server-driven settings the connect flow overlays from the `/me` config
		 * block (see `applyServerConfig` and `./config`). Upstream's own keys, declared
		 * structurally here with leaf types so this module can write them (§4.1).
		 */
		maxFileSize: { enabled: boolean; value: number };
		maxRequestConcurrency: { enabled: boolean; value: number };
		minRequestInterval: { enabled: boolean; value: number };
		realtimeSync: { enabled: boolean; value: number };
		scheduledSync: { enabled: boolean; value: number };
		startupSync: { enabled: boolean; value: number };
	};

	/**
	 * The connected token's grants, straight off this session's bootstrap —
	 * cached in memory only, never persisted (Overview document §6.2). `drive`
	 * decides the sync direction at connect time; `workflows` gates the §8 UI.
	 * `undefined` until a connect succeeds — after a reload that is the startup
	 * re-auth (§6.3), so the gap lasts one `/me` round trip rather than until
	 * the user reconnects by hand.
	 */
	get permissions() {
		return this.connection?.token.permissions;
	}

	/**
	 * The Connect button (Overview document §6.2): fetch what the token unlocks,
	 * mount its default account — personal, falling back to first — and persist.
	 * Throws with a user-facing message on any failure; the settings section
	 * surfaces it as a Notice.
	 */
	readonly connect = async (token: string) => {
		const bootstrap = await fetchBootstrap(token);
		this.connection = bootstrap;
		await this.mount(pickDefaultAccount(bootstrap.accounts), token);
	};

	/**
	 * Re-point the mount at another account from this session's bootstrap — the
	 * settings tab's account picker. The token is read back from `secretStorage`
	 * rather than retained by `connect`, so the raw secret never outlives the
	 * call that stored it.
	 */
	readonly selectAccount = async (slug: string) => {
		const account = this.connection?.accounts.find((candidate) => candidate.slug === slug);
		if (!account) throw new Error(`Unknown Factor.In account: "${slug}".`);
		const token = this.ctx.app.secretStorage.getSecret(this.moduleSettings.tokenKey);
		if (token === null) throw new Error('Please connect your Factor.In account!');
		await this.mount(account, token);
	};

	/**
	 * The startup re-auth in flight (Overview document §6.3), kicked by `start()`
	 * when a token is stored but {@link permissions} are not in memory — which is
	 * every restart, since the bootstrap is never persisted. Exposed so tests can
	 * await the settled state; `undefined` when `start()` found nothing to do.
	 */
	startupReauth?: Promise<void>;

	/**
	 * Silently rebuild this session's bootstrap from the stored token — the reload
	 * half of the connect flow (Overview document §6.3). Runs through `mount()`, so
	 * a permission change (write ↔ read) re-picks the decider and a server-side
	 * policy change re-applies via `applyServerConfig`, exactly as a fresh connect
	 * would. Prefers the account the user last mounted over `pickDefaultAccount` —
	 * silently switching accounts on restart would be a data-visible surprise —
	 * falling back to the default only when that slug is gone from the bootstrap.
	 *
	 * Timing: internal modules `start()` before the scheduler's startup sync fires
	 * (`Scheduler.start()` arms it behind a `startupSync.value` ≥ 2s timeout, and
	 * this module starts last in `internalModules`), so the `/me` request is in
	 * flight before the first sync and normally wins the race. When it doesn't —
	 * or the API is unreachable — the sync proceeds on the last-known-good mount,
	 * which stays valid because Drive auth is enforced server-side per request.
	 *
	 * Failure paths, neither of which may wedge sync:
	 * - Token rejected (401/403) → the `disconnect()` teardown plus a Notice
	 *   pointing at settings; the vault reads "not connected", as a revoked token
	 *   should.
	 * - Anything else (network, 5xx) → treated as transient: keep the cached
	 *   mount and retry a bounded number of times (see {@link REAUTH_RETRY_DELAY}).
	 */
	private readonly reauthenticate = async (attempt = 1): Promise<void> => {
		/*
		 * `|| FACTORIN_TOKEN_KEY`: the key is a fixed string, so a vault whose
		 * cached Drive config was wiped (but whose secret survived) still finds
		 * its token and reconnects instead of demanding a fresh paste.
		 */
		const token = this.ctx.app.secretStorage.getSecret(
			this.moduleSettings.tokenKey || FACTORIN_TOKEN_KEY,
		);
		if (!token) return;
		try {
			const bootstrap = await fetchBootstrap(token);
			this.connection = bootstrap;
			const account =
				bootstrap.accounts.find(
					(candidate) => candidate.slug === this.moduleSettings.accountSlug,
				) ?? pickDefaultAccount(bootstrap.accounts);
			await this.mount(account, token);
		} catch (error) {
			if (error instanceof FactorinAuthError) {
				await this.disconnect();
				new Notice(this.ctx.translate('factorinTokenRejected'));
				this.ctx.rerenderSettingTab();
				return;
			}
			if (attempt < REAUTH_MAX_ATTEMPTS) {
				const timer = setTimeout(() => {
					this.cancelReauthRetry = undefined;
					this.startupReauth = this.reauthenticate(attempt + 1);
				}, REAUTH_RETRY_DELAY);
				this.cancelReauthRetry = () => clearTimeout(timer);
			}
		}
	};

	/**
	 * The single writer of connection state: token into `secretStorage` under
	 * {@link FACTORIN_TOKEN_KEY}, the account's Drive config into
	 * `moduleSettings`, every field mirrored into the root store, the decider
	 * chosen from the token's `drive` grant — then one `saveSettings()`.
	 */
	private readonly mount = async (account: FactorinAccount, token: string) => {
		const { app, saveSettings } = this.ctx;
		app.secretStorage.setSecret(FACTORIN_TOKEN_KEY, token);
		const { moduleSettings, settings } = this;
		moduleSettings.accountSlug = account.slug;
		moduleSettings.driveUrl = account.driveUrl;
		moduleSettings.tokenKey = FACTORIN_TOKEN_KEY;
		moduleSettings.userName = this.connection?.name ?? '';
		settings.factorinAccountSlug = moduleSettings.accountSlug;
		settings.factorinBaseDirectory = moduleSettings.baseDirectory;
		settings.factorinDriveUrl = moduleSettings.driveUrl;
		settings.factorinTokenKey = moduleSettings.tokenKey;
		settings.factorinUserName = moduleSettings.userName;
		settings.decider =
			this.permissions?.drive === 'write' ? 'bidirectional' : FACTORIN_PULL_ONLY_DECIDER;
		this.applyServerConfig(this.connection?.config ?? {});
		await saveSettings();
	};

	/**
	 * Overlay the server-driven settings from this session's bootstrap onto the
	 * store: for each key the Factor.In API owns, take its value or fall back to
	 * {@link FACTORIN_CONFIG_FALLBACKS}. Called inside `mount`, so its single
	 * `saveSettings()` persists the result. The server is authoritative per connect —
	 * an omitted field resets to the fallback rather than keeping a stale value.
	 */
	private readonly applyServerConfig = (config: FactorinServerConfig) => {
		const { settings } = this;
		for (const key of Object.keys(FACTORIN_CONFIG_FALLBACKS) as Array<
			keyof typeof FACTORIN_CONFIG_FALLBACKS
		>)
			settings[key] = { ...(config[key] ?? FACTORIN_CONFIG_FALLBACKS[key]) };
	};

	/**
	 * Forget the connection (the settings tab's Disconnect). `secretStorage` has no
	 * delete, so the token is overwritten empty; the persisted mount is cleared and
	 * this session's bootstrap dropped. Files already synced stay in the vault. The
	 * next `resolveConfig` then reads an empty `tokenKey`/`driveUrl` and reports "not
	 * connected", exactly as a fresh install does.
	 */
	readonly disconnect = async () => {
		const { app, saveSettings } = this.ctx;
		app.secretStorage.setSecret(FACTORIN_TOKEN_KEY, '');
		const { moduleSettings, settings } = this;
		moduleSettings.accountSlug = '';
		moduleSettings.driveUrl = '';
		moduleSettings.tokenKey = '';
		moduleSettings.userName = '';
		settings.factorinAccountSlug = '';
		settings.factorinDriveUrl = '';
		settings.factorinTokenKey = '';
		settings.factorinUserName = '';
		this.connection = undefined;
		await saveSettings();
	};

	/**
	 * Rebuild `moduleSettings` from the root store's `factorin*` keys. Runs at
	 * `start()` — after the kernel has injected `settings` — so a connection made
	 * in an earlier session survives the reload. Empty persisted fields (a fresh
	 * install) leave the constructor's defaults in place.
	 *
	 * `baseDirectory` is deliberately *not* restored: Factor.In always syncs the
	 * account root, so it stays `''`. Ignoring the persisted value is also what
	 * migrates a vault connected by an older build that seeded a per-vault
	 * subfolder — the stale prefix is dropped on the next reload.
	 */
	private readonly hydrate = () => {
		const { moduleSettings, settings } = this;
		moduleSettings.accountSlug = settings.factorinAccountSlug;
		moduleSettings.driveUrl = settings.factorinDriveUrl;
		moduleSettings.tokenKey = settings.factorinTokenKey;
		moduleSettings.userName = settings.factorinUserName;
	};

	readonly start = () => {
		const { ctx } = this;
		/*
		 * `ctx.translate` is the kernel's `Translate<any>` (its keys span every
		 * module). Narrow to this module's keys once, here, for the two consumers
		 * that need it: the decider's `prettyName` thunk and the settings host.
		 * Sound because the kernel returns a string for every `factorin` key; see
		 * `FactorinContextTranslate` in `./setting`.
		 */
		const translate = ctx.translate as FactorinSettingTranslate;
		registerFactorinIcon();
		this.hydrate();
		/*
		 * §6.3 startup re-auth: permissions never survive a restart (they live on
		 * the in-memory bootstrap), so any stored token warrants a refetch — not
		 * only the empty-`driveUrl` case. Fire-and-forget; see `reauthenticate`
		 * for the ordering against the scheduler's startup sync.
		 */
		if (!this.permissions) this.startupReauth = this.reauthenticate();
		this.cleanup.push(
			...registerFactorinBackend(ctx, this.moduleSettings),
			registerPullOnlyDecider(ctx, () => translate('factorinPullOnly')),
			ctx.registerSetting({
				/*
				 * Rebuilt from live module state on every `display()`, so a connect,
				 * an account switch, or a reload is reflected without any listener
				 * plumbing.
				 */
				apply: (el) =>
					factorinSetting(el, {
						connect: this.connect,
						connection: this.connection,
						disconnect: this.disconnect,
						moduleSettings: this.moduleSettings,
						permissions: this.permissions,
						rerender: ctx.rerenderSettingTab,
						selectAccount: this.selectAccount,
						syncNow: () => void ctx.requestSync('manual'),
						translate,
					}),
				priority: FACTORIN_SETTING_PRIORITY,
			}),
			/*
			 * Minimize the settings tab to the Factor.In section alone: blank every
			 * upstream section by registering a no-op at its priority. `SettingTab`
			 * keeps one `apply` per priority and this module starts last, so the no-op
			 * wins the slot. See SUPPRESSED_UPSTREAM_SETTING_PRIORITIES in ./config —
			 * re-check it against Bootstrap on every upstream merge.
			 */
			...SUPPRESSED_UPSTREAM_SETTING_PRIORITIES.map((priority) =>
				ctx.registerSetting({ apply: () => {}, priority }),
			),
		);
	};

	readonly dispose = () => {
		this.cleanup.splice(0).forEach((fn) => fn());
		this.cancelReauthRetry?.();
		this.cancelReauthRetry = undefined;
		this.startupReauth = undefined;
		this.connection = undefined;
	};
}
