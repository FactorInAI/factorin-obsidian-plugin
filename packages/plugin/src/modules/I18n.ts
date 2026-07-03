import type { Events, Translations } from '@';
import type { General } from '@/types';
import type { On } from './EventBus';

// https://github.com/obsidianmd/obsidian-translations
export type ObsidianLanguageCode =
	| 'en'
	| 'af'
	| 'am'
	| 'ar'
	| 'az'
	| 'be'
	| 'bg'
	| 'bn'
	| 'ca'
	| 'cs'
	| 'da'
	| 'de'
	| 'dv'
	| 'el'
	| 'en-GB'
	| 'eo'
	| 'es'
	| 'eu'
	| 'fa'
	| 'fi'
	| 'fr'
	| 'ga'
	| 'gl'
	| 'he'
	| 'hi'
	| 'hr'
	| 'hu'
	| 'id'
	| 'it'
	| 'ja'
	| 'ka'
	| 'kh'
	| 'kn'
	| 'ko'
	| 'ky'
	| 'la'
	| 'lt'
	| 'lv'
	| 'ml'
	| 'ms'
	| 'nan-TW'
	| 'ne'
	| 'nl'
	| 'nn'
	| 'no'
	| 'oc'
	| 'or'
	| 'pl'
	| 'pt'
	| 'pt-BR'
	| 'ro'
	| 'ru'
	| 'sa'
	| 'si'
	| 'sk'
	| 'sl'
	| 'sq'
	| 'sr'
	| 'sv'
	| 'sw'
	| 'ta'
	| 'te'
	| 'th'
	| 'tl'
	| 'tr'
	| 'tt'
	| 'uk'
	| 'ur'
	| 'uz'
	| 'vi'
	| 'zh'
	| 'zh-TW';

const DEFAULT_LANGUAGE: ObsidianLanguageCode = 'en';
type Primitive = string | number | boolean | null | undefined;
export type Fragment = (frag: DocumentFragment) => void;
export type TranslationResource = Record<string, string | Fragment>;
export type InterpolationValues = Record<string, Primitive>;
export type Translate<O extends TranslationResource> = <K extends keyof O>(
	key: K,
	interpolate?: InterpolationValues,
) => O[K] extends string ? string : DocumentFragment;

export default class I18n {
	private readonly i18nRegistry = new Map<ObsidianLanguageCode, Set<TranslationResource>>();
	private readonly loadedResources = new Set<TranslationResource>();
	readonly dispose: () => void;
	private targetLang: ObsidianLanguageCode = DEFAULT_LANGUAGE;
	declare readonly i18n: {};

	constructor({ on }: { on: On<Events> }) {
		this.dispose = on('moduleLoaded', this.refreshI18n);
	}

	private readonly registerI18n = (code: ObsidianLanguageCode, resource: TranslationResource) => {
		let set = this.i18nRegistry.get(code);
		if (!set) {
			set = new Set<TranslationResource>();
			this.i18nRegistry.set(code, set);
		}
		set.add(resource);
		return () => {
			set.delete(resource);
			this.loadedResources.delete(resource);
		};
	};

	private readonly loadI18n = (target: ObsidianLanguageCode) => {
		this.targetLang = target;
		const langs = new Set<ObsidianLanguageCode>([
			DEFAULT_LANGUAGE,
			target.split('-')[0] as ObsidianLanguageCode,
			target,
		]);
		for (const lang of langs) {
			const set = this.i18nRegistry.get(lang);
			if (!set) continue;
			for (const resource of set) {
				Object.assign(this.i18n, resource);
				this.loadedResources.add(resource);
			}
		}
	};

	private readonly refreshI18n = () => {
		const langs = new Set<ObsidianLanguageCode>([
			this.targetLang.split('-')[0] as ObsidianLanguageCode,
			this.targetLang,
		]);
		if (!langs.has(DEFAULT_LANGUAGE)) {
			const set = this.i18nRegistry.get(DEFAULT_LANGUAGE);
			if (set)
				for (const resource of set) {
					if (this.loadedResources.has(resource)) continue;
					for (const [key, value] of Object.entries(resource))
						(this.i18n as Record<string, unknown>)[key] ??= value;
					this.loadedResources.add(resource);
				}
		}
		for (const lang of langs) {
			const set = this.i18nRegistry.get(lang);
			if (!set) continue;
			for (const resource of set) {
				if (this.loadedResources.has(resource)) continue;
				Object.assign(this.i18n, resource);
				this.loadedResources.add(resource);
			}
		}
	};

	private readonly translate: Translate<Translations> = ((
		key: keyof Translations,
		params?: InterpolationValues,
	) => {
		const i18n = this.i18n as Translations;
		const value = i18n[key];
		if (typeof value === 'string') {
			if (params) return interpolate(value, params);
			return value;
		}
		if (typeof value === 'function') return createFragment(value);
	}) as Translate<Translations>;

	root = {
		loadI18n: this.loadI18n,
		refreshI18n: this.refreshI18n,
		registerI18n: this.registerI18n,
		translate: this.translate as Translate<General>,
	};
}

function interpolate(template: string, params?: InterpolationValues): string {
	if (params === undefined) return template;
	return template.replace(/\{\{\s*(?<key>[^{}\s]+)\s*\}\}/g, (match, key: string) => {
		const value = params[key];
		return value === undefined ? match : String(value);
	});
}
