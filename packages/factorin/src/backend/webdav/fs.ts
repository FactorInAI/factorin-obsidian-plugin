import { concatBinary } from '@repo/shared/binary';
import { getStatus } from '@repo/shared/get-status';
import {
	dirname,
	normalizeChar,
	normalizeKey,
	normalizeUrl,
	stripEndSlash,
} from '@repo/shared/path';
import type { Binary, FileStat, FolderStat, ListReporter, Request, RootFs, Stat } from './types';
import writeNextcloudChunkedUpload from './chunked-upload';
import parseXML from './parse-xml';
import createWebDAVReadStream from './read-stream';
import { buildUrl, getAuthorization, getFileUid, getHeader } from './utils';

export type WebdavFsOptions = {
	endpoint: string;
	username: string;
	password: string;
	chunkedUpload?: boolean;
	depthInfinity?: boolean;
	request: Request;
};

type WebDAVPropValue = string | { '#text'?: string } | undefined;

type WebDAVProp = {
	displayname?: WebDAVPropValue;
	getcontentlength?: WebDAVPropValue;
	getetag?: WebDAVPropValue;
	getlastmodified?: WebDAVPropValue;
	resourcetype?: { collection?: unknown } | string;
};

type WebDAVPropstat = {
	prop?: WebDAVProp;
	status?: string;
};

type WebDAVResponseItem = {
	href: string;
	propstat?: WebDAVPropstat | Array<WebDAVPropstat>;
};

type WebDAVMultistatus = {
	multistatus: {
		response: WebDAVResponseItem | Array<WebDAVResponseItem>;
	};
};

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <displayname/>
    <resourcetype/>
    <getlastmodified/>
    <getcontentlength/>
    <getetag/>
  </prop>
</propfind>`;
const READ_CHUNK_SIZE = 2 * 1024 * 1024;
const READ_MAX_CONCURRENT = 8;
const MAX_REDIRECTS = 5;

function getDavText(value: WebDAVPropValue) {
	if (typeof value === 'string') return value;
	if (!value || typeof value !== 'object') return undefined;
	const text = value['#text'];
	return typeof text === 'string' ? text : undefined;
}

function isCollectionResource(resourcetype: WebDAVProp['resourcetype']) {
	if (!resourcetype) return false;
	if (typeof resourcetype === 'string') return resourcetype.toLowerCase() === 'collection';
	return 'collection' in resourcetype;
}

function isSuccessStatus(status: string | undefined) {
	if (!status) return true;
	const match = /\s(?<code>\d{3})(?:\s|$)/.exec(status);
	if (!match) return false;
	const code = Number.parseInt(match.groups?.code ?? '', 10);
	return code >= 200 && code < 300;
}

function asArray<T>(value: T | Array<T>) {
	return Array.isArray(value) ? value : [value];
}

function getRecursiveKeys(key: string) {
	const keys: Array<string> = [];
	while (key !== '/') {
		keys.push(key);
		key = dirname(key);
	}
	return keys.reverse();
}

function stripEndpoint(endpoint: string, href: string) {
	if (href.startsWith(endpoint)) href = href.slice(endpoint.length);
	else {
		const pathname = new URL(endpoint).pathname;
		if (pathname !== '/' && href.startsWith(pathname)) href = href.slice(pathname.length);
	}
	return href.slice(1);
}

function toKey(href: string, endpoint: string, isDir: boolean) {
	const stripped = stripEndpoint(endpoint, href);
	if (!stripped) return '/';
	return normalizeKey(normalizeChar(stripped), isDir);
}

function toStat(endpoint: string, { propstat, href }: WebDAVResponseItem): Stat | undefined {
	const propstats = propstat ? asArray(propstat) : [];
	const validPropstat = propstats.find(({ status, prop }) => isSuccessStatus(status) && prop);
	if (!validPropstat?.prop) return;

	const isDir = isCollectionResource(validPropstat.prop.resourcetype);
	const key = toKey(href, endpoint, isDir);
	if (isDir) return { isDir: true, key };

	const mtime = new Date(getDavText(validPropstat.prop.getlastmodified) ?? '').valueOf();
	const size = Number.parseInt(getDavText(validPropstat.prop.getcontentlength) ?? '0', 10);
	const uid = getDavText(validPropstat.prop.getetag) ?? `${mtime}~${size}`;

	return { isDir: false, key, mtime, size, uid };
}

function extractNextLink(linkHeader: string): string | undefined {
	const matches = /<(?<href>[^>]+)>;\s*rel="next"/.exec(linkHeader);
	return matches?.groups?.href;
}

type PropfindPayload = {
	depth?: '0' | '1' | 'infinity';
	request: Request;
	auth: string;
} & ({ key: string; endpoint: string } | { url: string });

async function propfind(args: PropfindPayload) {
	const { request, depth = '0', auth } = args;
	const url = 'url' in args ? args.url : buildUrl(args.endpoint, args.key);
	const response = await request({
		body: PROPFIND_BODY,
		headers: { Authorization: auth, 'Content-Type': 'application/xml', Depth: depth },
		method: 'PROPFIND',
		url,
	});
	const parsed = parseXML<WebDAVMultistatus>(response.text());
	const items = asArray(parsed.multistatus.response);

	// Handle pagination
	const linkHeader = response.headers.link || response.headers.Link;
	if (!linkHeader) return items;
	const nextLink = extractNextLink(linkHeader);
	if (!nextLink) return items;
	items.push(...(await propfind({ auth, depth, request, url: new URL(nextLink).toString() })));
	return items;
}

function isTargetItem(key: string, endpoint: string, item: WebDAVResponseItem) {
	return normalizeChar(stripEndSlash(stripEndpoint(endpoint, item.href))) === stripEndSlash(key);
}

function toDescendantStats(key: string, endpoint: string, items: Array<WebDAVResponseItem>) {
	return items
		.filter((item) => !isTargetItem(key, endpoint, item))
		.map((item) => toStat(endpoint, item))
		.filter((item): item is Stat => item !== undefined);
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

export default class WebdavFs implements RootFs {
	private readonly auth: string;
	private readonly endpoint: string;
	private readonly request: Request;

	constructor(private readonly options: WebdavFsOptions) {
		if (!options.request) throw new Error('WebDAV request is required.');
		this.request = options.request;
		this.auth = getAuthorization(options.username, options.password);
		this.endpoint = normalizeUrl(options.endpoint);
	}

	getUid() {
		return `webdav~${this.endpoint}~${this.options.username}`;
	}

	/**
	 * GET that follows redirects itself instead of relying on `requestUrl`, which
	 * does not follow 3xx and simply returns the redirect response. Our backend can
	 * answer a GET with a 302 to a signed blob URL on another host (e.g. git-LFS
	 * objects served from S3); the signed URL authenticates via its query string, so
	 * we drop our `Authorization` header once the host changes — forwarding Basic
	 * credentials cross-host both leaks them and is rejected by S3 as a conflicting
	 * auth mechanism. `Range` and any other caller headers are preserved across hops.
	 */
	private async getFollowingRedirects(url: string, extraHeaders: Record<string, string> = {}) {
		let target = url;
		let authorized = true;

		for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
			const headers: Record<string, string> = { ...extraHeaders };
			if (authorized) headers.Authorization = this.auth;

			const response = await this.request({
				headers,
				method: 'GET',
				throw: false,
				url: target,
			});

			if (response.status >= 300 && response.status < 400) {
				const location = getHeader(response.headers, 'location');
				if (!location)
					throw new Error(
						`WebDAV GET ${url} returned ${response.status} without a Location header.`,
					);
				const next = new URL(location, target);
				authorized &&= next.host === new URL(target).host;
				target = next.toString();
				continue;
			}

			if (response.status >= 400)
				throw new Error(`WebDAV GET ${url} failed with status ${response.status}.`);

			return response;
		}

		throw new Error(`WebDAV GET ${url} exceeded ${MAX_REDIRECTS} redirects.`);
	}

	async read(key: string) {
		const response = await this.getFollowingRedirects(buildUrl(this.endpoint, key));

		return response.bytes();
	}

	async readStream(key: string, { size }: FileStat) {
		return createWebDAVReadStream({
			chunkSize: READ_CHUNK_SIZE,
			maxConcurrent: READ_MAX_CONCURRENT,
			requestRange: async (start, endInclusive) => {
				const response = await this.getFollowingRedirects(buildUrl(this.endpoint, key), {
					Range: `bytes=${start}-${endInclusive}`,
				});

				return response.bytes();
			},
			size,
		});
	}

	async write(key: string, value: Binary) {
		const response = await this.request({
			body: value,
			headers: { Authorization: this.auth },
			method: 'PUT',
			url: buildUrl(this.endpoint, key),
		});

		const etag = getHeader(response.headers, 'etag');
		if (etag) return etag;

		return getFileUid(await this.stat(key), key);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, { size }: FileStat) {
		if (this.options.chunkedUpload)
			return await writeNextcloudChunkedUpload(
				{
					auth: this.auth,
					endpoint: this.endpoint,
					request: this.request,
					stat: async (targetKey) => await this.stat(targetKey),
					username: this.options.username,
				},
				key,
				value,
				size,
			);
		return await this.write(key, await collectStreamToBinary(value));
	}

	async delete(key: string) {
		try {
			await this.request({
				headers: { Authorization: this.auth },
				method: 'DELETE',
				url: buildUrl(this.endpoint, key),
			});
		} catch (error) {
			const status =
				error && typeof error === 'object' && 'res' in error
					? (error as { res?: { status?: number } }).res?.status
					: undefined;
			if (status === 404) return;
			throw error;
		}
	}

	async move(oldKey: string, newKey: string) {
		await this.request({
			headers: { Authorization: this.auth, Destination: buildUrl(this.endpoint, newKey) },
			method: 'MOVE',
			url: buildUrl(this.endpoint, oldKey),
		});
	}

	async mkdir(key: string, recursive = false) {
		const directoryKeys = recursive ? getRecursiveKeys(key) : [key];

		for (const directoryKey of directoryKeys)
			try {
				await this.request({
					headers: { Authorization: this.auth },
					method: 'MKCOL',
					url: buildUrl(this.endpoint, directoryKey),
				});
			} catch (error) {
				if (getStatus(error) === 405) continue;
				throw error;
			}
	}

	async stat(key: string): Promise<Stat> {
		if (key === '/') return { isDir: true, key: '/' } satisfies FolderStat;

		const { auth, endpoint, request } = this;
		const items = await propfind({ auth, endpoint, key, request });
		const item = items.find((candidate) => isTargetItem(key, endpoint, candidate));
		if (!item) throw new Error(`WebDAV stat not found for ${key}`);

		const stat = toStat(endpoint, item);
		if (!stat) throw new Error(`WebDAV stat not found for ${key}`);
		return stat;
	}

	async exists(key: string): Promise<boolean> {
		const { auth, endpoint, request } = this;
		try {
			const items = await propfind({ auth, endpoint, key, request });
			const item = items.find((candidate) => isTargetItem(key, this.endpoint, candidate));
			return Boolean(item);
		} catch (error: unknown) {
			if (getStatus(error) === 404) return false;
			throw error;
		}
	}

	private async listStats(key: string, depth: '1' | 'infinity' = '1') {
		const { auth, endpoint, request } = this;
		const items = await propfind({ auth, depth, endpoint, key, request });
		return toDescendantStats(key, this.endpoint, items);
	}

	async list(key: string, reporter: ListReporter) {
		if (this.options.depthInfinity) {
			const stats = await this.listStats(key, 'infinity');
			const result: Array<Stat> = [];
			await Promise.all(
				stats.map(async (stat, index) => {
					if (
						(await reporter({
							completed: index + 1,
							current: stat.key,
							total: stats.length,
						})) === 'exclude'
					)
						return;
					result.push(stat);
				}),
			);
			return result;
		}
		const result: Array<Stat> = [];
		let completed = 1;
		let total = 1;
		const visit = async (dir: string) => {
			const items = await this.listStats(dir);
			completed++;
			total += items.length;
			await Promise.all(
				items.map(async (item) => {
					const report = await reporter({ completed, current: item.key, total });
					if (report !== 'advance') completed++;
					if (report === 'exclude') return;
					result.push(item);
					if (report === 'include') return;
					if (item.isDir) await visit(item.key);
				}),
			);
		};
		await visit(key);
		return result;
	}
}
