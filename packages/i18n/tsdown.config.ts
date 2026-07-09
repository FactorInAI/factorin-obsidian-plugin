import { obsidianBridge } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';

const dev = process.env.MODE === 'dev';

export default defineConfig({
	clean: !dev,
	dts: false,
	entry: { 'I18n 简体中文': 'src/zh/index.ts' },
	minify: true,
	outDir: 'dist',
	outExtensions: () => ({ js: '.js' }),
	outputOptions: { codeSplitting: false },
	plugins: [obsidianBridge()],
});
