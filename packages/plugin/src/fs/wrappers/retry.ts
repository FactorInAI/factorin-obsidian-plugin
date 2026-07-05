import type { RequestUrlParam } from 'obsidian';
import { requestUrl } from 'obsidian';
import sleep from '@/utils/sleep';
import type { RemoteFs, RemoteFsWrapper } from '../interface';
import digOriginal from '../utils/dig-original';
import isRetryableError from '../utils/is-retryable-error';

type RetryOptions = {
	maxRetry?: number;
	isRetryable?: (error: unknown) => boolean;
	retryDelayMs?: number;
};

function retryWrapper(original: RemoteFs, options?: RetryOptions): RemoteFs {
	const { maxRetry = 3, isRetryable = isRetryableError, retryDelayMs = 1000 } = options ?? {};
	const root = digOriginal(original);
	const request = root.request;
	root.request = (async (args: string | RequestUrlParam) => {
		for (let i = 0; ; i++)
			try {
				return await request(args);
			} catch (error) {
				if (!isRetryable(error) || i >= maxRetry) throw error;
				await sleep(retryDelayMs);
			}
	}) as typeof requestUrl;
	return original;
}

export default retryWrapper satisfies RemoteFsWrapper<RetryOptions>;
