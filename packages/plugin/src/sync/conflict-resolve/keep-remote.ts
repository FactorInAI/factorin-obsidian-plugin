import type { ConflictResolverPayload } from '../tasks/interface';

export default async function keepRemoteResolver({
	remote,
	key,
	localFs,
	remoteFs,
	record,
}: ConflictResolverPayload) {
	let uid: string;
	if (remote.size >= 2 ** 21) {
		const stream = await remoteFs.readStream(key);
		uid = await localFs.writeStream(key, stream);
	} else {
		const content = await remoteFs.read(key);
		uid = await localFs.write(key, content);
	}
	await record.set(key, { isDir: false, local: uid, remote: uid });
}
