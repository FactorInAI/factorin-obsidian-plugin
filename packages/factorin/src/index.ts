import type { ObsidianLanguageCode, TranslationResource } from '@hesprs/sync-engine-sdk';
import { en, zh } from './i18n';
import { registerFactorinIcon } from './icon';

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
 * using only leaf SDK types.
 *
 * **Keep it that way as `start()` grows**: add members to this type, never
 * `Context` / `SelectFromContext` / `Settings` / `Translations`.
 */
type FactorinContext = {
	registerI18n: (locale: ObsidianLanguageCode, resource: TranslationResource) => void;
};

/**
 * Factor.In's own persisted state. Internal modules do not get the
 * `settings.modules[id]` path that downloaded modules do, so anything that must
 * survive a reload through the root store belongs in the `onload` settings
 * literal in `packages/plugin/src/index.ts`, prefixed `factorin`.
 *
 * Empty for now — the API token key, Drive URL, account slug and base directory
 * land with the backend.
 */
export type FactorinSettings = Record<string, never>;

/**
 * The Factor.In module.
 *
 * Authored against the same contract as an upstream module package
 * (`moduleSettings` + `constructor(ctx)` + `start()` + `dispose()`), but compiled
 * into the plugin as an internal kernel module rather than downloaded. It is
 * registered **last** in `internalModules` so its `start()` sees every other
 * module's registrations.
 *
 * A shell at this point: it registers its i18n resources and the Factor.In icon.
 * The `factorin` remote FS and the settings section arrive in later milestones.
 */
export default class Factorin {
	/** Unregister callbacks accumulated by `start()`, drained by `dispose()`. */
	private readonly cleanup: Array<() => void> = [];

	// `ctx` is held, not just read, because every later registration (`registerRemoteFs`,
	// `registerSetting`, `addCommand`, …) is made from `start()`, not the constructor.
	constructor(private readonly ctx: FactorinContext) {
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
	}

	readonly moduleSettings: FactorinSettings = {};

	readonly start = () => {
		registerFactorinIcon();
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
