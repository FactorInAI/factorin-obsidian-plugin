import type { DatabaseAsync, FileStat, RecordStore } from '@hesprs/sync-engine-sdk';
import { testKit } from '@hesprs/sync-engine-sdk/dev';
import { uint8ArrayToText } from '@repo/shared/binary';
import { beforeEach, expect, test } from 'bun:test';
import { openMemoryDB } from 'uni-kv';
import type { SmartMergeStoreMeta, SmartMergeStoreSchema } from '@/index';
import type { MergeOptions } from '@/utils/merge';
import smartMergeResolver from '@/resolver';

const { bytes, file, fs, stream } = testKit;
const memoryDB = openMemoryDB<Record<string, unknown>, Record<string, never>>(
	'smart-merge-resolver-test',
);

const mergeOptions: MergeOptions = {
	conflictAEnd: '</a>',
	conflictAStart: '<a>',
	conflictBEnd: '</b>',
	conflictBStart: '<b>',
	deletionEnd: '</del>',
	deletionStart: '<del>',
};

let db: DatabaseAsync<SmartMergeStoreSchema, SmartMergeStoreMeta>;
let record: RecordStore;

beforeEach(() => {
	memoryDB.clearStores();
	db = memoryDB as unknown as DatabaseAsync<SmartMergeStoreSchema, SmartMergeStoreMeta>;
	record = memoryDB.getStore('record') as unknown as RecordStore;
});

test('resolver should merge when base text exists', async () => {
	const local = fs({ control: { read: async () => bytes('line1-local\nline2\nline3') } });
	const remote = fs({ control: { read: async () => bytes('line1\nline2\nline3-remote') } });
	const resolver = smartMergeResolver(mergeOptions, db, () => 'namespace');
	await db.getStore('base-text-namespace').set('note.md', 'line1\nline2\nline3');

	await resolver({
		key: 'note.md',
		local: file('note.md', { mtime: 2, uid: 'local-old' }) as FileStat,
		localFs: local.fs,
		record,
		remote: file('note.md', { mtime: 3, uid: 'remote-old' }) as FileStat,
		remoteFs: remote.fs,
	});

	expect(uint8ArrayToText(remote.calls.write[0]?.[1])).toBe('line1-local\nline2\nline3-remote');
	expect(uint8ArrayToText(local.calls.write[0]?.[1])).toBe('line1-local\nline2\nline3-remote');
	expect(await record.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'write-uid',
		remote: 'write-uid',
	});
});

test('resolver should fall back when base text is missing', async () => {
	const local = fs({ control: { read: async () => bytes('local wins') } });
	const remote = fs();
	const resolver = smartMergeResolver(mergeOptions, db, () => 'namespace');

	await resolver({
		key: 'note.md',
		local: file('note.md', { mtime: 10, uid: 'local-current' }) as FileStat,
		localFs: local.fs,
		record,
		remote: file('note.md', { mtime: 3, uid: 'remote-old' }) as FileStat,
		remoteFs: remote.fs,
	});

	expect(uint8ArrayToText(remote.calls.write[0]?.[1])).toBe('local wins');
	expect(await record.get('note.md')).toStrictEqual({
		isDir: false,
		local: 'local-current',
		remote: 'write-uid',
	});
});

test('resolver should stream remote fallback for large newer remote files', async () => {
	const local = fs();
	const remote = fs({ control: { readStream: async () => stream(['remote wins']) } });
	const resolver = smartMergeResolver(mergeOptions, db, () => 'namespace');

	await resolver({
		key: 'large.md',
		local: file('large.md', { mtime: 1, uid: 'local-old' }) as FileStat,
		localFs: local.fs,
		record,
		remote: file('large.md', { mtime: 10, size: 2 ** 21, uid: 'remote-current' }) as FileStat,
		remoteFs: remote.fs,
	});

	expect(remote.calls.readStream).toStrictEqual([['large.md', undefined]]);
	expect(local.calls.writeStream).toStrictEqual(['large.md']);
	expect(await record.get('large.md')).toStrictEqual({
		isDir: false,
		local: 'stream-uid',
		remote: 'remote-current',
	});
});
