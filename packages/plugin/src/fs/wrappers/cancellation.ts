import type { Request } from '@/modules/Registrar';
import type { MaybePromise, Progress, Binary } from '@/types';
import { syncCancelledError } from '@/sync';
import type { Fs, WrappedFs } from '../interface';

function assertNotCancelled(isCancelled: () => boolean) {
	if (isCancelled()) throw syncCancelledError;
}

async function guardCancellation<T>(
	isCancelled: () => boolean,
	when: 'pre' | 'post' | 'both',
	operation: () => Promise<T> | T,
) {
	if (when !== 'post') assertNotCancelled(isCancelled);
	const result = await operation();
	if (when !== 'pre') assertNotCancelled(isCancelled);
	return result;
}

class CancellationFs implements WrappedFs {
	constructor(
		public readonly original: Fs,
		private readonly isCancelled: () => boolean,
	) {}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, size?: number) {
		return guardCancellation(this.isCancelled, 'pre', () => this.original.read(key, size));
	}

	readStream(key: string, size?: number) {
		return guardCancellation(this.isCancelled, 'pre', () =>
			this.original.readStream(key, size),
		);
	}

	write(key: string, value: Binary) {
		return guardCancellation(this.isCancelled, 'post', () => this.original.write(key, value));
	}

	writeStream(key: string, value: ReadableStream<Binary>, size?: number): MaybePromise<string> {
		return guardCancellation(this.isCancelled, 'post', () =>
			this.original.writeStream(key, value, size),
		);
	}

	delete(key: string) {
		return guardCancellation(this.isCancelled, 'both', () => this.original.delete(key));
	}

	move(oldKey: string, newKey: string) {
		return guardCancellation(this.isCancelled, 'both', () =>
			this.original.move(oldKey, newKey),
		);
	}

	mkdir(key: string, recursive?: boolean) {
		return guardCancellation(this.isCancelled, 'both', () =>
			this.original.mkdir(key, recursive),
		);
	}

	stat(key: string) {
		return guardCancellation(this.isCancelled, 'both', () => this.original.stat(key));
	}

	exists(key: string) {
		return guardCancellation(this.isCancelled, 'both', () => this.original.exists(key));
	}

	list(key: string, progress?: (prog: Progress) => void) {
		return guardCancellation(this.isCancelled, 'both', () => this.original.list(key, progress));
	}
}

export function cancellationMiddleware(request: Request, isCancelled: () => boolean): Request {
	return async (params) => {
		assertNotCancelled(isCancelled);
		const response = await request(params);
		assertNotCancelled(isCancelled);
		return response;
	};
}

export function cancellationWrapper(original: Fs, isCancelled: () => boolean): WrappedFs {
	return new CancellationFs(original, isCancelled);
}
