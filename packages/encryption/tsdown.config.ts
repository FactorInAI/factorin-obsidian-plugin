import { obsidianBridge } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';

const dev = process.env.MODE === 'dev';

export default defineConfig({
	clean: !dev,
	dts: false,
	entry: { encryption: 'src/index.ts' },
	inputOptions: {
		resolve: {
			alias: {
				'hash-wasm': 'hash-wasm/dist/index.esm.js',
			},
		},
	},
	minify: true,
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	plugins: [obsidianBridge()],
});
