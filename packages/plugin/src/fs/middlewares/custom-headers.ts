import type { Request } from '@/modules/Registrar';

type CustomHeadersOptions = Record<string, string>;

export default function customHeadersMiddleware(
	request: Request,
	options: CustomHeadersOptions,
): Request {
	return (arg) => {
		if (typeof arg === 'string') arg = { url: arg };
		arg.headers = { ...arg.headers, ...options };
		return request(arg);
	};
}
