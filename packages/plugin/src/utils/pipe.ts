import type { ErrorLike } from '@repo/shared/get-status';
import { getStatus } from '@repo/shared/get-status';
import type { Fs } from '@/fs';
import type { Binary } from '@/types';

const STREAM_THRESHOLD = 2.5 * 1024 ** 2; // 2.5 MiB

export default async function pipe({
	from,
	to,
	size,
	key,
}: {
	from: Fs;
	to: Fs;
	key: string;
	size: number;
}) {
	if (size > STREAM_THRESHOLD) {
		let content: ReadableStream<Binary>;
		try {
			content = await from.readStream(key);
		} catch (error) {
			if (isNonExistent(error)) return;
			throw error;
		}
		return to.writeStream(key, content);
	} else {
		let content: Binary;
		try {
			content = await from.read(key);
		} catch (error) {
			if (isNonExistent(error)) return;
			throw error;
		}
		return to.write(key, content);
	}
}

// Swallow TOCTOU
function isNonExistent(error: unknown) {
	return (
		getStatus(error) === 404 ||
		(((error as ErrorLike).message as string) ?? String(error))
			.toLocaleUpperCase()
			.contains('ENOENT')
	);
}
