import type { RemoteFs, RemoteFsWrapper, WrappedRemoteFs } from '@/fs';
import type { Progress } from '@/types';

class DebugRemoteFs implements WrappedRemoteFs {
	constructor(
		public readonly original: RemoteFs,
		private readonly log: (content: string) => void,
	) {}

	checkConnection() {
		this.log('checkConnection');
		return this.original.checkConnection();
	}

	getUid(): string {
		const uid = this.original.getUid();
		this.log(`getUid: ${uid}`);
		return uid;
	}

	read(key: string, size?: number) {
		this.log(`read: key ${key}, size ${size}`);
		return this.original.read(key, size);
	}

	readStream(key: string, size?: number) {
		this.log(`readStream: key ${key}, size ${size}`);
		return this.original.readStream(key, size);
	}

	async write(key: string, value: ArrayBuffer) {
		const result = await this.original.write(key, value);
		this.log(`write: key ${key}, result ${result}`);
		return result;
	}

	delete(key: string) {
		this.log(`delete: key ${key}`);
		return this.original.delete(key);
	}

	move(oldKey: string, newKey: string) {
		this.log(`move: oldKey ${oldKey}, newKey ${newKey}`);
		return this.original.move(oldKey, newKey);
	}

	mkdir(key: string, recursive?: boolean) {
		this.log(`mkdir: key ${key}, recursive ${recursive}`);
		return this.original.mkdir(key, recursive);
	}

	async stat(key: string) {
		const result = await this.original.stat(key);
		this.log(`stat: key ${key}, result\n${JSON.stringify(result, undefined, '\t')}`);
		return result;
	}

	async exists(key: string) {
		const result = await this.original.exists(key);
		this.log(`exists: key ${key}, result ${result}`);
		return result;
	}

	async list(key: string, progress?: (prog: Progress) => void) {
		const result = await this.original.list(key, progress);
		this.log(`list: key ${key}, result\n${JSON.stringify(result, undefined, '\t')}`);
		return result;
	}
}

function debugWrapper(original: RemoteFs, log: (content: string) => void): WrappedRemoteFs {
	return new DebugRemoteFs(original, log);
}

export default debugWrapper satisfies RemoteFsWrapper<(content: string) => void>;
