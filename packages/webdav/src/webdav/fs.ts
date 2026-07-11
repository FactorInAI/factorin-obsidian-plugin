import type { Binary, FolderStat, Progress, Request, RootFs, Stat } from '@hesprs/sync-engine-sdk';
import { concatBinary } from '@repo/shared/binary';
import { getStatus } from '@repo/shared/get-status';
import {
	dirname,
	normalizeChar,
	normalizeKey,
	normalizeUrl,
	stripEndSlash,
} from '@repo/shared/path';
import parseXML from '@/parse-xml';
import writeNextcloudChunkedUpload from './chunked-upload';
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
	return href.slice(1);
}

function toStat(endpoint: string, item: WebDAVResponseItem): Stat | undefined {
	const propstats = item.propstat ? asArray(item.propstat) : [];
	const validPropstat = propstats.find(
		(propstat) => isSuccessStatus(propstat.status) && propstat.prop,
	);
	if (!validPropstat?.prop) return;

	const remotePath = stripEndpoint(endpoint, item.href);
	const isDir = isCollectionResource(validPropstat.prop.resourcetype);
	if (remotePath === '') return { isDir: true, key: '/' };

	const key = normalizeKey(normalizeChar(remotePath), isDir);
	if (isDir) return { isDir: true, key };

	const mtime = new Date(getDavText(validPropstat.prop.getlastmodified) ?? '').valueOf();
	const size = Number.parseInt(getDavText(validPropstat.prop.getcontentlength) ?? '0', 10);
	const uid = getDavText(validPropstat.prop.getetag) ?? `${mtime}~${size}`;

	return { isDir: false, key, mtime, size, uid };
}

type PropfindOptions = {
	depth: '0' | '1' | 'infinity';
	key: string;
};

async function propfind(
	request: Request,
	auth: string,
	endpoint: string,
	propfindOptions: PropfindOptions,
) {
	const response = await request({
		body: PROPFIND_BODY,
		headers: {
			Authorization: auth,
			'Content-Type': 'application/xml',
			Depth: propfindOptions.depth,
		},
		method: 'PROPFIND',
		url: buildUrl(endpoint, propfindOptions.key),
	});

	const parsed = parseXML(response.text()) as WebDAVMultistatus;
	return asArray(parsed.multistatus.response);
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

	async read(key: string) {
		const response = await this.request({
			headers: { Authorization: this.auth },
			method: 'GET',
			url: buildUrl(this.endpoint, key),
		});

		return response.bytes();
	}

	async readStream(key: string, size?: number) {
		if (typeof size !== 'number') {
			const stat = await this.stat(key);
			if (stat.isDir) throw new Error('Cannot stream a folder');
			size = stat.size;
		}

		return createWebDAVReadStream({
			chunkSize: READ_CHUNK_SIZE,
			maxConcurrent: READ_MAX_CONCURRENT,
			requestRange: async (start, endInclusive) => {
				const response = await this.request({
					headers: {
						Authorization: this.auth,
						Range: `bytes=${start}-${endInclusive}`,
					},
					method: 'GET',
					url: buildUrl(this.endpoint, key),
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

	async writeStream(key: string, value: ReadableStream<Binary>, size?: number) {
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

		const items = await propfind(this.request, this.auth, this.endpoint, { depth: '0', key });
		const item = items.find((candidate) => isTargetItem(key, this.endpoint, candidate));
		if (!item) throw new Error(`WebDAV stat not found for ${key}`);

		const stat = toStat(this.endpoint, item);
		if (!stat) throw new Error(`WebDAV stat not found for ${key}`);
		return stat;
	}

	async exists(key: string): Promise<boolean> {
		try {
			const items = await propfind(this.request, this.auth, this.endpoint, {
				depth: '0',
				key,
			});
			const item = items.find((candidate) => isTargetItem(key, this.endpoint, candidate));
			return Boolean(item);
		} catch (error: unknown) {
			if (getStatus(error) === 404) return false;
			throw error;
		}
	}

	private async listShallow(key: string) {
		const items = await propfind(this.request, this.auth, this.endpoint, { depth: '1', key });
		return toDescendantStats(key, this.endpoint, items);
	}

	async list(key: string, progress?: (progress: Progress) => void) {
		if (this.options.depthInfinity) {
			const items = await propfind(this.request, this.auth, this.endpoint, {
				depth: 'infinity',
				key,
			});
			const result = toDescendantStats(key, this.endpoint, items);
			progress?.({ completed: 1, total: 1 });
			return result;
		}
		const result: Array<Stat> = [];
		let completed = 0;
		let total = 1;
		progress?.({ completed: 0, current: key, total });
		const visit = async (dir: string) => {
			const items = await this.listShallow(dir);
			for (const item of items) {
				result.push(item);
				if (item.isDir) total++;
			}
			completed++;
			progress?.({ completed, current: dir, total });
			await Promise.all(items.filter((i) => i.isDir).map((d) => visit(d.key)));
		};
		await visit(key);
		return result;
	}
}
