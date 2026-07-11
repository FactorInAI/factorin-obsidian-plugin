import { expect, test } from 'bun:test';
import { cancellationMiddleware } from '@/fs';
import { testKit } from '@/sdk/dev';
import { syncCancelledError } from '@/sync';

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
	const wrapped = cancellationMiddleware(harness.request, () => true);

	expect(wrapped({ url: 'note.md' })).rejects.toBe(syncCancelledError);
	expect(harness.calls).toStrictEqual([]);
});

test('cancellation middleware rejects after in-flight response resolves when cancelled', async () => {
	let cancelled = false;
	const responseDeferred = deferred<typeof response>();
	const harness = request(async () => await responseDeferred.promise);
	const wrapped = cancellationMiddleware(harness.request, () => cancelled);

	const pending = wrapped({ url: 'note.md' });
	await flush();
	cancelled = true;
	responseDeferred.resolve(response);

	expect(pending).rejects.toBe(syncCancelledError);
	expect(harness.calls).toStrictEqual([{ url: 'note.md' }]);
});
