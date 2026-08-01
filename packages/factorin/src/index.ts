import type { FactorinAccount, FactorinBootstrap } from './api/types';
import type { FactorinBackendContext, FactorinBackendSettings } from './backend';
import type { FactorinContextTranslate, FactorinSettingTranslate } from './setting';
import type { FactorinPullOnlyContext } from './sync/pull-only';
import { fetchBootstrap, pickDefaultAccount } from './api/client';
import { defaultBaseDirectory, registerFactorinBackend } from './backend';
import { en, zh } from './i18n';
import { registerFactorinIcon } from './icon';
import factorinSetting from './setting';
import { FACTORIN_PULL_ONLY_DECIDER, registerPullOnlyDecider } from './sync/pull-only';

/**
 * The locales Factor.In ships translations for.
 *
 * A narrowing of the SDK's `ObsidianLanguageCode`, declared here rather than
 * imported. `@hesprs/sync-engine-sdk` *is* `packages/plugin`, and its types are
 * published from `packages/plugin/dist`, which turbo's `postinstall`
 * (`turbo run build -F @hesprs/sync-engine-sdk`) is in the middle of producing at
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
 */
export const FACTORIN_TOKEN_KEY = 'factorinApiToken';

/**
 * Where the Factor.In section sorts in the settings tab. Deliberately the slot
 * upstream's WebDAV module uses for its backend section (`packages/webdav`,
 * priority 749): after the head section (0), before features (1000). The two
 * never collide — the branded build ships no downloadable modules (Overview §2).
 */
export const FACTORIN_SETTING_PRIORITY = 749;

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
 * `src/setting.ts`). The workflow UI arrives in a later milestone.
 */
export default class Factorin {
	/** Unregister callbacks accumulated by `start()`, drained by `dispose()`. */
	private readonly cleanup: Array<() => void> = [];

	/**
	 * The bootstrap fetched by this session's connect — the in-memory half of the
	 * connection (Overview document §6.2): the account list behind the settings
	 * tab's picker and the token's permissions behind {@link permissions}. Gone
	 * after a reload by design; the persisted half is `moduleSettings`.
	 */
	private connection?: FactorinBootstrap;

	/*
	 * `ctx` is held, not just read, because every later registration (`registerRemoteFs`,
	 * `registerSetting`, `addCommand`, …) is made from `start()`, not the constructor.
	 */
	constructor(private readonly ctx: FactorinContext) {
		/*
		 * Upstream's WebDAV module seeds the same default from the same place, for the
		 * same reason: an empty base directory normalizes to `/`, which the wrapper would
		 * then join onto every key as a prefix.
		 */
		this.moduleSettings.baseDirectory ||= defaultBaseDirectory(ctx.app);
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
	};

	/**
	 * The connected token's grants, straight off this session's bootstrap —
	 * cached in memory only, never persisted (Overview document §6.2). `drive`
	 * decides the sync direction at connect time; `workflows` gates the §8 UI.
	 * `undefined` until a connect succeeds (including after every reload, until
	 * the §6.3 startup re-auth lands).
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
		await saveSettings();
	};

	/**
	 * Rebuild `moduleSettings` from the root store's `factorin*` keys. Runs at
	 * `start()` — after the kernel has injected `settings` — so a connection made
	 * in an earlier session survives the reload. Empty persisted fields (a fresh
	 * install) leave the constructor's defaults in place.
	 */
	private readonly hydrate = () => {
		const { moduleSettings, settings } = this;
		moduleSettings.accountSlug = settings.factorinAccountSlug;
		moduleSettings.driveUrl = settings.factorinDriveUrl;
		moduleSettings.tokenKey = settings.factorinTokenKey;
		moduleSettings.userName = settings.factorinUserName;
		if (settings.factorinBaseDirectory)
			moduleSettings.baseDirectory = settings.factorinBaseDirectory;
	};

	readonly start = () => {
		const { ctx } = this;
		/*
		 * `ctx.translate` is the kernel's `Translate<any>` (its keys span every
		 * module). Narrow to this module's keys once, here, for the two consumers
		 * that need it: the decider's string `prettyName` and the settings host.
		 * Sound because the kernel returns a string for every `factorin` key; see
		 * `FactorinContextTranslate` in `./setting`.
		 */
		const translate = ctx.translate as FactorinSettingTranslate;
		registerFactorinIcon();
		this.hydrate();
		this.cleanup.push(
			...registerFactorinBackend(ctx, this.moduleSettings),
			registerPullOnlyDecider(ctx, translate('factorinPullOnly')),
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
						moduleSettings: this.moduleSettings,
						permissions: this.permissions,
						rerender: ctx.rerenderSettingTab,
						selectAccount: this.selectAccount,
						translate,
					}),
				priority: FACTORIN_SETTING_PRIORITY,
			}),
		);
	};

	readonly dispose = () => {
		this.cleanup.splice(0).forEach((fn) => fn());
		this.connection = undefined;
	};
}
