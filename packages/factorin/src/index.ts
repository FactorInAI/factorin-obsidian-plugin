import type { FactorinBackendContext, FactorinBackendSettings } from './backend';
import { defaultBaseDirectory, registerFactorinBackend } from './backend';
import { en, zh } from './i18n';
import { registerFactorinIcon } from './icon';

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
 * **Keep it that way as `start()` grows**: add members to this type, never
 * `Context` / `SelectFromContext` / `Settings` / `Translations`.
 */
type FactorinContext = FactorinBackendContext & {
	registerI18n: (locale: FactorinLanguageCode, resource: FactorinTranslationResource) => void;
};

/**
 * Factor.In's own state — today, entirely the backend's configuration
 * ({@link FactorinBackendSettings}: Drive URL, account slug, `secretStorage` key
 * for the `fi_…` token, base directory).
 *
 * **Not persisted yet.** Internal modules do not get the `settings.modules[id]`
 * path that downloaded ones do — `Extensibility.loadModule` is what writes that,
 * and it only ever sees modules it downloaded. So this object lives and dies with
 * the plugin instance. Nothing is lost by that today: the fields are only
 * populated by hand, for verification. The connect flow (Overview document §6.2)
 * is what makes them worth keeping, and it is that task's job to mirror them into
 * the root store through the `onload` settings literal in
 * `packages/plugin/src/index.ts`, prefixed `factorin` (§5.1, §11).
 *
 * The token is never part of this shape in either case — only the key it is
 * stored under.
 */
export type FactorinSettings = FactorinBackendSettings;

/**
 * The Factor.In module.
 *
 * Authored against the same contract as an upstream module package
 * (`moduleSettings` + `constructor(ctx)` + `start()` + `dispose()`), but compiled
 * into the plugin as an internal kernel module rather than downloaded. It is
 * registered **last** in `internalModules` so its `start()` sees every other
 * module's registrations.
 *
 * It registers its i18n resources, the Factor.In icon, and the single
 * first-party `factorin` remote FS (see `src/backend/`). The API-token settings
 * section and the workflow UI arrive in later milestones.
 */
export default class Factorin {
	/** Unregister callbacks accumulated by `start()`, drained by `dispose()`. */
	private readonly cleanup: Array<() => void> = [];

	// `ctx` is held, not just read, because every later registration (`registerRemoteFs`,
	// `registerSetting`, `addCommand`, …) is made from `start()`, not the constructor.
	constructor(private readonly ctx: FactorinContext) {
		// Upstream's WebDAV module seeds the same default from the same place, for the
		// same reason: an empty base directory normalizes to `/`, which the wrapper would
		// then join onto every key as a prefix.
		this.moduleSettings.baseDirectory ||= defaultBaseDirectory(ctx.app);
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
	}

	readonly moduleSettings: FactorinSettings = {
		accountSlug: '',
		baseDirectory: '',
		driveUrl: '',
		tokenKey: '',
	};

	readonly start = () => {
		registerFactorinIcon();
		this.cleanup.push(...registerFactorinBackend(this.ctx, this.moduleSettings));
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
