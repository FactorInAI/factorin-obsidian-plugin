import type { Binary, Stat } from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array } from '@repo/shared/binary';
import type { SignedRequestParams, SigV4Options, UrlStyle } from './sigv4';
import { buildUrlWithQuery, getHeader } from './url';

const PART_SIZE = 5 * 1024 * 1024; // 5 MiB — S3 minimum part size
const MAX_CONCURRENT = 3;

export type MultipartUploadOptions = {
	credentials: SigV4Options;
	endpoint: string;
	bucket: string;
	urlStyle: UrlStyle;
	key: string;
	signedRequest: (params: SignedRequestParams) => Promise<{
		headers: Record<string, string>;
		text: () => string;
	}>;
	stat: (key: string) => Promise<Stat>;
};

function parseUploadId(xml: string): string {
	const match = /<UploadId>(?<id>[^<]+)<\/UploadId>/.exec(xml);
	if (!match?.groups?.id) throw new Error('Failed to parse UploadId from S3 response');
	return match.groups.id;
}

function buildCompleteMultipartXml(parts: Array<{ partNumber: number; etag: string }>): string {
	const inner = parts
		.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${inner}</CompleteMultipartUpload>`;
}

async function uploadPart(
	options: MultipartUploadOptions,
	uploadId: string,
	partNumber: number,
	chunk: Binary,
): Promise<{ partNumber: number; etag: string }> {
	const url = buildUrlWithQuery(
		{
			bucket: options.bucket,
			endpoint: options.endpoint,
			key: options.key,
			urlStyle: options.urlStyle,
		},
		{ partNumber: String(partNumber), uploadId },
	);
	const response = await options.signedRequest({
		body: chunk,
		headers: { 'Content-Type': 'application/octet-stream' },
		method: 'PUT',
		url,
	});
	const etag = getHeader(response.headers, 'etag');
	if (!etag) throw new Error(`S3 multipart: no ETag for part ${partNumber}`);
	return { etag, partNumber };
}

async function abortMultipart(options: MultipartUploadOptions, uploadId: string) {
	const url = buildUrlWithQuery(
		{
			bucket: options.bucket,
			endpoint: options.endpoint,
			key: options.key,
			urlStyle: options.urlStyle,
		},
		{ uploadId },
	);
	await options.signedRequest({ method: 'DELETE', url }).catch(() => {});
}

export async function multipartUpload(
	options: MultipartUploadOptions,
	value: ReadableStream<Binary>,
): Promise<string> {
	const initiatedUrl = buildUrlWithQuery(
		{
			bucket: options.bucket,
			endpoint: options.endpoint,
			key: options.key,
			urlStyle: options.urlStyle,
		},
		{ uploads: '' },
	);
	const initiateResponse = await options.signedRequest({
		headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
		method: 'POST',
		url: initiatedUrl,
	});
	const uploadId = parseUploadId(initiateResponse.text());

	const inFlight = new Set<Promise<unknown>>();
	const parts: Array<{ partNumber: number; etag: string }> = [];
	let nextPartNumber = 1;
	let pending = new Uint8Array(0);
	let failed: Error | undefined;

	const trackPart = (promise: Promise<unknown>) => {
		inFlight.add(promise);
		promise
			.catch(
				(error: unknown) =>
					(failed ??=
						error instanceof Error
							? error
							: new Error(String(error), { cause: error })),
			)
			.finally(() => {
				inFlight.delete(promise);
			})
			.catch(() => {});
	};

	const waitForSlot = async () => {
		while (inFlight.size >= MAX_CONCURRENT) {
			await Promise.race(inFlight);
			if (failed) throw failed;
		}
	};

	const enqueuePart = async (chunk: Binary) => {
		if (failed) throw failed;
		await waitForSlot();
		const partNumber = nextPartNumber++;
		trackPart(
			uploadPart(options, uploadId, partNumber, chunk).then((result) => parts.push(result)),
		);
	};

	const reader = value.getReader();
	try {
		while (true) {
			const { done, value: chunk } = await reader.read();
			if (failed) throw failed;
			if (done) break;
			pending = concatBinary(pending, chunk);
			while (pending.byteLength >= PART_SIZE) {
				const part = pending.slice(0, PART_SIZE);
				pending = pending.slice(PART_SIZE);
				await enqueuePart(part);
			}
		}
		if (pending.byteLength > 0) await enqueuePart(pending);
		await Promise.all(inFlight);
		if (failed) throw failed;

		parts.sort((a, b) => a.partNumber - b.partNumber);
		const completeBody = buildCompleteMultipartXml(parts);
		const completeUrl = buildUrlWithQuery(
			{
				bucket: options.bucket,
				endpoint: options.endpoint,
				key: options.key,
				urlStyle: options.urlStyle,
			},
			{ uploadId },
		);
		const completeResponse = await options.signedRequest({
			body: textToUint8Array(completeBody),
			headers: { 'Content-Type': 'application/xml' },
			method: 'POST',
			url: completeUrl,
		});

		// Parse final ETag from CompleteMultipartUpload response
		const match = /<ETag>(?<etag>[^<]+)<\/ETag>/.exec(completeResponse.text());
		if (match?.groups?.etag) return match.groups.etag;
		const stat = await options.stat(options.key);
		if (!stat.isDir) return stat.uid;
		throw new Error(`S3 multipart upload returned a folder stat for ${options.key}.`);
	} catch (error) {
		await Promise.allSettled(inFlight);
		await abortMultipart(options, uploadId);
		throw error;
	} finally {
		reader.releaseLock();
	}
}

export { PART_SIZE };
