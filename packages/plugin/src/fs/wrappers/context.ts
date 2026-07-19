import type { DatabaseSync, StoreSync } from 'uni-kv';
import type { MaybePromise, Progress, Stat, Binary } from '@/types';
import type { WrappedFs, Fs } from '../interface';

type ContextOptions<S extends string, M extends string> = {
	db: DatabaseSync<Record<S, Stat>, Record<M, string>>;
	thisStore: NoInfer<S>;
	thatStore?: NoInfer<S>;
	marker: NoInfer<M>;
};

function getCachedReadSize(store: StoreSync<Stat>, key: string) {
	const stat = store.get(key);
	if (stat === undefined || stat.isDir) return undefined;
	return stat.size;
}

function upsertFileStat(store: StoreSync<Stat>, key: string, uid: string, size: number) {
	store.set(key, { isDir: false, key, mtime: 0, size, uid });
}

function upsertFolderStat(store: StoreSync<Stat>, key: string) {
	store.set(key, { isDir: true, key });
}

function moveCachedStat(store: StoreSync<Stat>, oldKey: string, newKey: string) {
	const stat = store.get(oldKey);
	if (stat === undefined) return;
	store.delete(oldKey);
	store.set(newKey, { ...stat, key: newKey });
}

async function cacheStat(store: StoreSync<Stat>, stat: MaybePromise<Stat>) {
	const resolvedStat = await stat;
	store.set(resolvedStat.key, resolvedStat);
	return resolvedStat;
}

async function replaceStats(store: StoreSync<Stat>, stats: MaybePromise<Array<Stat>>) {
	const resolvedStats = await stats;
	store.clear();
	for (const stat of resolvedStats) store.set(stat.key, stat);
	return resolvedStats;
}

class ContextFs<S extends string, M extends string> implements WrappedFs {
	private readonly thisStore: StoreSync<Stat>;
	private readonly thatStore?: StoreSync<Stat>;

	constructor(
		public readonly original: Fs,
		{ db, thatStore, marker, thisStore }: ContextOptions<S, M>,
	) {
		const uid = original.getUid();
		this.thisStore = db.getStore(thisStore);
		if (thatStore) this.thatStore = db.getStore(thatStore);
		if (db.getMeta(marker) !== uid) {
			this.thisStore.clear();
			db.setMeta(marker, uid);
		}
	}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, size?: number) {
		return this.original.read(key, size ?? getCachedReadSize(this.thisStore, key));
	}

	readStream(key: string, size?: number) {
		return this.original.readStream(key, size ?? getCachedReadSize(this.thisStore, key));
	}

	async write(key: string, value: Binary) {
		const uid = await this.original.write(key, value);
		upsertFileStat(this.thisStore, key, uid, value.byteLength);
		return uid;
	}

	async writeStream(key: string, value: ReadableStream<Binary>, size?: number) {
		if (this.thatStore) size ??= getCachedReadSize(this.thatStore, key);
		const uid = await this.original.writeStream(key, value, size);
		upsertFileStat(this.thisStore, key, uid, 0); // Don't know size
		return uid;
	}

	async delete(key: string) {
		await this.original.delete(key);
		this.thisStore.delete(key);
	}

	async mkdir(key: string, recursive?: boolean) {
		await this.original.mkdir(key, recursive);
		upsertFolderStat(this.thisStore, key);
	}

	async move(oldKey: string, newKey: string) {
		await this.original.move(oldKey, newKey);
		moveCachedStat(this.thisStore, oldKey, newKey);
	}

	stat(key: string) {
		return cacheStat(this.thisStore, this.original.stat(key));
	}

	exists(key: string) {
		return this.original.exists(key);
	}

	list(key: string, progress?: (prog: Progress) => void) {
		return replaceStats(this.thisStore, this.original.list(key, progress));
	}
}

export default function remoteContextWrapper<S extends string, M extends string>(
	original: Fs,
	options: ContextOptions<S, M>,
): WrappedFs {
	return new ContextFs(original, options);
}
