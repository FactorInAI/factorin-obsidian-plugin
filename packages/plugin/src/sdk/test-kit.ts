import type { RootFs } from '@/fs';
import type { Request, RequestParam } from '@/modules/Registrar';
import type { MaybePromise, Progress, Stat, Binary } from '@/types';

type FsCalls = {
	delete: Array<string>;
	exists: Array<string>;
	list: Array<string>;
	mkdir: Array<string>;
	move: Array<[string, string]>;
	read: Array<[string, number | undefined]>;
	readStream: Array<[string, number | undefined]>;
	stat: Array<string>;
	write: Array<[string, Binary]>;
	writeStream: Array<string>;
};

type FsControl = {
	delete: (key: string) => MaybePromise<void>;
	exists: (key: string) => MaybePromise<boolean>;
	list: (key: string, progress?: (progress: Progress) => void) => MaybePromise<Array<Stat>>;
	mkdir: (key: string, recursive?: boolean) => MaybePromise<void>;
	move: (oldKey: string, newKey: string) => MaybePromise<void>;
	read: (key: string, size?: number) => MaybePromise<Binary>;
	readStream: (key: string, size?: number) => MaybePromise<ReadableStream<Binary>>;
	stat: (key: string) => MaybePromise<Stat>;
	write: (key: string, value: Binary) => MaybePromise<string>;
	writeStream: (key: string, value: ReadableStream<Binary>) => MaybePromise<string>;
};

type FsOptions = {
	control?: Partial<FsControl>;
	uid?: string;
};

type FsHarness = {
	calls: FsCalls;
	control: FsControl;
	fs: RootFs;
};

type RequestHarness = {
	calls: Array<RequestParam | string>;
	request: Request;
};

const textEncoder = new TextEncoder();

function bytes(value: string): Binary {
	return textEncoder.encode(value);
}

function file(key: string, options: { mtime?: number; size?: number; uid?: string } = {}): Stat {
	const { mtime = 1, size = 5, uid = `${key}-uid` } = options;
	return { isDir: false, key, mtime, size, uid };
}

function folder(key: string): Stat {
	return { isDir: true, key };
}

function defaultStat(key: string): Stat {
	return key === '/' || key.endsWith('/')
		? folder(key)
		: file(key, { mtime: 10, size: 5, uid: 'uid' });
}

function stream(chunks: Array<string | Binary> = []): ReadableStream<Binary> {
	return new ReadableStream<Binary>({
		start(controller) {
			for (const chunk of chunks)
				controller.enqueue(typeof chunk === 'string' ? bytes(chunk) : chunk);
			controller.close();
		},
	});
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, reject, resolve };
}

async function flush(turns = 4) {
	for (let index = 0; index < turns; index += 1)
		await new Promise<void>((resolve) => queueMicrotask(resolve));
}

function createCalls(): FsCalls {
	return {
		delete: [],
		exists: [],
		list: [],
		mkdir: [],
		move: [],
		read: [],
		readStream: [],
		stat: [],
		write: [],
		writeStream: [],
	};
}

function createControl(overrides: Partial<FsControl> = {}): FsControl {
	return {
		delete: async () => undefined,
		exists: async () => false,
		list: async (key: string) => [
			defaultStat(key),
			folder(`${key}folder/`),
			file(`${key}folder/note.md`, { mtime: 12, size: 7, uid: 'note-2' }),
		],
		mkdir: async () => undefined,
		move: async () => undefined,
		read: async () => bytes(''),
		readStream: async () => stream(),
		stat: async (key: string) => defaultStat(key),
		write: async () => 'write-uid',
		writeStream: async () => 'stream-uid',
		...overrides,
	};
}

function request(control: Request): RequestHarness {
	const calls: Array<RequestParam | string> = [];
	return {
		calls,
		request: (params: RequestParam | string) => {
			calls.push(params);
			return control(params);
		},
	};
}

function fs(options: FsOptions = {}): FsHarness {
	const calls = createCalls();
	const control = createControl(options.control);
	const uid = options.uid ?? 'uid';

	const rootFs: RootFs = {
		delete: async (key: string) => {
			calls.delete.push(key);
			return await control.delete(key);
		},
		exists: async (key: string) => {
			calls.exists.push(key);
			return await control.exists(key);
		},
		getUid: () => uid,
		list: async (key: string, progress?: (progress: Progress) => void) => {
			calls.list.push(key);
			return await control.list(key, progress);
		},
		mkdir: async (key: string, recursive?: boolean) => {
			calls.mkdir.push(key);
			return await control.mkdir(key, recursive);
		},
		move: async (oldKey: string, newKey: string) => {
			calls.move.push([oldKey, newKey]);
			return await control.move(oldKey, newKey);
		},
		read: async (key: string, size?: number) => {
			calls.read.push([key, size]);
			return await control.read(key, size);
		},
		readStream: async (key: string, size?: number) => {
			calls.readStream.push([key, size]);
			return await control.readStream(key, size);
		},
		stat: async (key: string) => {
			calls.stat.push(key);
			return await control.stat(key);
		},
		write: async (key: string, value: Binary) => {
			calls.write.push([key, value]);
			return await control.write(key, value);
		},
		writeStream: async (key: string, value: ReadableStream<Binary>) => {
			calls.writeStream.push(key);
			return await control.writeStream(key, value);
		},
	};

	return { calls, control, fs: rootFs };
}

const testKit = { bytes, deferred, file, flush, folder, fs, request, stream };

export default testKit;
