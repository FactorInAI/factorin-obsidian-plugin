import { obsidianBridge } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';

const dev = process.env.MODE === 'dev';

export default defineConfig({
	clean: !dev,
	dts: false,
	entry: { WebDAV: 'src/index.ts' },
	minify: true,
	outDir: 'dist',
	outExtensions: () => ({ js: '.js' }),
	outputOptions: {
		codeSplitting: false,
	},
	plugins: [obsidianBridge()],
});
