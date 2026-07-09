import type { RemoteFs, StoreAsync } from '@hesprs/sync-engine-sdk';
import { arrayBufferToText } from '@repo/shared/binary';
import isMergeablePath from './utils/is-mergeable-path';

export default function smartMergeBaseTextWrapper(
	original: RemoteFs,
	store: StoreAsync<string>,
): RemoteFs {
	const write = original.write.bind(original);
	const move = original.move.bind(original);
	const remove = original.delete.bind(original);

	original.write = (async (key: string, value: ArrayBuffer) => {
		const uid = await write(key, value);
		if (isMergeablePath(key)) await store.set(key, arrayBufferToText(value));
		return uid;
	}) as RemoteFs['write'];

	original.move = (async (oldKey: string, newKey: string) => {
		await move(oldKey, newKey);
		if (oldKey === newKey) return;
		const value = await store.get(oldKey);
		if (value !== undefined)
			await store.batch([
				{ key: newKey, type: 'set', value },
				{ key: oldKey, type: 'delete' },
			]);
	}) as RemoteFs['move'];

	original.delete = (async (key: string) => {
		await remove(key);
		await store.delete(key);
	}) as RemoteFs['delete'];

	return original;
}
