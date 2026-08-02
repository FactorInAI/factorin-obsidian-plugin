import type { Binary } from '@hesprs/sync-engine-sdk';
import { textToUint8Array } from '@repo/shared/binary';
import { md5 } from 'hash-wasm';

export type UrlStyle = 'virtual-hosted' | 'path';

export type SignedRequestParams = {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: Binary | string;
};

export type SigV4Options = {
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	service: string;
};

type InternalRequest = {
	method: string;
	url: string;
	headers: Record<string, string>;
	body?: Binary | string;
};

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
	);
	return toHex(new Uint8Array(digest));
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
	const keyData = key.buffer.slice(
		key.byteOffset,
		key.byteOffset + key.byteLength,
	) as ArrayBuffer;
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		keyData,
		{ hash: 'SHA-256', name: 'HMAC' },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
	return new Uint8Array(sig);
}

function getAmzDate(date: Date): string {
	return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function getDateStamp(date: Date): string {
	return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Split URI into canonical URI path and query string.
 * Canonical URI: URI-encoded path, each path segment encoded, slashes preserved.
 * Canonical query string: sorted by key, URI-encoded key=value pairs.
 */
function canonicalizeUrl(url: string): { canonicalUri: string; canonicalQuery: string } {
	const parsed = new URL(url);
	const canonicalUri = parsed.pathname
		.split('/')
		.map((segment) => (segment === '' ? '' : encodeURIComponent(segment)))
		.join('/');

	const params = parsed.searchParams;
	const sortedKeys = [...params.keys()].sort();
	const canonicalQuery = sortedKeys
		.map((key) => {
			const values = params.getAll(key);
			values.sort();
			return values
				.map((value) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
				.join('&');
		})
		.filter(Boolean)
		.join('&');

	return { canonicalQuery, canonicalUri };
}

/**
 * Build the canonical headers string and the signed headers list.
 */
function buildCanonicalHeaders(headers: Record<string, string>): {
	canonicalHeaders: string;
	signedHeaders: string;
} {
	const normalized: Array<[string, string]> = [];
	for (const [key, value] of Object.entries(headers))
		normalized.push([key.toLowerCase().trim(), value.trim().replace(/\s+/g, ' ')]);
	normalized.sort(([a], [b]) => a.localeCompare(b));

	const canonicalHeadersStr = normalized.map(([key, value]) => `${key}:${value}\n`).join('');
	const signedHeaders = normalized.map(([key]) => key).join(';');
	return { canonicalHeaders: canonicalHeadersStr, signedHeaders };
}

export async function signRequest(
	params: InternalRequest,
	credentials: SigV4Options,
	date: Date,
): Promise<InternalRequest> {
	const { method, url, headers: rawHeaders, body } = params;
	const host = new URL(url).host;

	const headers: Record<string, string> = { ...rawHeaders };
	headers.host ??= host;
	headers['x-amz-date'] = getAmzDate(date);
	headers['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';

	const { canonicalUri, canonicalQuery } = canonicalizeUrl(url);
	const { canonicalHeaders: canonicalHeadersStr, signedHeaders } = buildCanonicalHeaders(headers);

	const canonicalRequest = [
		method.toUpperCase(),
		canonicalUri,
		canonicalQuery,
		canonicalHeadersStr,
		signedHeaders,
		'UNSIGNED-PAYLOAD',
	].join('\n');

	const dateStamp = getDateStamp(date);
	const amzDate = getAmzDate(date);
	const credentialScope = `${dateStamp}/${credentials.region}/${credentials.service}/aws4_request`;

	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amzDate,
		credentialScope,
		await sha256Hex(encoder.encode(canonicalRequest)),
	].join('\n');

	const kDate = await hmac(encoder.encode(`AWS4${credentials.secretAccessKey}`), dateStamp);
	const kRegion = await hmac(kDate, credentials.region);
	const kService = await hmac(kRegion, credentials.service);
	const kSigning = await hmac(kService, 'aws4_request');
	const signature = toHex(await hmac(kSigning, stringToSign));

	const credential = `${credentials.accessKeyId}/${credentialScope}`;
	headers.authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

	// Ensure body is Binary | string | undefined for the Request abstraction
	return { body, headers, method, url };
}

/**
 * Compute Content-MD5 header value (Base64-encoded MD5 digest).
 * Required by S3 for DeleteObjects.
 */
export async function md5Base64(data: Binary | string): Promise<string> {
	const bytes = typeof data === 'string' ? textToUint8Array(data) : data;
	const hexDigest = await md5(bytes);
	const raw = hexDigest.match(/.{2}/g)!.map((h) => Number.parseInt(h, 16));
	return btoa(String.fromCharCode(...raw));
}
