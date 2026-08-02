import type { CheckConnectionResult, Request } from '@hesprs/sync-engine-sdk';
import type { SigV4Options, UrlStyle } from './sigv4';
import { signRequest } from './sigv4';
import { buildUrlWithQuery } from './url';

export type S3ConnectionOptions = {
	accessKeyId: string;
	secretAccessKey: string;
	endpoint: string;
	region: string;
	bucket: string;
	urlStyle: UrlStyle;
};

/**
 * Test S3 connectivity by listing objects (max-keys=1).
 * A successful 2xx response means the credentials, endpoint, and bucket are all valid.
 */
export async function checkConnection(
	options: S3ConnectionOptions,
	request: Request,
): Promise<CheckConnectionResult> {
	try {
		const url = buildUrlWithQuery(
			{
				bucket: options.bucket,
				endpoint: options.endpoint,
				key: '/',
				urlStyle: options.urlStyle,
			},
			{ 'list-type': '2', 'max-keys': '1' },
		);
		const date = new Date();
		const credentials: SigV4Options = {
			accessKeyId: options.accessKeyId,
			region: options.region,
			secretAccessKey: options.secretAccessKey,
			service: 's3',
		};
		const signed = await signRequest({ headers: {}, method: 'GET', url }, credentials, date);
		const response = await request({
			body: signed.body,
			headers: signed.headers,
			method: signed.method,
			url: signed.url,
		});
		if (response.status >= 200 && response.status < 300) return { success: true } as const;
		return {
			reason: `HTTP ${response.status}`,
			success: false,
		} as const;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return { reason: errorMessage, success: false } as const;
	}
}
