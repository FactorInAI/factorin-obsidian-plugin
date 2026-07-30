import UnoCSS from '@unocss/postcss';
import postcssMergeRules from 'postcss-merge-rules';
import { defineConfig } from 'tsdown';
import solid from 'unplugin-solid/rolldown';
import man from '../../manifest.json' with { type: 'json' };

const dev = process.env.MODE === 'dev';
const buildingPlugin = process.env.BUILD === 'plugin';

const sharedConfig = defineConfig({
	deps: {
		neverBundle: ['obsidian'],
		onlyBundle: false,
	},
	minify: true,
	outExtensions: () => ({ js: '.js' }),
});

const pluginConfig = defineConfig({
	...sharedConfig,
	clean: !dev,
	copy: [
		{
			from: '../../manifest.json',
			to: 'dist-plugin',
		},
	],
	css: {
		fileName: 'styles.css',
		minify: true,
		postcss: {
			plugins: [UnoCSS(), postcssMergeRules()],
		},
		transformer: 'postcss',
	},
	define: {
		'Bun.env.VERSION': JSON.stringify(man.version),
	},
	dts: false,
	entry: { main: 'src/index.ts' },
	format: 'cjs',
	inputOptions: {
		resolve: {
			aliasFields: [['browser']],
			conditionNames: ['browser'],
			mainFields: ['browser', 'module', 'main'],
		},
	},
	outDir: 'dist-plugin',
	outputOptions: {
		codeSplitting: false,
	},
	platform: 'browser',
	plugins: [solid()],
	target: 'es2024',
});

const sdkConfig = defineConfig({
	...sharedConfig,
	clean: !dev,
	// Factor.In — FORK EDIT: `@factorin/module` is external to the SDK build only.
	// `src/index.ts` imports it, and `src/sdk/index.ts` re-exports `Context`, which is
	// defined in terms of it — so `packages/factorin/src/index.ts` lands in the dts
	// graph. tsgo runs on `packages/plugin/tsconfig.json`, whose `include` is confined
	// to this package, so it emits no declaration for that file and the dts build dies
	// with `tsgo did not generate dts file for packages/factorin/src/index.ts`.
	// Marking it external is the same escape hatch `obsidian` already uses: its types
	// are all over this SDK's public surface precisely because it is never bundled.
	// `dist/index.d.ts` keeps a bare `import … from '@factorin/module'`, which resolves
	// through the workspace link in-repo and is not checked anyway (root tsconfig sets
	// `skipLibCheck`). Deliberately NOT in `sharedConfig`: `pluginConfig` must keep
	// inlining Factor.In into `main.js`, which ships as a single file.
	deps: {
		neverBundle: ['obsidian', '@factorin/module'],
		onlyBundle: false,
	},
	dts: true,
	entry: {
		dev: 'src/sdk/dev.ts',
		index: 'src/sdk/index.ts',
	},
});

export default buildingPlugin ? pluginConfig : sdkConfig;
