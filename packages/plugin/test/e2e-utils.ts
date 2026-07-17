import type { General } from '@/types';

type GeneralCtor = new (...args: ReadonlyArray<General>) => General;

export default async function loadModule(name: string, path: string) {
	const ctor: GeneralCtor | undefined = (await import(path)).default;
	if (!ctor) throw new Error(`"${name}" is not a valid module!`);
	return ctor;
}
