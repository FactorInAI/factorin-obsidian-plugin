import { hash } from '@repo/shared/crypto';
import type { LocalFs, RemoteFs } from '@/fs';

export default function getNamespace(localFs: LocalFs, remoteFs: RemoteFs): string {
	return hash(`${localFs.getUid()}~~${remoteFs.getUid()}`);
}
