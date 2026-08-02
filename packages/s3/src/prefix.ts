import type {
	Binary,
	MaybePromise,
	Stat,
	Fs,
	WrappedFs,
	FileStat,
	ListReporter,
} from '@hesprs/sync-engine-sdk';
import { normalizeBaseDir } from '@repo/shared/path';

function joinKey(prefix: string, key: string): string {
	const joined = `${prefix}${key}`;
	return joined.endsWith('//') ? joined.slice(0, -1) : joined;
}

function stripKey(prefix: string, path: string): string {
	if (!path.startsWith(prefix)) throw new Error(`Accessed out-of-scope path "${path}"`);
	const key = path.slice(prefix.length);
	return key === '' ? '/' : key;
}

function stripKeyFromStat(prefix: string, stat: Stat): Stat {
	return Object.assign(stat, { key: stripKey(prefix, stat.key) });
}

function stripKeyFromStats(prefix: string, stats: Array<Stat>): Array<Stat> {
	return stats.map((stat) => stripKeyFromStat(prefix, stat)).filter((stat) => stat.key !== '/');
}

class PrefixFs implements WrappedFs {
	constructor(
		public readonly original: Fs,
		private readonly prefix: string,
	) {}

	getUid(): string {
		return `${this.original.getUid()}~${this.prefix}`;
	}

	read(key: string, stat: FileStat) {
		return this.original.read(joinKey(this.prefix, key), stat);
	}

	readStream(key: string, stat: FileStat) {
		return this.original.readStream(joinKey(this.prefix, key), stat);
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.original.write(joinKey(this.prefix, key), value, stat);
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		return this.original.writeStream(joinKey(this.prefix, key), value, stat);
	}

	delete(key: string) {
		return this.original.delete(joinKey(this.prefix, key));
	}

	move(oldKey: string, newKey: string) {
		return this.original.move(joinKey(this.prefix, oldKey), joinKey(this.prefix, newKey));
	}

	mkdir(key: string, recursive?: boolean) {
		return this.original.mkdir(joinKey(this.prefix, key), recursive);
	}

	stat(key: string) {
		return Promise.resolve(this.original.stat(joinKey(this.prefix, key))).then((stat) =>
			stripKeyFromStat(this.prefix, stat),
		);
	}

	exists(key: string): MaybePromise<boolean> {
		return this.original.exists(joinKey(this.prefix, key));
	}

	list(key: string, reporter: ListReporter) {
		return Promise.resolve(
			this.original.list(joinKey(this.prefix, key), (progress) =>
				reporter(
					Object.assign(progress, {
						current: stripKey(this.prefix, progress.current),
					}),
				),
			),
		).then((stats) => stripKeyFromStats(this.prefix, stats));
	}
}

export default function prefixWrapper(original: Fs, prefix: string): WrappedFs {
	const normalizedPrefix = normalizeBaseDir(prefix);
	return new PrefixFs(original, normalizedPrefix);
}
