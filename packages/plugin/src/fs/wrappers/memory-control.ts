import type { Progress, Binary } from '@/types';
import type { Fs, WrappedFs } from '../interface';

type HangingOperation = {
	size: number;
	resume: () => void;
};

export type MemoryControlSharedState = {
	memoryConsumption: number;
	hangingOperations: Array<HangingOperation>;
	maxMemory: number;
};

const STREAM_RESERVATION_SIZE = 16 * 1024 * 1024;

function canReserve(state: MemoryControlSharedState, size: number) {
	const { memoryConsumption, maxMemory } = state;
	return memoryConsumption + size <= maxMemory || memoryConsumption === 0;
}

function insertHangingOperation(state: MemoryControlSharedState, operation: HangingOperation) {
	const { hangingOperations } = state;
	let index = 0;
	while (index < hangingOperations.length && hangingOperations[index].size <= operation.size)
		index += 1;
	hangingOperations.splice(index, 0, operation);
}

function resumeHangingOperations(state: MemoryControlSharedState) {
	while (state.hangingOperations.length > 0) {
		const operation = state.hangingOperations[0];
		if (!canReserve(state, operation.size)) return;
		state.hangingOperations.shift();
		state.memoryConsumption += operation.size;
		operation.resume();
	}
}

function reserveMemory(state: MemoryControlSharedState, size: number) {
	if (canReserve(state, size)) {
		state.memoryConsumption += size;
		return Promise.resolve();
	}

	return new Promise<void>((resolve) => {
		insertHangingOperation(state, {
			resume: () => resolve(),
			size,
		});
	});
}

function releaseMemory(state: MemoryControlSharedState, size: number) {
	state.memoryConsumption = Math.max(0, state.memoryConsumption - size);
	resumeHangingOperations(state);
}

async function readThroughMemory(
	fs: Fs,
	state: MemoryControlSharedState,
	key: string,
	size?: number,
) {
	const readSize = await resolveReadSize(fs, key, size);
	await reserveMemory(state, readSize);
	try {
		return await fs.read(key, readSize);
	} catch (error) {
		releaseMemory(state, readSize);
		throw error;
	}
}

async function writeThroughMemory(
	fs: Fs,
	state: MemoryControlSharedState,
	key: string,
	value: Binary,
) {
	try {
		return await fs.write(key, value);
	} finally {
		releaseMemory(state, value.byteLength);
	}
}

async function resolveReadSize(fs: Fs, key: string, size?: number) {
	if (typeof size === 'number') return size;
	const stat = await fs.stat(key);
	if (stat.isDir) throw new Error('Cannot read a folder');
	return stat.size;
}

class MemoryControlRemoteFs implements WrappedFs {
	constructor(
		public readonly original: Fs,
		private readonly state: MemoryControlSharedState,
	) {}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, size?: number) {
		return readThroughMemory(this.original, this.state, key, size);
	}

	async readStream(key: string, size?: number) {
		await reserveMemory(this.state, STREAM_RESERVATION_SIZE);
		try {
			return this.original.readStream(key, size);
		} catch (error) {
			releaseMemory(this.state, STREAM_RESERVATION_SIZE);
			throw error;
		}
	}

	write(key: string, value: Binary) {
		return writeThroughMemory(this.original, this.state, key, value);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, size?: number) {
		try {
			return await this.original.writeStream(key, value, size);
		} finally {
			releaseMemory(this.state, STREAM_RESERVATION_SIZE);
		}
	}

	delete(key: string) {
		return this.original.delete(key);
	}

	move(oldKey: string, newKey: string) {
		return this.original.move(oldKey, newKey);
	}

	mkdir(key: string, recursive?: boolean) {
		return this.original.mkdir(key, recursive);
	}

	stat(key: string) {
		return this.original.stat(key);
	}

	exists(key: string) {
		return this.original.exists(key);
	}

	list(key: string, progress?: (prog: Progress) => void) {
		return this.original.list(key, progress);
	}
}

export default function memoryControlWrapper(
	original: Fs,
	state: MemoryControlSharedState,
): WrappedFs {
	return new MemoryControlRemoteFs(original, state);
}
