import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import { rateLimiterMiddleware } from '@/fs';

const { bytes, deferred, flush, request } = testKit;

test('rate limiter middleware queues second request until first resolves', async () => {
	const firstResponse = {
		bytes: () => bytes('first'),
		headers: {},
		json: () => {},
		status: 200,
		text: () => 'first',
	};
	const secondResponse = {
		bytes: () => bytes('second'),
		headers: {},
		json: () => {},
		status: 200,
		text: () => 'second',
	};
	const firstDeferred = deferred<typeof firstResponse>();
	const harness = request(async (params) => {
		const url = typeof params === 'string' ? params : params.url;
		if (url === 'first.md') return await firstDeferred.promise;
		return secondResponse;
	});
	const wrapped = rateLimiterMiddleware(harness.request, { maxConcurrency: 1, minInterval: 0 });

	const firstPending = wrapped({ url: 'first.md' });
	const secondPending = wrapped({ url: 'second.md' });

	await flush();
	expect(harness.calls).toStrictEqual([{ url: 'first.md' }]);

	firstDeferred.resolve(firstResponse);

	expect(firstPending).resolves.toStrictEqual(firstResponse);
	expect(secondPending).resolves.toStrictEqual(secondResponse);
	expect(harness.calls).toStrictEqual([{ url: 'first.md' }, { url: 'second.md' }]);
});
