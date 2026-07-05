import type { RequestUrlParam } from 'obsidian';
import type { RemoteFs, RemoteFsWrapper } from '../interface';
import digOriginal from '../utils/dig-original';

type CustomHeadersOptions = Record<string, string>;

function customHeadersWrapper(original: RemoteFs, options: CustomHeadersOptions): RemoteFs {
	const root = digOriginal(original);
	const request = root.request;

	root.request = (arg: string | RequestUrlParam) => {
		if (typeof arg === 'string') arg = { url: arg };
		arg.headers = { ...arg.headers, ...options };
		return request(arg);
	};

	return original;
}

export default customHeadersWrapper satisfies RemoteFsWrapper<CustomHeadersOptions>;
