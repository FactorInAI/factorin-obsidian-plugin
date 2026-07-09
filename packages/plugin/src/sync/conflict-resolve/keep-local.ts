import type { ConflictResolverPayload } from '../tasks/interface';

export default async function keepLocalResolver({
	key,
	localFs,
	remoteFs,
	record,
}: ConflictResolverPayload) {
	const content = await localFs.read(key);
	const uid = await remoteFs.write(key, content);
	await record.set(key, { isDir: false, local: uid, remote: uid });
}
