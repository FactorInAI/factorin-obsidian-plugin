import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import { cancellationWrapper } from '@/fs';
import { syncCancelledError } from '@/sync';

const { bytes, deferred, flush, fs, stream } = testKit;

test('cancellation wrapper rejects read before delegation', async () => {
	const harness = fs();
	const wrapper = cancellationWrapper(harness.fs, () => true);

	expect(wrapper.read('note.md')).rejects.toBe(syncCancelledError);
	expect(harness.calls.read).toStrictEqual([]);
});

test('cancellation wrapper rejects write after resolution when cancelled', async () => {
	let cancelled = false;
	const writeDeferred = deferred<string>();
	const harness = fs({ control: { write: async () => await writeDeferred.promise } });
	const wrapper = cancellationWrapper(harness.fs, () => cancelled);

	const pending = wrapper.write('note.md', bytes('1234'));
	await flush();
	cancelled = true;
	writeDeferred.resolve('write-uid');

	expect(pending).rejects.toBe(syncCancelledError);
	expect(harness.calls.write).toStrictEqual([['note.md', bytes('1234')]]);
});

test('cancellation wrapper rejects writeStream after resolution when cancelled', async () => {
	let cancelled = false;
	const writeDeferred = deferred<string>();
	const harness = fs({ control: { writeStream: async () => await writeDeferred.promise } });
	const wrapper = cancellationWrapper(harness.fs, () => cancelled);

	const pending = wrapper.writeStream('stream.md', stream(['1234']));
	await flush();
	cancelled = true;
	writeDeferred.resolve('stream-uid');

	expect(pending).rejects.toBe(syncCancelledError);
	expect(harness.calls.writeStream).toStrictEqual(['stream.md']);
});
