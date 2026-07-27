import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import type { OptimizerInput, OptimizerOutput } from '@/fs';
import { optimizationWrapper } from '@/fs';

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
		thisPool: [],
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
	const localPool: Array<string> = [];
	const remotePool: Array<string> = [];
	const { batchOptimizer, seen } = createBatchRecorder();
	const localWrapper = optimizationWrapper(local.fs, {
		batchOptimizer,
		thatPool: remotePool,
		thisPool: localPool,
	});
	const remoteWrapper = optimizationWrapper(remote.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thatPool: localPool,
		thisPool: remotePool,
	});
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

test('optimization wrapper forwards pooled writeStream alongside queued ops', async () => {
	const local = fs();
	const remote = fs();
	const localPool: Array<string> = [];
	const remotePool: Array<string> = [];
	const { batchOptimizer, seen } = createBatchRecorder();
	const localWrapper = optimizationWrapper(local.fs, {
		batchOptimizer,
		thatPool: remotePool,
		thisPool: localPool,
	});
	const remoteWrapper = optimizationWrapper(remote.fs, {
		batchOptimizer: ({ atoms }) => atoms,
		thatPool: localPool,
		thisPool: remotePool,
	});
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
		thisPool: [],
	});

	remote.control.mkdir = async (_key, recursive) => {
		recursiveValues.push(recursive);
	};

	await wrapper.mkdir('folder/nested/', true);

	expect(remote.calls.mkdir).toStrictEqual(['folder/nested/']);
	expect(recursiveValues).toStrictEqual([true]);
});
