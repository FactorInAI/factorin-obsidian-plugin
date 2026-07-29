import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const en = {
	asymmetricStorage: 'Asymmetric Storage',
	benchmark: 'Benchmark',
	code: 'en-US',
	contributing: 'Contributing',
	copyright: 'Copyright',
	devOps: 'DevOps',
	developAModule: 'Develop a Module',
	development: 'Development',
	documentation: 'Documentation',
	fileSystem: 'File System',
	folder: '',
	home: 'Home',
	introduction: 'Introduction',
	licenseMessage:
		'All content licensed under the <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> License.',
	modules: 'Modules',
	nativeName: 'English',
	runtimeApi: 'Runtime API',
	sideDescription: 'Next-generation syncing plugin for Obsidian.',
	whatsSyncEngine: "What's Sync Engine",
};

const translations = { en } as const;

type Translation = typeof en;
type Translations = typeof translations;
type LocaleConfig<C> = LocaleSpecificConfig<C> & { label: string; link?: string };

export function translate<K extends keyof Translation, L extends keyof Translations>(
	key: K,
	lang: L,
) {
	return translations[lang][key];
}

export function configGenerator<C = DefaultTheme.Config>(
	factory: (
		translate: <K extends keyof Translation>(key: K) => Translation[K],
	) => LocaleConfig<NoInfer<C>>,
): (lang: keyof Translations) => LocaleConfig<C> {
	return (lang) => factory((key) => translate(key, lang));
}
