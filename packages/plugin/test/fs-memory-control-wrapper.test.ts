import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import type { MemoryControlSharedState } from '@/fs';
import type { Binary } from '@/types';
import { memoryControlWrapper } from '@/fs';

const { bytes, deferred, file, fs, flush, stream } = testKit;

const SIXTEEN_MIB = 16 * 1024 * 1024;

function createSharedState(maxMemory: number, memoryConsumption = 0): MemoryControlSharedState {
	return {
		hangingOperations: [],
		maxMemory,
		memoryConsumption,
	};
}

test('memory wrapper delays read when shared budget is exhausted', async () => {
	const state = createSharedState(5);
	const remote = fs();
	const wrapper = memoryControlWrapper(remote.fs, state);

	const heldStat = file('held.md', { size: 5 });
	const delayedStat = file('delayed.md', { size: 4 });
	await wrapper.read('held.md', heldStat);
	const delayedRead = wrapper.read('delayed.md', delayedStat);

	expect(remote.calls.read).toStrictEqual([['held.md', heldStat]]);

	await wrapper.write('release.md', bytes('12345'), file('release.md', { size: 5 }));
	await flush();

	expect(remote.calls.read).toStrictEqual([
		['held.md', heldStat],
		['delayed.md', delayedStat],
	]);
	expect(state.memoryConsumption).toBe(4);
	await delayedRead;
});

test('memory wrapper resumes queued reads after write completes', async () => {
	const state = createSharedState(5);
	const remote = fs();
	const wrapper = memoryControlWrapper(remote.fs, state);

	const heldStat = file('held.md', { size: 5 });
	const firstStat = file('first.md', { size: 2 });
	const secondStat = file('second.md', { size: 3 });
	await wrapper.read('held.md', heldStat);
	const firstQueuedRead = wrapper.read('first.md', firstStat);
	const secondQueuedRead = wrapper.read('second.md', secondStat);

	expect(remote.calls.read).toStrictEqual([['held.md', heldStat]]);

	await wrapper.write('release.md', bytes('12345'), file('release.md', { size: 5 }));
	await flush();

	expect(remote.calls.read).toStrictEqual([
		['held.md', heldStat],
		['first.md', firstStat],
		['second.md', secondStat],
	]);
	await Promise.all([firstQueuedRead, secondQueuedRead]);
});

test('memory wrapper reserves fixed 16 MiB for readStream', async () => {
	const state = createSharedState(SIXTEEN_MIB + 1);
	const remote = fs();
	const wrapper = memoryControlWrapper(remote.fs, state);

	await wrapper.read('held.md', file('held.md', { size: 1 }));
	const largeStat = file('large.md', { size: SIXTEEN_MIB * 2 });
	await wrapper.readStream('large.md', largeStat);

	expect(remote.calls.readStream).toStrictEqual([['large.md', largeStat]]);
	expect(state.memoryConsumption).toBe(SIXTEEN_MIB + 1);
});

test('memory wrapper releases budget only after writeStream fully drains', async () => {
	const state = createSharedState(8);
	const local = fs();
	const wrapper = memoryControlWrapper(local.fs, state);
	const continueDrain = deferred<void>();
	const firstChunkRead = deferred<void>();

	const heldStat = file('held.md', { size: 4 });
	const laterStat = file('later.md', { size: 5 });
	await wrapper.read('held.md', heldStat);
	const pendingRead = wrapper.read('later.md', laterStat);

	local.control.writeStream = async (_key, source) => {
		const reader = source.getReader();
		const firstChunk = await reader.read();
		expect(firstChunk.done).toBe(false);
		firstChunkRead.resolve();

		await continueDrain.promise;

		const secondChunk = await reader.read();
		expect(secondChunk.done).toBe(false);
		const doneChunk = await reader.read();
		expect(doneChunk.done).toBe(true);
		return 'stream-uid';
	};

	const pendingWriteStream = wrapper.writeStream(
		'stream.md',
		stream(['ab', 'cd']),
		file('stream.md'),
	);
	await firstChunkRead.promise;

	await flush();
	expect(local.calls.read).toStrictEqual([['held.md', heldStat]]);
	expect(state.memoryConsumption).toBe(4);

	continueDrain.resolve();
	await pendingWriteStream;
	await flush();

	expect(local.calls.read).toStrictEqual([
		['held.md', heldStat],
		['later.md', laterStat],
	]);
	expect(state.memoryConsumption).toBe(5);
	await pendingRead;
});

test('shared state spans multiple wrappers', async () => {
	const state = createSharedState(6);
	const remote = fs();
	const local = fs();
	const remoteWrapper = memoryControlWrapper(remote.fs, state);
	const secondaryWrapper = memoryControlWrapper(local.fs, state);

	const heldStat = file('held.md', { size: 4 });
	const laterStat = file('later.md', { size: 5 });
	await remoteWrapper.read('held.md', heldStat);
	const pendingSecondaryRead = secondaryWrapper.read('later.md', laterStat);

	await flush();
	expect(local.calls.read).toStrictEqual([]);

	await remoteWrapper.write('release.md', bytes('1234'), file('release.md', { size: 4 }));
	await flush();

	expect(local.calls.read).toStrictEqual([['later.md', laterStat]]);
	await pendingSecondaryRead;
});

test('write failure releases reserved budget', async () => {
	const state = createSharedState(10);
	const remote = fs();
	const wrapper = memoryControlWrapper(remote.fs, state);

	await wrapper.read('held.md', file('held.md', { size: 4 }));
	remote.control.write = async () => {
		throw new Error('write failed');
	};

	expect(
		wrapper.write('failed.md', bytes('1234'), file('failed.md', { size: 4 })),
	).rejects.toThrow('write failed');
	expect(state.memoryConsumption).toBe(0);
});

test('read failure does not leave counter incremented', async () => {
	const state = createSharedState(10);
	const remote = fs();
	const wrapper = memoryControlWrapper(remote.fs, state);

	remote.control.read = async () => {
		throw new Error('read failed');
	};

	expect(wrapper.read('failed.md', file('failed.md', { size: 4 }))).rejects.toThrow(
		'read failed',
	);
	expect(state.memoryConsumption).toBe(0);
});

test('memory wrapper writeStream error releases consumed budget', async () => {
	const state = createSharedState(10);
	const local = fs();
	const wrapper = memoryControlWrapper(local.fs, state);

	await wrapper.read('held.md', file('held.md', { size: 4 }));
	local.control.writeStream = async (_key: string, source: ReadableStream<Binary>) => {
		const reader = source.getReader();
		await reader.read();
		throw new Error('stream failed');
	};

	expect(wrapper.writeStream('failed.md', stream(['1234']), file('failed.md'))).rejects.toThrow(
		'stream failed',
	);
	expect(state.memoryConsumption).toBe(0);
});

test('memory wrapper writeStream cancel releases consumed budget', async () => {
	const state = createSharedState(10);
	const local = fs();
	const wrapper = memoryControlWrapper(local.fs, state);

	await wrapper.read('held.md', file('held.md', { size: 4 }));
	local.control.writeStream = async (_key: string, source: ReadableStream<Binary>) => {
		const reader = source.getReader();
		await reader.read();
		await reader.cancel();
		return 'stream-uid';
	};

	await wrapper.writeStream('cancelled.md', stream(['1234']), file('cancelled.md'));
	expect(state.memoryConsumption).toBe(0);
});

test('memory wrapper keeps hanging pool sorted and resumes maximum possible reads', async () => {
	const state = createSharedState(10);
	const remote = fs();
	const wrapper = memoryControlWrapper(remote.fs, state);

	const heldStat = file('held.md', { size: 10 });
	const sevenStat = file('seven.md', { size: 7 });
	const oneStat = file('one.md', { size: 1 });
	const fourStat = file('four.md', { size: 4 });
	const threeStat = file('three.md', { size: 3 });

	await wrapper.read('held.md', heldStat);
	void wrapper.read('seven.md', sevenStat);
	const oneRead = wrapper.read('one.md', oneStat);
	void wrapper.read('four.md', fourStat);
	const threeRead = wrapper.read('three.md', threeStat);

	await wrapper.write('release.md', bytes('1234'), file('release.md', { size: 4 }));
	await flush();

	expect(remote.calls.read).toStrictEqual([
		['held.md', heldStat],
		['one.md', oneStat],
		['three.md', threeStat],
	]);
	expect(state.hangingOperations.map(({ size }) => size)).toStrictEqual([4, 7]);
	await Promise.all([oneRead, threeRead]);
});
