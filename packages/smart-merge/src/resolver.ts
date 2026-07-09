import type { ConflictResolver, DatabaseAsync, LocalFs, RemoteFs } from '@hesprs/sync-engine-sdk';
import { arrayBufferToText, textToArrayBuffer } from '@repo/shared/binary';
import type { MergeOptions } from './utils/merge';
import merge from './utils/merge';

type SmartMergeStoreSchema = Record<`base-text-${string}`, string>;
type SmartMergeStoreMeta = Record<string, never>;

export default function smartMergeResolver(
	mergeOptions: MergeOptions,
	db: DatabaseAsync<SmartMergeStoreSchema, SmartMergeStoreMeta>,
	getNamespace: (localFs?: LocalFs, remoteFs?: RemoteFs) => string,
): ConflictResolver {
	return async ({ local, remote, key, localFs, remoteFs, record }) => {
		const store = db.getStore(`base-text-${getNamespace(localFs, remoteFs)}`);
		const [localBuffer, remoteBuffer, baseText] = await Promise.all([
			localFs.read(key),
			remoteFs.read(key),
			store.get(key),
		]);

		if (baseText !== undefined) {
			const localText = arrayBufferToText(localBuffer);
			const remoteText = arrayBufferToText(remoteBuffer);
			if (localText === remoteText) {
				await record.set(key, { isDir: false, local: local.uid, remote: remote.uid });
				return;
			}
			const mergedText = merge({ a: localText, b: remoteText, o: baseText }, mergeOptions);
			const mergedBuffer = textToArrayBuffer(mergedText);
			const [localUid, remoteUid] = await Promise.all([
				mergedText === localText
					? Promise.resolve(local.uid)
					: localFs.write(key, mergedBuffer),
				mergedText === remoteText
					? Promise.resolve(remote.uid)
					: remoteFs.write(key, mergedBuffer),
			]);
			await record.set(key, { isDir: false, local: localUid, remote: remoteUid });
			return;
		}

		if (local.mtime > remote.mtime) {
			const uid = await remoteFs.write(key, localBuffer);
			await record.set(key, { isDir: false, local: local.uid, remote: uid });
			return;
		}

		let uid: string;
		if (remote.size >= 2 ** 21) {
			const contentStream = await remoteFs.readStream(key);
			uid = await localFs.writeStream(key, contentStream);
		} else uid = await localFs.write(key, remoteBuffer);
		await record.set(key, { isDir: false, local: uid, remote: remote.uid });
	};
}
