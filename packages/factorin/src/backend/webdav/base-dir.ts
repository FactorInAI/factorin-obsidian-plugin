import { normalizeBaseDir } from '@repo/shared/path';
import type { Binary, MaybePromise, Stat, Fs, WrappedFs, FileStat, ListReporter } from './types';

function joinUnifiedKey(baseDir: string, key: string) {
	const joined = `${baseDir}${key}`;
	return joined.endsWith('//') ? joined.slice(0, -1) : joined;
}

function stripBaseDir(baseDir: string, path: string) {
	if (!path.startsWith(baseDir)) throw new Error(`Accessed out-of-scope path "${path}"`);
	const key = path.slice(baseDir.length);
	return key === '' ? '/' : key;
}

function stripBaseDirFromStat(baseDir: string, stat: Stat) {
	const key = stripBaseDir(baseDir, stat.key);
	return Object.assign(stat, { key });
}

function stripBaseDirFromStats(baseDir: string, stats: Array<Stat>) {
	return stats
		.map((stat) => stripBaseDirFromStat(baseDir, stat))
		.filter((stat) => stat.key !== '/');
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

	stat(key: string) {
		return Promise.resolve(this.original.stat(joinUnifiedKey(this.baseDir, key))).then((stat) =>
			stripBaseDirFromStat(this.baseDir, stat),
		);
	}

	exists(key: string): MaybePromise<boolean> {
		return this.original.exists(joinUnifiedKey(this.baseDir, key));
	}

	list(key: string, reporter: ListReporter) {
		return Promise.resolve(
			this.original.list(joinUnifiedKey(this.baseDir, key), (progress) =>
				reporter(
					Object.assign(progress, {
						current: stripBaseDir(this.baseDir, progress.current),
					}),
				),
			),
		).then((stats) => stripBaseDirFromStats(this.baseDir, stats));
	}
}

export default function baseDirWrapper(original: Fs, baseDir: string): WrappedFs {
	const normalizedBaseDir = normalizeBaseDir(baseDir);
	return new BaseDirRemoteFs(original, normalizedBaseDir);
}
