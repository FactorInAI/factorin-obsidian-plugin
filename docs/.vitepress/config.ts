// oxlint-disable import/no-nodejs-modules
import type { ThemeConfig } from 'vitepress-theme-trito';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitepress';

function p(path: string) {
	return resolve(dirname(fileURLToPath(import.meta.url)), '..', path);
}

export default defineConfig<ThemeConfig>({
	cleanUrls: true,
	head: [
		['link', { href: '/favicon.ico', rel: 'icon' }],
		['meta', { content: 'dark light', name: 'color-scheme' }],
	],
	lastUpdated: true,
	locales: {
		root: {
			description: 'Next-generation syncing plugin for Obsidian.',
			label: 'English',
			lang: 'en',
			themeConfig: {
				editLink: 'https://github.com/hesprs/sync-engine/edit/main/docs/src/pages/:path',
				footer: {
					copyright: 'Copyright © 2026 Hēsperus',
					message:
						'All content licensed under the <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> License.',
				},
				nav: [{ link: '/', text: 'Home' }],
			},
			title: 'Sync Engine',
		},
	},
	markdown: { image: { lazyLoading: true } },
	outDir: p('dist'),
	rewrites: { 'en/:rest*': ':rest*' },
	sitemap: { hostname: 'https://sync.consensia.cc' },
	srcDir: p('src/pages/'),
	themeConfig: {
		aside: 'left',
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
		publicDir: p('public'),
		resolve: { alias: { '@': p('src') } },
		ssr: { noExternal: ['vitepress-theme-trito'] },
	},
});
