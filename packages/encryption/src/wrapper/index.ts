import type { DatabaseSync, Fs, WrappedFs, Progress, Stat, Binary } from '@hesprs/sync-engine-sdk';
import type { EncryptionStores } from './path';
import {
	decryptFileContent,
	deriveMasterKey,
	deriveMasterSalt,
	deriveNameKey,
	deriveRootFileKey,
	encryptFileContent,
} from './content';
import { decryptPathSegments, encryptPathSegments } from './path';
import createDecryptedReadableStream from './read-stream';
import { getEncryptedFileSize } from './shared';
import createEncryptedReadableStream from './write-stream';

export type DerivedKeys = {
	nameKey: Binary;
	rootFileKey: Binary;
};

export type EncryptionDBSchema = {
	decryptedToEncrypted: string;
	encryptedToDecrypted: string;
};

export type EncryptionDBMeta = {
	encryptionKeys?: DerivedKeys;
	lastEncryptionUid?: string;
};

export type EncryptionDB = DatabaseSync<EncryptionDBSchema, EncryptionDBMeta>;

export type EncryptionWrapperOptions = {
	memoryDB: EncryptionDB;
	password: string;
};

class EncryptionFs implements WrappedFs {
	private readonly pathStores: EncryptionStores;
	private keysPromise: Promise<DerivedKeys> | undefined;

	constructor(
		public readonly original: Fs,
		private readonly options: EncryptionWrapperOptions,
	) {
		const { password, memoryDB } = options;
		const marker = `${original.getUid()}~${password}`;
		this.pathStores = {
			decryptedToEncrypted: memoryDB.getStore('decryptedToEncrypted'),
			encryptedToDecrypted: memoryDB.getStore('encryptedToDecrypted'),
		};
		if (memoryDB.getMeta('lastEncryptionUid') !== marker) {
			this.pathStores.decryptedToEncrypted.clear();
			this.pathStores.encryptedToDecrypted.clear();
			memoryDB.setMeta('encryptionKeys', undefined);
			memoryDB.setMeta('lastEncryptionUid', marker);
		}
	}

	getUid(): string {
		return this.original.getUid();
	}

	async read(key: string, size?: number): Promise<Binary> {
		const encryptedKey = await this.encryptKey(key);
		const { rootFileKey } = await this.getKeys();
		const encryptedContent = await this.original.read(encryptedKey, size);
		return decryptFileContent(rootFileKey, key, encryptedContent, encryptedContent.byteLength);
	}

	async readStream(key: string, size?: number): Promise<ReadableStream<Binary>> {
		const encryptedKey = await this.encryptKey(key);
		const { rootFileKey } = await this.getKeys();
		if (typeof size !== 'number') {
			const stat = await this.original.stat(encryptedKey);
			if (stat.isDir) throw new Error('Cannot stream a folder');
			size = stat.size;
		}
		const source = await this.original.readStream(encryptedKey, size);
		return createDecryptedReadableStream(source, rootFileKey, key, size);
	}

	async write(key: string, value: Binary): Promise<string> {
		const encryptedKey = await this.encryptKey(key);
		const { rootFileKey } = await this.getKeys();
		const encryptedContent = await encryptFileContent(rootFileKey, key, value);
		return this.original.write(encryptedKey, encryptedContent);
	}

	async writeStream(key: string, value: ReadableStream<Binary>, size?: number): Promise<string> {
		if (typeof size !== 'number') throw new Error('writeStream size is required');
		const encryptedKey = await this.encryptKey(key);
		const { rootFileKey } = await this.getKeys();
		const encryptedFileSize = getEncryptedFileSize(size);
		const stream = await createEncryptedReadableStream(rootFileKey, key, value, size);
		return this.original.writeStream(encryptedKey, stream, encryptedFileSize);
	}

	async delete(key: string) {
		return this.original.delete(await this.encryptKey(key));
	}

	async move(oldKey: string, newKey: string) {
		return this.original.move(await this.encryptKey(oldKey), await this.encryptKey(newKey));
	}

	async mkdir(key: string, recursive?: boolean) {
		return this.original.mkdir(await this.encryptKey(key), recursive);
	}

	async stat(key: string) {
		const encryptedKey = await this.encryptKey(key);
		const stat = await this.original.stat(encryptedKey);
		return { ...stat, key: await this.decryptKey(stat.key) };
	}

	async exists(key: string): Promise<boolean> {
		return this.original.exists(await this.encryptKey(key));
	}

	async list(key: string, progress?: (prog: Progress) => void) {
		const encryptedKey = await this.encryptKey(key);
		const stats = await this.original.list(encryptedKey, progress);
		return this.decryptStats(stats);
	}

	private async getKeys(): Promise<DerivedKeys> {
		if (!this.keysPromise) this.keysPromise = this.createKeysPromise();
		return this.keysPromise;
	}

	private async createKeysPromise(): Promise<DerivedKeys> {
		const encryptionKeys = this.options.memoryDB.getMeta('encryptionKeys');
		if (encryptionKeys !== undefined) return encryptionKeys;

		const masterSalt = await deriveMasterSalt(this.original.getUid());
		const masterKey = await deriveMasterKey(this.options.password, masterSalt);
		const [rootFileKey, nameKey] = await Promise.all([
			deriveRootFileKey(masterKey),
			deriveNameKey(masterKey),
		]);
		const derivedKeys = { nameKey, rootFileKey };
		this.options.memoryDB.setMeta('encryptionKeys', derivedKeys);
		return derivedKeys;
	}

	private async encryptKey(key: string): Promise<string> {
		const { nameKey } = await this.getKeys();
		return encryptPathSegments(nameKey, key, this.pathStores);
	}

	private async decryptKey(key: string): Promise<string> {
		const { nameKey } = await this.getKeys();
		return decryptPathSegments(nameKey, key, this.pathStores);
	}

	private async decryptStats(stats: Array<Stat>) {
		return Promise.all(
			stats.map(async (stat) => ({ ...stat, key: await this.decryptKey(stat.key) })),
		);
	}
}

export default function encryptionWrapper(
	original: Fs,
	options: EncryptionWrapperOptions,
): WrappedFs {
	return new EncryptionFs(original, options);
}
