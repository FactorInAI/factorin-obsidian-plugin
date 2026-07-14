import type { ErrorLike } from '@repo/shared/get-status';
import { getStatus } from '@repo/shared/get-status';
import type { Fs } from '@/fs';
import type { Binary } from '@/types';

const STREAM_THRESHOLD = 2.5 * 1024 ** 2; // 2.5 MiB

export async function pipe({
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
	const value = await readWithSize(from, key, size);
	if (!value) return;
	return writeWithValue(to, key, value);
}

export async function readWithSize(fs: Fs, key: string, size: number) {
	try {
		if (size > STREAM_THRESHOLD) return await fs.readStream(key);
		return await fs.read(key);
	} catch (error) {
		if (isNonExistent(error)) return;
		throw error;
	}
}

export function writeWithValue(fs: Fs, key: string, value: Binary | ReadableStream<Binary>) {
	if (value instanceof ReadableStream) return fs.writeStream(key, value);
	return fs.write(key, value);
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
