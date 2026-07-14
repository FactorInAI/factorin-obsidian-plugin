// oxlint-disable import/no-nodejs-modules
import type { ThemeConfig } from 'vitepress-theme-trito';
import { lstatSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitepress';
import { configGenerator } from './i18n';

function p(path: string) {
	return resolve(dirname(fileURLToPath(import.meta.url)), '..', path);
}

const preserveMarkdownSymlinks = {
	enforce: 'pre',
	name: 'preserve-markdown-symlinks',
	resolveId(id: string) {
		try {
			if (id.endsWith('.md') && lstatSync(id).isSymbolicLink()) return id;
		} catch {}
	},
};

const localeConfig = configGenerator<ThemeConfig>((t) => ({
	description: t('sideDescription'),
	label: t('nativeName'),
	lang: t('code'),
	themeConfig: {
		footer: {
			copyright: `${t('copyright')} © 2026 Hēsperus`,
			message: t('licenseMessage'),
		},
		nav: [
			{ link: `${t('folder')}/`, text: t('home') },
			{ activeMatch: '/.+', link: '/get-started', text: 'Documentation' },
		],
		sidebar: [
			{
				items: [
					{ link: `${t('folder')}/whats-sync-engine`, text: t('whatsSyncEngine') },
					{ link: `${t('folder')}/modules`, text: t('modules') },
					{ link: `${t('folder')}/benchmark`, text: t('benchmark') },
					{ link: `${t('folder')}/asymmetric-storage`, text: t('asymmetricStorage') },
				],
				text: t('introduction'),
			},
			{
				items: [
					{ link: `${t('folder')}/develop-a-module`, text: t('developAModule') },
					{ link: `${t('folder')}/file-system`, text: t('fileSystem') },
					{ link: `${t('folder')}/runtime-api`, text: t('runtimeApi') },
					{ link: `${t('folder')}/devops`, text: t('devOps') },
					{ link: `${t('folder')}/contributing`, text: t('contributing') },
				],
				text: t('development'),
			},
		],
	},
	title: 'Sync Engine',
}));

export default defineConfig<ThemeConfig>({
	cleanUrls: true,
	head: [
		['link', { href: '/favicon.ico', rel: 'icon' }],
		['meta', { content: 'dark light', name: 'color-scheme' }],
	],
	lastUpdated: true,
	locales: {
		root: localeConfig('en'),
	},
	markdown: { image: { lazyLoading: true } },
	outDir: p('dist'),
	rewrites: { 'en/:rest*': ':rest*' },
	sitemap: { hostname: 'https://sync.consensia.cc' },
	srcDir: p('src/pages/'),
	themeConfig: {
		aside: 'left',
		editLink: 'https://github.com/hesprs/sync-engine/edit/main/docs/src/pages/:path',
		logo: { alt: 'Website logo', dark: '/logo-small-dark.svg', light: '/logo-small-light.svg' },
		logoLarge: { alt: 'Website large logo', src: '/logo.svg' },
		search: { provider: 'local' },
		socialLinks: [
			{ icon: 'npm', link: 'https://www.npmjs.com/~hesprs' },
			{ icon: 'github', link: 'https://github.com/hesprs' },
			{ icon: 'x', link: 'https://x.com/Hesprs' },
		],
	},
	vite: {
		plugins: [preserveMarkdownSymlinks],
		publicDir: p('public'),
		resolve: { alias: { '@': p('src') } },
		ssr: { noExternal: ['vitepress-theme-trito'] },
	},
});
