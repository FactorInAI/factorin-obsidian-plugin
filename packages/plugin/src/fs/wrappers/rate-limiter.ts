import type { requestUrl, RequestUrlParam } from 'obsidian';
import type { RemoteFs, RemoteFsWrapper } from '../interface';
import ApiLimiter from '../utils/api-limiter';
import digOriginal from '../utils/dig-original';

type RateLimiterOptions = {
	maxConcurrency: number;
	minInterval: number;
};

function rateLimiterWrapper(original: RemoteFs, options: RateLimiterOptions): RemoteFs {
	const limiter = new ApiLimiter(options);
	const root = digOriginal(original);
	const request = root.request;

	root.request = limiter.wrap((arg: string | RequestUrlParam) =>
		request(arg),
	) as typeof requestUrl;

	return original;
}

export default rateLimiterWrapper satisfies RemoteFsWrapper<RateLimiterOptions>;
