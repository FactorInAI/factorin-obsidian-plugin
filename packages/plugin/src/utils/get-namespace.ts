import { hash } from '@repo/shared';
import type { LocalFs, RemoteFs } from '@/fs';

export default function getNamespace(localFs: LocalFs, remoteFs: RemoteFs): string {
	return hash(`${localFs.getUid()}~~${remoteFs.getUid()}`);
}
