import { requestUrl } from 'obsidian';
import sha256 from '@/utils/sha-256';

export type General = any;
type GeneralCtor = new (...args: ReadonlyArray<General>) => General;

export default async function loadModule(
	options: { path: string; integrity: string } | { module: string; integrity: string },
) {
	const file = 'module' in options ? options.module : await requestUrl(options.path).text;
	if ((await sha256(file)) !== options.integrity)
		throw new Error('Module has been maliciously modified!');
	const blob = new Blob([file], { type: 'application/javascript' });
	const ctor: GeneralCtor | undefined = (await import(URL.createObjectURL(blob))).default;
	if (typeof ctor !== 'function') throw new Error(`Invalid module!`);
	return ctor;
}
