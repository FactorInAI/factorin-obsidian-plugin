import { expect, spyOn, test } from 'bun:test';
import { retryMiddleware } from '@/fs';
import { testKit } from '@/sdk/dev';
// oxlint-disable-next-line import/no-namespace
import * as sleepModule from '@/utils/sleep';

const { bytes, request } = testKit;
const sleepSpy = spyOn(sleepModule, 'default').mockImplementation(() => Promise.resolve());

test('retry middleware retries retryable request and waits between attempts', async () => {
	sleepSpy.mockClear();
	const response = {
		bytes: () => bytes('ok'),
		headers: {},
		json: () => {},
		status: 200,
		text: () => 'ok',
	};
	let attempts = 0;
	const harness = request(async () => {
		attempts += 1;
		if (attempts < 3) throw { res: { status: 503 } };
		return response;
	});
	const wrapped = retryMiddleware(harness.request, { maxRetry: 2, retryDelayMs: 25 });

	expect(wrapped({ url: 'retry.md' })).resolves.toStrictEqual(response);
	expect(harness.calls).toStrictEqual([
		{ url: 'retry.md' },
		{ url: 'retry.md' },
		{ url: 'retry.md' },
	]);
	expect(sleepSpy).toHaveBeenCalledTimes(2);
	expect(sleepSpy).toHaveBeenNthCalledWith(1, 25);
	expect(sleepSpy).toHaveBeenNthCalledWith(2, 25);
});

test('retry middleware stops on non-retryable error', async () => {
	sleepSpy.mockClear();
	const harness = request(async () => {
		throw { res: { status: 404 } };
	});
	const wrapped = retryMiddleware(harness.request, {
		isRetryable: () => false,
		maxRetry: 3,
		retryDelayMs: 25,
	});

	expect(wrapped({ url: 'missing.md' })).rejects.toStrictEqual({ res: { status: 404 } });
	expect(harness.calls).toStrictEqual([{ url: 'missing.md' }]);
	expect(sleepSpy).not.toHaveBeenCalled();
});
