import { obsidianBridge } from '@hesprs/sync-engine-sdk/dev';
import { defineConfig } from 'tsdown';

const dev = process.env.MODE === 'dev';

/**
 * Standalone module build, identical in shape to `packages/webdav`.
 *
 * The branded plugin does **not** consume this output: Factor.In ships as an
 * *internal* module, so `packages/plugin` imports `@factorin/module` and bundles
 * it from source (see this package's README). This config exists so the package
 * stays a valid, self-contained Sync Engine module — the property that lets it be
 * distributed as a downloadable module instead, with no source change.
 */
export default defineConfig({
	clean: !dev,
	dts: false,
	entry: { factorin: 'src/index.ts' },
	minify: true,
	outDir: 'dist',
	outExtensions: () => ({ js: '.js' }),
	outputOptions: {
		codeSplitting: false,
	},
	plugins: [obsidianBridge()],
});
