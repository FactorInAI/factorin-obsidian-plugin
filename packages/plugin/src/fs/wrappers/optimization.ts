import type { MaybePromise, Progress, Binary, FileStat } from '@/types';
import type {
	BatchOptimizer,
	DeleteAtom,
	InputAtom,
	Fs,
	WrappedFs,
	MkdirAtom,
	MoveAtom,
	WriteAtom,
	OutputAtom,
} from '../interface';

type OptimizationOptions = {
	thisPool: Array<string>;
	thatPool: Array<string>;
	batchOptimizer: BatchOptimizer;
};

type OmitResolve<T> = Omit<T, 'resolve'>;

const executeAtom = (atom: OutputAtom) => {
	const result = atom.execute();
	if (result instanceof Promise) return result;
	return Promise.resolve(result);
};

class OptimizationFs implements WrappedFs {
	private scheduled = false;
	private readonly queue: Array<InputAtom> = [];
	private readonly pendingWrites = new Map<
		string,
		(write: () => MaybePromise<string>) => Promise<string>
	>();

	constructor(
		public readonly original: Fs,
		private readonly options: OptimizationOptions,
	) {}

	getUid() {
		return this.original.getUid();
	}

	private enqueueExecution({
		execute: e,
		...rest
	}: OmitResolve<MoveAtom> | OmitResolve<DeleteAtom> | OmitResolve<MkdirAtom>) {
		const { defer, execute, resolve } = createCachedPromise(e);
		this.queue.push({ ...rest, execute, resolve });
		this.scheduleFlush();
		return defer;
	}

	read(key: string, stat: FileStat) {
		this.options.thisPool.push(stat.key);
		return this.original.read(key, stat);
	}

	readStream(key: string, stat: FileStat) {
		this.options.thisPool.push(stat.key);
		return this.original.readStream(key, stat);
	}

	delete(key: string) {
		return this.enqueueExecution({
			execute: () => this.original.delete(key),
			key,
			type: 'delete',
		});
	}

	mkdir(key: string, recursive?: boolean) {
		return this.enqueueExecution({
			execute: () => this.original.mkdir(key, recursive),
			key,
			type: 'mkdir',
		});
	}

	write(key: string, value: Binary, stat: FileStat) {
		const anticipated = this.pendingWrites.get(key);
		if (anticipated) return anticipated(() => this.original.write(key, value, stat));
		return this.original.write(key, value, stat);
	}

	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat) {
		const anticipated = this.pendingWrites.get(key);
		if (anticipated) return anticipated(() => this.original.writeStream(key, value, stat));
		return this.original.writeStream(key, value, stat);
	}

	move(oldKey: string, newKey: string) {
		return this.enqueueExecution({
			execute: () => this.original.move(oldKey, newKey),
			newKey,
			oldKey,
			type: 'move',
		});
	}

	stat(key: string) {
		return this.original.stat(key);
	}

	exists(key: string) {
		return this.original.exists(key);
	}

	list(key: string, progress?: (progress: Progress) => void) {
		return this.original.list(key, progress);
	}

	private scheduleFlush() {
		if (this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(() => {
			void this.flush();
			this.scheduled = false;
		});
	}

	private async flush() {
		if (this.queue.length === 1) await (this.queue.pop() as InputAtom).execute();
		else {
			const writeAtoms = this.options.thatPool.splice(0).map((key): WriteAtom => {
				let result: string | undefined;
				const anticipateWrite = new Promise<() => MaybePromise<string>>((resolve) => {
					this.pendingWrites.set(key, (write: () => MaybePromise<string>) => {
						this.pendingWrites.delete(key);
						const {
							execute,
							defer,
							resolve: resolveWrite,
						} = createCachedPromise(write);
						if (result !== undefined) resolveWrite(result);
						resolve(execute);
						return defer;
					});
				});
				return {
					execute: () => anticipateWrite.then((write) => write()),
					key,
					resolve: (uid: string) => (result = uid),
					type: 'write',
				};
			});
			const atoms = [...this.queue.splice(0), ...writeAtoms];
			const optimizedAtoms = this.options.batchOptimizer({
				atoms,
				executeAtom,
				fs: this.original,
			});
			await Promise.all(optimizedAtoms.map(executeAtom));
		}
	}
}

function createCachedPromise<T>(fn: () => MaybePromise<T>) {
	// oxlint-disable-next-line unicorn/no-null
	let promise: MaybePromise<T> | null = null;
	let resolve: (value: T) => void;
	let reject: (reason: unknown) => void;
	const defer = new Promise<T>(
		(resolver, rejector) => ((resolve = resolver), (reject = rejector)),
	);
	const execute = () => {
		if (promise !== null) return promise;
		promise = fn();
		if (promise instanceof Promise) promise.then(resolve, reject);
		else resolve(promise);
		return promise;
	};
	return {
		defer,
		execute,
		resolve: (value: T) => {
			promise = value;
			resolve(value);
		},
	};
}

export default function remoteOptimizationWrapper(
	original: Fs,
	options: OptimizationOptions,
): WrappedFs {
	return new OptimizationFs(original, options);
}
