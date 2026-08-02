import type { FactorinLanguageCode, FactorinTranslationResource } from '@/index';
import type { FactorinSettingTranslate } from '@/setting';
import type { FactorinDeciderEntry, FactorinDeciderInput } from '@/sync/pull-only';
import { FACTORIN_CONFIG_FALLBACKS } from '@/config';
import { en } from '@/i18n';
import { createBackendContext } from './backend-context';

/**
 * The kernel translator, reduced to what tests need: the `en` resource plus
 * `{{name}}` interpolation, mirroring upstream `I18n.interpolate`. Using the
 * real strings keeps assertions honest — a status-line test compares against
 * what a user would actually read.
 *
 * Cast to `FactorinSettingTranslate` rather than typed as it directly (same
 * move upstream's own `I18n.translate` makes): a concrete `(key, params?) =>
 * string` is not structurally assignable to the kernel's generic `Translate<O>`
 * — see the comment on `FactorinSettingTranslate` in `src/setting.ts`.
 */
export const translate = ((
	key: keyof typeof en,
	params?: Record<string, string | number | boolean | null | undefined>,
) => {
	let value: string = en[key];
	for (const [name, replacement] of Object.entries(params ?? {}))
		value = value.replaceAll(`{{${name}}}`, String(replacement));
	return value;
}) as FactorinSettingTranslate;

/** The root-store slice the kernel injects — see `packages/plugin/src/index.ts`. */
export function createStore() {
	return {
		decider: 'bidirectional',
		factorinAccountSlug: '',
		factorinBaseDirectory: '',
		factorinDriveUrl: '',
		factorinTokenKey: '',
		factorinUserName: '',
		// Server-driven keys the connect flow overlays; seeded from the fallbacks.
		maxFileSize: { ...FACTORIN_CONFIG_FALLBACKS.maxFileSize },
		maxRequestConcurrency: { ...FACTORIN_CONFIG_FALLBACKS.maxRequestConcurrency },
		minRequestInterval: { ...FACTORIN_CONFIG_FALLBACKS.minRequestInterval },
		realtimeSync: { ...FACTORIN_CONFIG_FALLBACKS.realtimeSync },
		scheduledSync: { ...FACTORIN_CONFIG_FALLBACKS.scheduledSync },
		startupSync: { ...FACTORIN_CONFIG_FALLBACKS.startupSync },
	};
}

/**
 * A recording stand-in for the full module context — the backend harness plus
 * everything `start()` and the connect flow touch. Registries behave like
 * `Registrar`'s (add on call, remove on the returned callback); `saves` and
 * `rerenders` count the calls a test cares about ordering-free.
 */
export function createModuleContext() {
	const deciderRegistry = new Map<string, FactorinDeciderEntry>();
	const settingEntries: Array<{ apply: (el: HTMLElement) => void; priority: number }> = [];
	const harness = {
		...createBackendContext(),
		deciderRegistry,
		i18nRegistrations: [] as Array<[FactorinLanguageCode, FactorinTranslationResource]>,
		registerDecider: (
			id: string,
			entry: {
				decider: (input: FactorinDeciderInput) => Array<never>;
				prettyName: () => string;
			},
		) => {
			deciderRegistry.set(id, entry);
			return () => {
				deciderRegistry.delete(id);
			};
		},
		registerI18n: (locale: FactorinLanguageCode, resource: FactorinTranslationResource) => {
			harness.i18nRegistrations.push([locale, resource]);
		},
		registerSetting: (entry: { apply: (el: HTMLElement) => void; priority: number }) => {
			settingEntries.push(entry);
			return () => {
				const index = settingEntries.indexOf(entry);
				if (index !== -1) settingEntries.splice(index, 1);
			};
		},
		requestSync: async (_trigger: string) => {
			harness.syncs += 1;
		},
		rerenderSettingTab: () => {
			harness.rerenders += 1;
		},
		rerenders: 0,
		saveSettings: async () => {
			harness.saves += 1;
		},
		saves: 0,
		settingEntries,
		syncs: 0,
		translate,
	};
	return harness;
}
