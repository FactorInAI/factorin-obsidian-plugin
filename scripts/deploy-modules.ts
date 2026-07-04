// oxlint-disable import/no-nodejs-modules
import { mkdir } from 'fs/promises';

const ROOT = `${import.meta.dir}/..`;
const SOURCE_MODULES_PATH = `${ROOT}/modules.json`;
const PUBLIC_DIR = `${ROOT}/docs/public`;
const PUBLIC_MODULES_DIR = `${PUBLIC_DIR}/modules`;
const PUBLIC_MODULES_PATH = `${PUBLIC_DIR}/modules.json`;

function basenameFromMain(url: string): string {
	const pathname = new URL(url).pathname;
	const basename = pathname.slice(pathname.lastIndexOf('/') + 1);
	if (!basename) throw new Error(`Invalid module main URL: ${url}`);
	return basename;
}

async function listMatches(pattern: string): Promise<Array<string>> {
	const matches: Array<string> = [];
	const glob = new Bun.Glob(pattern);

	for await (const path of glob.scan({ absolute: true, cwd: ROOT, dot: true }))
		if (!path.includes('/node_modules/')) matches.push(path);

	return matches.sort();
}

async function main(): Promise<void> {
	await mkdir(PUBLIC_MODULES_DIR, { recursive: true });
	await Bun.write(PUBLIC_MODULES_PATH, Bun.file(SOURCE_MODULES_PATH));

	const modules: Array<{ main: string }> = JSON.parse(await Bun.file(SOURCE_MODULES_PATH).text());
	const missing: Array<string> = [];

	for (const module of modules) {
		const basename = basenameFromMain(module.main);
		const [source] = await listMatches(`**/dist/${basename}`);

		if (!source) {
			missing.push(basename);
			console.warn(`Missing dist file for ${basename}`);
			continue;
		}

		await Bun.write(`${PUBLIC_MODULES_DIR}/${basename}`, Bun.file(source));
		console.log(`Copied ${source} -> docs/public/modules/${basename}`);
	}

	if (missing.length > 0)
		console.warn(`Skipped ${missing.length} missing file(s): ${missing.join(', ')}`);
}

try {
	await main();
} catch (error) {
	console.error('Error:', error instanceof Error ? error.message : error);
	throw error;
}

// oxlint-disable-next-line unicorn/require-module-specifiers
export {};
