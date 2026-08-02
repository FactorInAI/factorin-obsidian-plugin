import type { App } from 'obsidian';
import type { CheckConnectionResult, Fs, Request, RootFs } from './webdav/types';
import baseDirWrapper from './webdav/base-dir';
import { checkConnection } from './webdav/check-connection';
import WebdavFs from './webdav/fs';

/**
 * The id the backend registers under.
 *
 * `packages/plugin/src/index.ts` seeds `remoteFs: 'factorin'` in its `onload`
 * settings literal (a FORK EDIT, see the Overview document §5.1), so this string
 * is a wire value shared with upstream's settings store — changing it orphans
 * every existing vault's backend selection.
 */
export const FACTORIN_REMOTE_FS = 'factorin';

/**
 * What the backend is called in the settings tab's backend dropdown.
 *
 * A literal rather than `ctx.translate('factorin')`, which is what upstream's
 * WebDAV module uses. Two reasons, both structural: the string is a brand name
 * and is identical in every locale (see `src/i18n.ts`), and `Translate` is keyed
 * on `Translations` — a merge over the plugin's own `internalModules` array,
 * which is exactly the kind of type the Overview document §4.1 forbids this
 * package from naming.
 */
export const FACTORIN_PRETTY_NAME = 'Factor.In';

/**
 * Priority of the base-directory wrapper in the remote FS wrapper chain.
 *
 * Deliberately the same value upstream's WebDAV module uses
 * (`packages/webdav/src/index.ts`), because it means the same thing: the path
 * prefix has to be applied closest to the transport, underneath encryption and
 * anything else that rewrites keys. Re-check it on every upstream merge — the
 * number is upstream's, not ours.
 */
export const BASE_DIR_WRAPPER_PRIORITY = 6318;

/**
 * Factor.In's persisted backend configuration.
 *
 * Everything here is derived from the pasted API token by the connect flow
 * (Overview document §6.2) — the user never types a WebDAV URL. Note what is
 * *not* here: the token itself. `tokenKey` is a `secretStorage` **key**; the raw
 * `fi_…` value is read back lazily, per instantiation, and never lands in the
 * settings store.
 */
export type FactorinBackendSettings = {
	/** Account slug — the WebDAV Basic-auth username (decorative; §6.0). */
	accountSlug: string;
	/** Path prefix inside the Drive, e.g. `MyVault/`. Never empty — see {@link defaultBaseDirectory}. */
	baseDirectory: string;
	/** The chosen account's Drive URL, e.g. `https://drive.factorin.com/acme/`. */
	driveUrl: string;
	/** `secretStorage` key the raw `fi_…` token is stored under. */
	tokenKey: string;
};

/**
 * The kernel's `RemoteFsEntry` / `FsWrapperEntry` / context slice, re-declared.
 *
 * Same reason as `backend/webdav/types.ts`: this package must not import
 * `@hesprs/sync-engine-sdk` in any form (Overview document §4.2). These live here
 * rather than in that file because that file is the *vendored* FS core's type
 * surface — these three are the module-lifecycle half, which is ours.
 *
 * They are copied from `packages/plugin/src/modules/Registrar.ts`, narrowed only
 * where `backend/webdav/types.ts` already narrows (`Request`). Drift is caught at
 * the boundary: `packages/plugin` type-checks the real context against
 * `FactorinContext` when it puts this module in `internalModules`.
 */
export type FactorinRemoteFsEntry = {
	checkConnection: (request: Request) => Promise<CheckConnectionResult>;
	instantiate: (request: Request) => RootFs;
	prettyName: () => string;
};

export type FactorinFsWrapperEntry = {
	apply: (fs: Fs) => Fs | undefined;
	priority: number;
};

export type FactorinBackendContext = {
	app: App;
	registerRemoteFs: (id: string, entry: FactorinRemoteFsEntry) => () => void;
	registerRemoteFsWrapper: (entry: FactorinFsWrapperEntry) => () => void;
};

/**
 * Unwrap an FS down to the instance the wrapper chain was built around.
 *
 * A local copy of the SDK's `digOriginal` (`packages/plugin/src/sdk/index.ts`),
 * for the §4.2 no-SDK-import rule. Four lines, and the shape it walks —
 * `WrappedFs = RootFs & { original: Fs }` — is already re-declared in
 * `webdav/types.ts`, so there is nothing else to keep in sync.
 */
function digOriginal(wrapped: Fs) {
	let original = wrapped;
	while ('original' in original) original = original.original;
	return original;
}

/**
 * The base directory a fresh install syncs under, mirroring upstream WebDAV's
 * default so an unconfigured Factor.In behaves the way an unconfigured WebDAV
 * does.
 *
 * It must never be empty: `normalizeBaseDir('')` is `'/'`, and the wrapper joins
 * that onto keys as a *prefix* (`/note.md`), which is not a key the sync engine's
 * path grammar accepts.
 *
 * The Overview document §7 will replace this with Factor.In's own `Documents/`
 * layout; that is a business rule with a first-connect side effect, so it lands
 * with the connect flow rather than here.
 */
export function defaultBaseDirectory(app: App) {
	return `${app.vault.getName()}/`;
}

/**
 * Register the single first-party `factorin` remote FS (Overview document §6.1).
 *
 * The backend is upstream's WebDAV client — the pinned copy in `webdav/`, see
 * `webdav/VENDORED.md` — pointed at the account's Drive endpoint, with HTTP Basic
 * credentials derived from the API token instead of typed in (§6.0). That is the
 * *only* difference from upstream's `webdav` backend, which is what lets every
 * upstream decider, conflict resolver, scheduler and FS wrapper drive it with
 * zero awareness of Factor.In.
 *
 * Returns the unregister callbacks in registration order, for the caller's
 * `dispose()` queue.
 */
export function registerFactorinBackend(
	ctx: FactorinBackendContext,
	settings: FactorinBackendSettings,
): Array<() => void> {
	const { app, registerRemoteFs, registerRemoteFsWrapper } = ctx;

	/**
	 * Resolved on **every** instantiation, never cached.
	 *
	 * The token lives in `secretStorage`, and the Drive URL and slug are rewritten
	 * whenever the user reconnects or switches account, so a config captured at
	 * `start()` would be stale the moment either happens — and would pin a secret
	 * in memory for the lifetime of the plugin. Upstream's WebDAV module resolves
	 * lazily for the same reason.
	 */
	const resolveConfig = () => {
		const { accountSlug, baseDirectory, driveUrl, tokenKey } = settings;
		/*
		 * Read unconditionally, as upstream's WebDAV module does: before the connect flow
		 * has run `tokenKey` is `''`, and an unset key is simply a miss.
		 */
		const token = app.secretStorage.getSecret(tokenKey);
		if (token === null || !driveUrl) throw new Error('Please connect your Factor.In account!');
		return { baseDirectory, endpoint: driveUrl, password: token, username: accountSlug };
	};

	return [
		registerRemoteFs(FACTORIN_REMOTE_FS, {
			/*
			 * Throwing here rather than resolving `{ success: false }` is deliberate and
			 * matches upstream: the settings tab catches it and surfaces the message, so
			 * "not connected yet" reads as itself instead of as a failed handshake.
			 */
			checkConnection: (request) => {
				const { endpoint, password, username } = resolveConfig();
				return checkConnection({ endpoint, password, username }, request);
			},
			instantiate: (request) => {
				const { endpoint, password, username } = resolveConfig();
				return new WebdavFs({ endpoint, password, request, username });
			},
			prettyName: () => FACTORIN_PRETTY_NAME,
		}),
		registerRemoteFsWrapper({
			/*
			 * The chain is global — every registered wrapper is offered every remote FS,
			 * including other backends'. Identity-check first so this is a no-op for
			 * anything that is not ours, and so `resolveConfig()` is only reached for an
			 * FS that was, by construction, instantiated from a resolvable config.
			 */
			apply: (fs) => {
				if (!(digOriginal(fs) instanceof WebdavFs)) return undefined;
				return baseDirWrapper(fs, resolveConfig().baseDirectory);
			},
			priority: BASE_DIR_WRAPPER_PRIORITY,
		}),
	];
}
