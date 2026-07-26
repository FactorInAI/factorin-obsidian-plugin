import type {
	Binary,
	MaybePromise,
	Progress,
	Stat,
	Fs,
	WrappedFs,
	FileStat,
} from '@hesprs/sync-engine-sdk';
import { normalizeBaseDir } from '@repo/shared/path';

function joinUnifiedKey(baseDir: string, key: string) {
	const joined = `${baseDir}${key}`;
	return joined.endsWith('//') ? joined.slice(0, -1) : joined;
}

function stripBaseDir(baseDir: string, stat: Stat): Stat {
	const originalKey = stat.key;
	if (!originalKey.startsWith(baseDir))
		throw new Error(`Accessed out-of-scope path ${originalKey}`);
	const key = originalKey.slice(baseDir.length);
	return { ...stat, key: key === '' ? '/' : key };
}

function stripBaseDirFromStats(baseDir: string, stats: Array<Stat>) {
	return stats.map((stat) => stripBaseDir(baseDir, stat)).filter((stat) => stat.key !== '/');
}

class BaseDirRemoteFs implements WrappedFs {
	constructor(
		public readonly original: Fs,
		private readonly baseDir: string,
	) {}

	getUid(): string {
		return `${this.original.getUid()}~${this.baseDir}`;
	}

	read(key: string, stat: FileStat) {
		return this.original.read(joinUnifiedKey(this.baseDir, key), stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(joinUnifiedKey(this.baseDir, key), stat);
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.original.write(joinUnifiedKey(this.baseDir, key), value, stat);
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.original.writeStream(joinUnifiedKey(this.baseDir, key), value, stat);
	}

	delete(key: string) {
		return this.original.delete(joinUnifiedKey(this.baseDir, key));
	}

	move(oldKey: string, newKey: string) {
		return this.original.move(
			joinUnifiedKey(this.baseDir, oldKey),
			joinUnifiedKey(this.baseDir, newKey),
		);
	}

	mkdir(key: string, recursive?: boolean) {
		return this.original.mkdir(joinUnifiedKey(this.baseDir, key), recursive);
	}

	async stat(key: string) {
		return Promise.resolve(this.original.stat(joinUnifiedKey(this.baseDir, key))).then((stat) =>
			stripBaseDir(this.baseDir, stat),
		);
	}

	exists(key: string): MaybePromise<boolean> {
		return this.original.exists(joinUnifiedKey(this.baseDir, key));
	}

	async list(key: string, progress?: (prog: Progress) => void) {
		return Promise.resolve(
			this.original.list(joinUnifiedKey(this.baseDir, key), progress),
		).then((stats) => stripBaseDirFromStats(this.baseDir, stats));
	}
}

export default function baseDirWrapper(original: Fs, baseDir: string): WrappedFs {
	const normalizedBaseDir = normalizeBaseDir(baseDir);
	return new BaseDirRemoteFs(original, normalizedBaseDir);
}
