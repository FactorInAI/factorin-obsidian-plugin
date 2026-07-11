import type { Stat } from '@hesprs/sync-engine-sdk';

export function getAuthorization(username: string, password: string) {
	return `Basic ${btoa(`${username}:${password}`)}`;
}

export function getHeader(headers: Record<string, string | undefined>, name: string) {
	const entry = Object.entries(headers).find(
		([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
}

export function getFileUid(stat: Stat, key: string) {
	if (stat.isDir) throw new Error(`WebDAV write returned a folder stat for ${key}.`);
	return stat.uid;
}

export function buildUrl(endpoint: string, key: string) {
	const encodedPath = key.split('/').map(encodeURIComponent).join('/');
	if (key === '/') return `${endpoint}/`;
	return `${endpoint}${encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`}`;
}
