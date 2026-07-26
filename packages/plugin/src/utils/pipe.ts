import type { ErrorLike } from '@repo/shared/get-status';
import { getStatus } from '@repo/shared/get-status';
import type { Fs } from '@/fs';
import type { Binary, FileStat } from '@/types';

const STREAM_THRESHOLD = 2.5 * 1024 ** 2; // 2.5 MiB

export async function pipe({
	from,
	to,
	stat,
	key,
}: {
	from: Fs;
	to: Fs;
	key: string;
	stat: FileStat;
}) {
	const value = await readWithSize(from, key, stat);
	if (!value) return;
	return writeWithValue(to, key, value, stat);
}

export async function readWithSize(fs: Fs, key: string, stat: FileStat) {
	try {
		if (stat.size > STREAM_THRESHOLD) return await fs.readStream(key, stat);
		return await fs.read(key, stat);
	} catch (error) {
		if (isNonExistent(error)) return;
		throw error;
	}
}

export function writeWithValue(
	fs: Fs,
	key: string,
	value: Binary | ReadableStream<Binary>,
	stat: FileStat,
) {
	if (value instanceof ReadableStream) return fs.writeStream(key, value, stat);
	return fs.write(key, value, stat);
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
