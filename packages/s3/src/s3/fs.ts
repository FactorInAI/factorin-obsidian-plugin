import type {
	Binary,
	FileStat,
	FolderStat,
	ListReporter,
	Request,
	RootFs,
	Stat,
} from '@hesprs/sync-engine-sdk';
import { concatBinary, textToUint8Array } from '@repo/shared/binary';
import { getStatus } from '@repo/shared/get-status';
import { dirname, normalizeChar, normalizeKey, stripEndSlash } from '@repo/shared/path';
import type { SignedRequestParams, SigV4Options, UrlStyle } from './sigv4';
import { PART_SIZE, multipartUpload } from './multipart';
import createS3ReadStream from './read-stream';
import { md5Base64, signRequest } from './sigv4';
import { buildUrl, buildUrlWithQuery, getHeader } from './url';

export type S3FsOptions = {
	accessKeyId: string;
	secretAccessKey: string;
	endpoint: string;
	region: string;
	bucket: string;
	urlStyle: UrlStyle;
	request: Request;
};

export const BATCH_DELETE_MAX_KEYS = 1000;

const READ_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB
const READ_MAX_CONCURRENT = 8;

// S3-compatible XML namespace
const S3_NS = 'http://s3.amazonaws.com/doc/2006-03-01/';

function buildDeleteObjectsXml(keys: Array<string>): string {
	const objects = keys.map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`).join('');
	return `<?xml version="1.0" encoding="UTF-8"?><Delete xmlns="${S3_NS}"><Quiet>true</Quiet>${objects}</Delete>`;
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function parseS3Error(xml: string): string | undefined {
	const match = /<Code>(?<code>[^<]+)<\/Code>/.exec(xml);
	if (match?.groups?.code) {
		const msgMatch = /<Message>(?<message>[^<]+)<\/Message>/.exec(xml);
		return `S3 ${match.groups.code}: ${msgMatch?.groups?.message ?? ''}`;
	}
}

function encodeKey(key: string): string {
	if (key === '/') return '';
	return key
		.split('/')
		.map((segment) => (segment === '' ? '' : encodeURIComponent(segment)))
		.join('/');
}

function getRecursiveKeys(key: string): Array<string> {
	const keys: Array<string> = [];
	while (key !== '/') {
		keys.push(key);
		key = dirname(key);
	}
	return keys.reverse();
}

export default class S3Fs implements RootFs {
	private readonly credentials: SigV4Options;
	private readonly request: Request;
	private readonly endpoint: string;
	private readonly bucket: string;
	private readonly urlStyle: UrlStyle;

	constructor(private readonly options: S3FsOptions) {
		if (!options.request) throw new Error('S3 request is required.');
		this.request = options.request;
		this.credentials = {
			accessKeyId: options.accessKeyId,
			region: options.region,
			secretAccessKey: options.secretAccessKey,
			service: 's3',
		};
		this.endpoint = options.endpoint;
		this.bucket = options.bucket;
		this.urlStyle = options.urlStyle;
	}

	getUid(): string {
		return `s3~${this.endpoint}~${this.bucket}~${this.options.accessKeyId}`;
	}

	private async signedRequest(params: SignedRequestParams): Promise<{
		headers: Record<string, string>;
		text: () => string;
		bytes: () => Binary;
		status: number;
	}> {
		const signed = await signRequest(
			{
				body: params.body,
				headers: params.headers ?? {},
				method: params.method,
				url: params.url,
			},
			this.credentials,
			new Date(),
		);

		const response = await this.request({
			body: signed.body,
			headers: signed.headers,
			method: signed.method,
			url: signed.url,
		});
		return response;
	}

	private async signedRequestOrThrow(params: SignedRequestParams): Promise<{
		headers: Record<string, string>;
		text: () => string;
		bytes: () => Binary;
		status: number;
	}> {
		const response = await this.signedRequest(params);
		if (response.status >= 200 && response.status < 300) return response;

		const body = response.text();
		const s3Error = parseS3Error(body);
		const error = new Error(
			s3Error ?? `S3 request failed: ${response.status} ${params.method} ${params.url}`,
		);
		(error as { status?: number }).status = response.status;
		throw error;
	}

	async read(key: string): Promise<Binary> {
		const response = await this.signedRequestOrThrow({
			method: 'GET',
			url: buildUrl({
				bucket: this.bucket,
				endpoint: this.endpoint,
				key,
				urlStyle: this.urlStyle,
			}),
		});
		return response.bytes();
	}

	async readStream(key: string, { size }: FileStat): Promise<ReadableStream<Binary>> {
		const url = buildUrl({
			bucket: this.bucket,
			endpoint: this.endpoint,
			key,
			urlStyle: this.urlStyle,
		});
		return createS3ReadStream({
			chunkSize: READ_CHUNK_SIZE,
			maxConcurrent: READ_MAX_CONCURRENT,
			requestRange: async (start, endInclusive) => {
				const response = await this.signedRequestOrThrow({
					headers: { Range: `bytes=${start}-${endInclusive}` },
					method: 'GET',
					url,
				});
				return response.bytes();
			},
			size,
		});
	}

	async write(key: string, value: Binary): Promise<string> {
		const response = await this.signedRequestOrThrow({
			body: value,
			headers: { 'Content-Type': 'application/octet-stream' },
			method: 'PUT',
			url: buildUrl({
				bucket: this.bucket,
				endpoint: this.endpoint,
				key,
				urlStyle: this.urlStyle,
			}),
		});
		const etag = getHeader(response.headers, 'etag');
		if (etag) return etag;

		// Fallback: HEAD the object to get its ETag
		const stat = await this.stat(key);
		if (!stat.isDir) return stat.uid;
		throw new Error(`S3 write returned a folder stat for ${key}.`);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): Promise<string> {
		if (stat.size < PART_SIZE) return this.write(key, await collectStreamToBinary(value));
		return multipartUpload(
			{
				bucket: this.bucket,
				credentials: this.credentials,
				endpoint: this.endpoint,
				key,
				signedRequest: (params) => this.signedRequestOrThrow(params),
				stat: (k) => this.stat(k),
				urlStyle: this.urlStyle,
			},
			value,
		);
	}

	async delete(key: string): Promise<void> {
		try {
			await this.signedRequestOrThrow({
				method: 'DELETE',
				url: buildUrl({
					bucket: this.bucket,
					endpoint: this.endpoint,
					key,
					urlStyle: this.urlStyle,
				}),
			});
		} catch (error) {
			if (getStatus(error) === 404) return;
			throw error;
		}
	}

	/**
	 * Batch delete — S3-specific extension method accessed by the optimizer.
	 * Up to 1000 keys per DeleteObjects request.
	 */
	async batchDelete(keys: Array<string>): Promise<void> {
		for (let i = 0; i < keys.length; i += BATCH_DELETE_MAX_KEYS) {
			const batch = keys.slice(i, i + BATCH_DELETE_MAX_KEYS);
			const body = buildDeleteObjectsXml(batch);
			const url = buildUrlWithQuery(
				{ bucket: this.bucket, endpoint: this.endpoint, key: '/', urlStyle: this.urlStyle },
				{ delete: '' },
			);
			await this.signedRequestOrThrow({
				body: textToUint8Array(body),
				headers: {
					'Content-MD5': await md5Base64(body),
					'Content-Type': 'application/xml',
				},
				method: 'POST',
				url,
			});
		}
	}

	async move(oldKey: string, newKey: string): Promise<void> {
		// S3 has no native rename — copy then delete
		const copySource = `${this.bucket}/${encodeKey(oldKey)}`;
		const destUrl = buildUrl({
			bucket: this.bucket,
			endpoint: this.endpoint,
			key: newKey,
			urlStyle: this.urlStyle,
		});
		await this.signedRequestOrThrow({
			headers: {
				'Content-Type': 'application/octet-stream',
				'x-amz-copy-source': copySource,
			},
			method: 'PUT',
			url: destUrl,
		});
		await this.delete(oldKey);
	}

	async mkdir(key: string, recursive = false): Promise<void> {
		const dirKeys = recursive ? getRecursiveKeys(key) : [key];
		for (const dirKey of dirKeys) {
			// S3 has no real folders — create a 0-byte placeholder object
			const url = buildUrl({
				bucket: this.bucket,
				endpoint: this.endpoint,
				key: dirKey,
				urlStyle: this.urlStyle,
			});
			try {
				await this.signedRequestOrThrow({
					body: new Uint8Array(0),
					headers: { 'Content-Type': 'application/octet-stream' },
					method: 'PUT',
					url,
				});
			} catch (error) {
				if (getStatus(error) === 409) continue;
				throw error;
			}
		}
	}

	async stat(key: string): Promise<Stat> {
		if (key === '/') return { isDir: true, key: '/' } satisfies FolderStat;

		// HEAD request to check existence and get metadata
		const url = buildUrl({
			bucket: this.bucket,
			endpoint: this.endpoint,
			key,
			urlStyle: this.urlStyle,
		});
		try {
			const response = await this.signedRequestOrThrow({ method: 'HEAD', url });
			const etag = getHeader(response.headers, 'etag');
			const contentLength = getHeader(response.headers, 'content-length');
			const lastModified = getHeader(response.headers, 'last-modified');

			if (contentLength === '0' && key.endsWith('/'))
				return { isDir: true, key: normalizeKey(normalizeChar(key), true) };

			const mtime = lastModified ? new Date(lastModified).valueOf() : Date.now();
			const size = Number.parseInt(contentLength ?? '0', 10);
			return {
				isDir: false,
				key: normalizeKey(normalizeChar(key), false),
				mtime,
				size,
				uid: etag ?? `${mtime}~${size}`,
			};
		} catch (error) {
			if (getStatus(error) === 404) {
				// Check if it's a folder (common prefix)
				const isDir = await this.existsDir(key);
				if (isDir) return { isDir: true, key: normalizeKey(normalizeChar(key), true) };
			}
			throw error;
		}
	}

	async exists(key: string): Promise<boolean> {
		if (key === '/') return true;
		try {
			await this.stat(key);
			return true;
		} catch (error) {
			if (getStatus(error) === 404)
				// Stat already checks for dir existence in the 404 path,
				// So if we're here, it truly doesn't exist
				return false;
			throw error;
		}
	}

	/**
	 * Check if a directory exists by listing objects with the prefix.
	 */
	private async existsDir(key: string): Promise<boolean> {
		const dirKey = key.endsWith('/') ? key : `${key}/`;
		const url = buildUrlWithQuery(
			{ bucket: this.bucket, endpoint: this.endpoint, key: '/', urlStyle: this.urlStyle },
			{ 'list-type': '2', 'max-keys': '1', prefix: dirKey },
		);
		try {
			const response = await this.signedRequestOrThrow({ method: 'GET', url });
			const xml = response.text();
			// If any <Contents> element exists, the folder has content
			return /<Contents\b/.test(xml);
		} catch {
			return false;
		}
	}

	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const prefix = key === '/' ? '' : key.endsWith('/') ? key : `${key}/`;
		const results: Array<Stat> = [];
		let continuationToken: string | undefined;

		do {
			const query: Record<string, string> = {
				delimiter: '/',
				'list-type': '2',
				prefix,
			};
			if (continuationToken) query['continuation-token'] = continuationToken;

			const url = buildUrlWithQuery(
				{ bucket: this.bucket, endpoint: this.endpoint, key: '/', urlStyle: this.urlStyle },
				query,
			);
			const response = await this.signedRequestOrThrow({ method: 'GET', url });
			const xml = response.text();

			// Parse contents (files)
			const fileRegex = /<Contents\b[^>]*>(?<content>[\s\S]*?)<\/Contents>/g;
			let match: RegExpExecArray | null;
			while ((match = fileRegex.exec(xml)) !== null) {
				const content = match.groups?.content ?? '';
				const keyMatch = /<Key>(?<key>[^<]+)<\/Key>/.exec(content);
				const sizeMatch = /<Size>(?<size>\d+)<\/Size>/.exec(content);
				const etagMatch = /<ETag>(?<etag>[^<]+)<\/ETag>/.exec(content);
				const lastModifiedMatch = /<LastModified>(?<lm>[^<]+)<\/LastModified>/.exec(
					content,
				);
				if (keyMatch?.groups?.key) {
					const fileKey = keyMatch.groups.key;
					if (fileKey === prefix) continue; // Skip the folder placeholder itself
					const stat: Stat = {
						isDir: false,
						key: normalizeKey(normalizeChar(fileKey), false),
						mtime: lastModifiedMatch?.groups?.lm
							? new Date(lastModifiedMatch.groups.lm).valueOf()
							: Date.now(),
						size: Number.parseInt(sizeMatch?.groups?.size ?? '0', 10),
						uid: etagMatch?.groups?.etag ?? '',
					};
					results.push(stat);
					if (
						(await reporter({
							completed: results.length,
							current: stat.key,
							total: 0,
						})) === 'exclude'
					)
						results.pop();
				}
			}

			// Parse common prefixes (subfolders)
			const prefixRegex = /<CommonPrefixes\b[^>]*>(?<content>[\s\S]*?)<\/CommonPrefixes>/g;
			while ((match = prefixRegex.exec(xml)) !== null) {
				const content = match.groups?.content ?? '';
				const prefixMatch = /<Prefix>(?<prefix>[^<]+)<\/Prefix>/.exec(content);
				if (prefixMatch?.groups?.prefix) {
					const dirKey = prefixMatch.groups.prefix;
					const stat: Stat = {
						isDir: true,
						key: normalizeKey(normalizeChar(stripEndSlash(dirKey)), true),
					};
					results.push(stat);
					if (
						(await reporter({
							completed: results.length,
							current: stat.key,
							total: 0,
						})) === 'exclude'
					)
						results.pop();
				}
			}

			// Check for more results
			const truncatedMatch = /<IsTruncated>(?<truncated>true|false)<\/IsTruncated>/.exec(xml);
			const isTruncated = truncatedMatch?.groups?.truncated === 'true';
			const tokenMatch =
				/<NextContinuationToken>(?<token>[^<]+)<\/NextContinuationToken>/.exec(xml);
			continuationToken = isTruncated ? tokenMatch?.groups?.token : undefined;
		} while (continuationToken);

		return results;
	}
}

async function collectStreamToBinary(source: ReadableStream<Binary>): Promise<Binary> {
	const reader = source.getReader();
	const chunks: Array<Binary> = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		return concatBinary(...chunks);
	} finally {
		reader.releaseLock();
	}
}
