import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const en = {
	abstractions: 'Abstractions',
	architecture: 'Architecture',
	asymmetricStorage: 'Asymmetric Storage',
	benchmark: 'Benchmark',
	claims: 'Claims',
	code: 'en-US',
	contributing: 'Contributing',
	copyright: 'Copyright',
	deepDive: 'Deep Dive',
	devOps: 'DevOps',
	developAModule: 'Develop a Module',
	development: 'Development',
	encryption: 'Encryption',
	extensibility: 'Extensibility',
	fileSystem: 'File System',
	fileSystemWrappers: 'File System Wrappers',
	fileTree: 'File Tree',
	folder: '',
	home: 'Home',
	licenseMessage:
		'All content licensed under the <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> License.',
	moduleManagementPanel: 'Module Management Panel',
	modules: 'Modules',
	nativeName: 'English',
	permissions: 'Permissions',
	request: 'Request',
	requestMiddleware: 'RequestMiddleware',
	runtimeApi: 'Runtime API',
	security: 'Security',
	settings: 'Settings',
	sideDescription: 'Next-generation syncing plugin for Obsidian.',
	smartMerge: 'Smart Merge',
	sync: 'Sync',
	usage: 'Usage',
	usageGuide: 'Usage Guide',
	userInterface: 'User Interface',
	webdav: 'WebDAV',
	welcome: 'Welcome',
	whySyncEngine: 'Why Sync Engine',
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
