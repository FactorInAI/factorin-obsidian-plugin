import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import { ref } from 'synthkernel';
import { cancellationMiddleware } from '@/fs';

const { bytes, deferred, flush, request } = testKit;

const response = {
	bytes: () => bytes('ok'),
	headers: {},
	json: () => {},
	status: 200,
	text: () => 'ok',
};

test('cancellation middleware rejects before dispatch', async () => {
	const harness = request(async () => response);
	const wrapped = cancellationMiddleware(harness.request, ref(true));

	expect(wrapped({ url: 'note.md' })).rejects.toMatchObject({
		message: 'Sync cancelled by user.',
	});
	expect(harness.calls).toStrictEqual([]);
});

test('cancellation middleware rejects after in-flight response resolves when cancelled', async () => {
	const isCancelled = ref(false);
	const responseDeferred = deferred<typeof response>();
	const harness = request(async () => await responseDeferred.promise);
	const wrapped = cancellationMiddleware(harness.request, isCancelled);

	const pending = wrapped({ url: 'note.md' });
	await flush();
	isCancelled(true);
	responseDeferred.resolve(response);

	expect(pending).rejects.toMatchObject({
		message: 'Aborted',
		name: 'AbortError',
	});
	expect(harness.calls).toStrictEqual([{ url: 'note.md' }]);
});
