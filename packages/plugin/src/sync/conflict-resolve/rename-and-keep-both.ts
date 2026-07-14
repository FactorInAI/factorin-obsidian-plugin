import { readWithSize, writeWithValue } from '@/utils/pipe';
import type { ConflictResolverPayload } from '../tasks/interface';

export default async function renameAndKeepBothResolver({
	local,
	record,
	remote,
	localFs,
	remoteFs,
	key,
}: ConflictResolverPayload) {
	const conflictKey = appendConflict(key);
	const [localValue, remoteValue] = await Promise.all([
		readWithSize(localFs, key, local.size),
		readWithSize(remoteFs, key, remote.size),
	]);
	if (!localValue || !remoteValue) return;
	if (local.mtime > remote.mtime) {
		await remoteFs.move(key, conflictKey);
		const [remoteCanonicalUid, localConflictUid] = await Promise.all([
			writeWithValue(localFs, conflictKey, localValue),
			writeWithValue(remoteFs, key, remoteValue),
		]);
		await record.batch([
			{
				key,
				type: 'set',
				value: { isDir: false, local: local.uid, remote: remoteCanonicalUid },
			},
			{
				key: conflictKey,
				type: 'set',
				value: { isDir: false, local: localConflictUid, remote: remote.uid },
			},
		]);
	} else {
		await localFs.move(key, conflictKey);
		const [localCanonicalUid, remoteConflictUid] = await Promise.all([
			writeWithValue(remoteFs, conflictKey, remoteValue),
			writeWithValue(localFs, key, localValue),
		]);
		await record.batch([
			{
				key,
				type: 'set',
				value: { isDir: false, local: localCanonicalUid, remote: remote.uid },
			},
			{
				key: conflictKey,
				type: 'set',
				value: { isDir: false, local: local.uid, remote: remoteConflictUid },
			},
		]);
	}
}

function appendConflict(f: string) {
	const i = f.lastIndexOf('.');
	return i === -1 ? `${f}.conflict` : `${f.slice(0, i)}.conflict${f.slice(i)}`;
}
