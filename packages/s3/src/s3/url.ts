import type { UrlStyle } from './sigv4';

export type UrlOptions = {
	endpoint: string;
	bucket: string;
	key: string;
	urlStyle: UrlStyle;
};

function normalizeEndpoint(endpoint: string): string {
	return endpoint.replace(/\/+$/, '');
}

/**
 * Build the request URL for an S3 object key.
 *
 * - virtual-hosted: `https://<bucket>.<endpoint>/<key>`
 * - path-style:     `https://<endpoint>/<bucket>/<key>`
 *
 * The endpoint should be a base URL like `https://s3.us-east-1.amazonaws.com`.
 */
export function buildUrl(options: UrlOptions): string {
	const { endpoint, bucket, key, urlStyle } = options;
	const base = normalizeEndpoint(endpoint);
	const encodedPath = key
		.split('/')
		.map((segment) => (segment === '' ? '' : encodeURIComponent(segment)))
		.join('/');

	if (urlStyle === 'virtual-hosted') {
		const parsed = new URL(base);
		return `${parsed.protocol}//${bucket}.${parsed.host}${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
	}
	return `${base}/${bucket}${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
}

/**
 * Build the request URL with query parameters.
 * Query parameters are sorted alphabetically (URL constructor handles this).
 */
export function buildUrlWithQuery(options: UrlOptions, query: Record<string, string>): string {
	const baseUrl = buildUrl(options);
	const parsed = new URL(baseUrl);
	for (const [k, v] of Object.entries(query)) parsed.searchParams.set(k, v);
	return parsed.toString();
}

export function getHeader(
	headers: Record<string, string | undefined>,
	name: string,
): string | undefined {
	const entry = Object.entries(headers).find(
		([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
}
