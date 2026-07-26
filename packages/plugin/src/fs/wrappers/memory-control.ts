import type { Progress, Binary, FileStat } from '@/types';
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

class MemoryControlRemoteFs implements WrappedFs {
	constructor(
		public readonly original: Fs,
		private readonly state: MemoryControlSharedState,
	) {}

	private async readThroughMemory(key: string, stat: FileStat) {
		await reserveMemory(this.state, stat.size);
		try {
			return await this.original.read(key, stat);
		} catch (error) {
			releaseMemory(this.state, stat.size);
			throw error;
		}
	}

	private async writeThroughMemory(key: string, value: Binary, stat: FileStat) {
		try {
			return await this.original.write(key, value, stat);
		} finally {
			releaseMemory(this.state, value.byteLength);
		}
	}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, stat: FileStat) {
		return this.readThroughMemory(key, stat);
	}

	async readStream(key: string, stat: FileStat) {
		await reserveMemory(this.state, STREAM_RESERVATION_SIZE);
		try {
			return this.original.readStream(key, stat);
		} catch (error) {
			releaseMemory(this.state, STREAM_RESERVATION_SIZE);
			throw error;
		}
	}

	write(key: string, value: Binary, stat: FileStat) {
		return this.writeThroughMemory(key, value, stat);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		try {
			return await this.original.writeStream(key, value, stat);
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
