import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import type { OptimizerInput, OptimizerOutput } from '@/fs';
import { hierarchicalOptimizer, optimizationCompanionWrapper, optimizationWrapper } from '@/fs';

type BatchOptimizer = (input: OptimizerInput) => OptimizerOutput;
const { bytes, deferred, file, flush, fs, stream } = testKit;

function createBatchRecorder() {
	const seen: Array<Array<string>> = [];
	const batchOptimizer: BatchOptimizer = ({ atoms }) => {
		seen.push(atoms.map(({ type }) => type));
		return atoms;
	};

	return { batchOptimizer, seen };
}

test('optimization wrapper forwards queued atoms to batch optimizer', async () => {
	const remote = fs();
	const { batchOptimizer, seen } = createBatchRecorder();
	const wrapper = optimizationWrapper(remote.fs, {
		batchOptimizer,
		thatPool: [],
	});

	const pending = Promise.all([wrapper.delete('folder/'), wrapper.mkdir('notes/')]);

	await flush();
	await pending;

	expect(seen).toStrictEqual([['delete', 'mkdir']]);
	expect(remote.calls.delete).toStrictEqual(['folder/']);
	expect(remote.calls.mkdir).toStrictEqual(['notes/']);
});

test('optimization wrapper forwards pooled write alongside queued ops', async () => {
	const local = fs();
	const remote = fs();
	const remotePool: Array<string> = [];
	const { batchOptimizer, seen } = createBatchRecorder();
	const localWrapper = optimizationWrapper(local.fs, {
		batchOptimizer,
		thatPool: remotePool,
	});
	const remoteWrapper = optimizationCompanionWrapper(
		optimizationWrapper(remote.fs, {
			batchOptimizer: ({ atoms }) => atoms,
			thatPool: [],
		}),
		remotePool,
	);
	const deleteDeferred = deferred<void>();
	const mkdirDeferred = deferred<void>();

	local.control.delete = async () => await deleteDeferred.promise;
	local.control.mkdir = async () => await mkdirDeferred.promise;

	const noteStat = file('folder/note.md', { uid: 'note-uid' });
	await remoteWrapper.read('folder/note.md', noteStat);

	const pendingBatch = Promise.all([
		localWrapper.delete('folder/'),
		localWrapper.mkdir('folder/sub/'),
	]);
	await flush();

	expect(seen).toStrictEqual([['delete', 'mkdir', 'write']]);
	expect(local.calls.write).toStrictEqual([]);

	const pendingWrite = localWrapper.write('folder/note.md', bytes('body'), noteStat);
	deleteDeferred.resolve();
	mkdirDeferred.resolve();

	await Promise.all([pendingBatch, pendingWrite]);

	expect(local.calls.write).toStrictEqual([['folder/note.md', bytes('body'), noteStat]]);
});

test('captures delayed remote reads before local batch flush', async () => {
	const local = fs();
	const remote = fs();
	const remotePool: Array<string> = [];
	const readDeferred = deferred<void>();
	const folderDeferred = deferred<void>();

	local.control.mkdir = async (key) => {
		if (key === 'folder/') await folderDeferred.promise;
	};

	const localWrapper = optimizationWrapper(local.fs, {
		batchOptimizer: hierarchicalOptimizer,
		thatPool: remotePool,
	});
	const optimizedRemote = optimizationWrapper(remote.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thatPool: [],
	});
	const originalRead = optimizedRemote.read.bind(optimizedRemote);
	optimizedRemote.read = async (key: string, stat: ReturnType<typeof file>) => {
		await readDeferred.promise;
		return originalRead(key, stat);
	};
	const remoteWrapper = optimizationCompanionWrapper(optimizedRemote, remotePool);
	const noteStat = file('folder/note.md', { uid: 'note-uid' });

	const pendingDirectories = Promise.all([
		localWrapper.mkdir('folder/'),
		localWrapper.mkdir('other/'),
	]);
	const pendingRead = remoteWrapper.read('folder/note.md', noteStat);

	await flush();
	expect(local.calls.write).toStrictEqual([]);

	readDeferred.resolve();
	await pendingRead;
	const pendingWrite = localWrapper.write('folder/note.md', bytes('body'), noteStat);
	await flush();
	expect(local.calls.write).toStrictEqual([]);

	folderDeferred.resolve();
	await Promise.all([pendingDirectories, pendingWrite]);

	expect(local.calls.write).toStrictEqual([['folder/note.md', bytes('body'), noteStat]]);
});

test('optimization wrapper forwards pooled writeStream alongside queued ops', async () => {
	const local = fs();
	const remote = fs();
	const remotePool: Array<string> = [];
	const { batchOptimizer, seen } = createBatchRecorder();
	const localWrapper = optimizationWrapper(local.fs, {
		batchOptimizer,
		thatPool: remotePool,
	});
	const remoteWrapper = optimizationCompanionWrapper(
		optimizationWrapper(remote.fs, {
			batchOptimizer: ({ atoms }) => atoms,
			thatPool: [],
		}),
		remotePool,
	);
	const deleteDeferred = deferred<void>();
	const mkdirDeferred = deferred<void>();

	local.control.delete = async () => await deleteDeferred.promise;
	local.control.mkdir = async () => await mkdirDeferred.promise;

	const streamStat = file('folder/stream.md', { uid: 'stream-uid' });
	await remoteWrapper.read('folder/stream.md', streamStat);

	const pendingBatch = Promise.all([
		localWrapper.delete('folder/'),
		localWrapper.mkdir('folder/sub/'),
	]);
	await flush();

	expect(seen).toStrictEqual([['delete', 'mkdir', 'write']]);
	expect(local.calls.writeStream).toStrictEqual([]);

	const pendingWriteStream = localWrapper.writeStream(
		'folder/stream.md',
		stream(['body']),
		streamStat,
	);
	deleteDeferred.resolve();
	mkdirDeferred.resolve();

	await Promise.all([pendingBatch, pendingWriteStream]);

	expect(local.calls.writeStream).toStrictEqual([['folder/stream.md', streamStat]]);
});

test('optimization wrapper bypasses batch optimizer for single call', async () => {
	const remote = fs();
	const batchOptimizer: BatchOptimizer = () => {
		throw new Error('batch optimizer should not run');
	};
	const recursiveValues: Array<boolean | undefined> = [];
	const wrapper = optimizationWrapper(remote.fs, {
		batchOptimizer,
		thatPool: [],
	});

	remote.control.mkdir = async (_key, recursive) => {
		recursiveValues.push(recursive);
	};

	await wrapper.mkdir('folder/nested/', true);

	expect(remote.calls.mkdir).toStrictEqual(['folder/nested/']);
	expect(recursiveValues).toStrictEqual([true]);
});
