import type { ConflictResolverPayload } from '../tasks/interface';

export default async function latestSurviveResolver({
	local,
	record,
	remote,
	localFs,
	remoteFs,
	key,
}: ConflictResolverPayload) {
	if (local.mtime > remote.mtime) {
		const content = await localFs.read(key);
		const uid = await remoteFs.write(key, content);
		await record.set(key, { isDir: false, local: local.uid, remote: uid });
	} else {
		let uid: string;
		if (remote.size >= 2 ** 21) {
			const contentStream = await remoteFs.readStream(key);
			uid = await localFs.writeStream(key, contentStream);
		} else {
			const content = await remoteFs.read(key);
			uid = await localFs.write(key, content);
		}
		await record.set(key, { isDir: false, local: uid, remote: remote.uid });
	}
}
