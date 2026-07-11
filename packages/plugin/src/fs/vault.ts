import type { Vault } from 'obsidian';
import { toArrayBuffer, toUint8Array } from '@repo/shared/binary';
import { dirname, stripEndSlash } from '@repo/shared/path';
import type { Stat, Binary } from '@/types';
import type { Fs, RootFs } from './interface';

function toKey(vaultPath: string, isDir: boolean): string {
	if (vaultPath === '/') return '/';
	return isDir ? `${vaultPath}/` : vaultPath;
}

function toVaultPath(key: string) {
	if (key === '/') return key;
	return stripEndSlash(key);
}

function toStat(
	nativePath: string,
	{ type, mtime, size }: { type: 'file' | 'folder'; mtime: number; size: number },
): Stat {
	if (type === 'folder') return { isDir: true, key: toKey(nativePath, true) };
	return { isDir: false, key: toKey(nativePath, false), mtime, size, uid: `${mtime}~${size}` };
}

async function ensureKeyDir(vault: Vault, key: string): Promise<void> {
	if (key === '/') return;
	const vaultPath = toVaultPath(key);
	if (await vault.adapter.exists(vaultPath)) return;
	await ensureKeyDir(vault, dirname(key));
	if (!(await vault.adapter.exists(vaultPath))) await vault.adapter.mkdir(vaultPath);
}

async function removeVaultFileIfExists(vault: Vault, path: string): Promise<void> {
	if (await vault.adapter.exists(path)) await vault.adapter.remove(path);
}

function getTrashOption(vault: Vault): 'local' | undefined {
	const configuredVault = vault as { config?: { trashOption?: 'local' } };
	return configuredVault.config?.trashOption;
}

async function getFileUid(fs: Fs, key: string): Promise<string> {
	const stat = await fs.stat(key);
	if (stat.isDir) throw new Error(`File ${key} not found!`);
	return stat.uid;
}

export default class VaultFs implements RootFs {
	constructor(private readonly vault: Vault) {}

	getUid(): string {
		return `obsidian-vault~${this.vault.getName()}`;
	}

	async read(key: string): Promise<Binary> {
		return toUint8Array(await this.vault.adapter.readBinary(toVaultPath(key)));
	}

	async readStream(key: string) {
		const response = await fetch(this.vault.adapter.getResourcePath(toVaultPath(key)));
		if (!response.body) throw new Error('Streaming vault file is not supported!');
		return response.body;
	}

	async write(key: string, value: Binary): Promise<string> {
		const nativePath = toVaultPath(key);
		await this.vault.adapter.writeBinary(nativePath, toArrayBuffer(value));
		return getFileUid(this, key);
	}

	async writeStream(key: string, value: ReadableStream<Binary>): Promise<string> {
		const nativePath = toVaultPath(key);
		const tempPath = `.trash/${crypto.randomUUID()}.part`;
		await ensureKeyDir(this.vault, dirname(key));
		const reader = value.getReader();
		try {
			while (true) {
				const result = await reader.read();
				if (result.done) break;
				await this.vault.adapter.appendBinary(tempPath, toArrayBuffer(result.value));
			}
			await removeVaultFileIfExists(this.vault, nativePath);
			await this.vault.adapter.rename(tempPath, nativePath);
			return getFileUid(this, key);
		} catch (error) {
			await reader.cancel().catch(() => {});
			await removeVaultFileIfExists(this.vault, tempPath);
			throw error;
		} finally {
			reader.releaseLock();
		}
	}

	async delete(key: string): Promise<void> {
		const nativePath = toVaultPath(key);
		if (
			getTrashOption(this.vault) === 'local' ||
			!(await this.vault.adapter.trashSystem(nativePath))
		)
			await this.vault.adapter.trashLocal(nativePath);
	}

	move(oldKey: string, newKey: string): Promise<void> {
		return this.vault.adapter.rename(toVaultPath(oldKey), toVaultPath(newKey));
	}

	async mkdir(key: string): Promise<void> {
		const folderKey = toVaultPath(key);
		if (folderKey === '/') return;
		await this.vault.adapter.mkdir(folderKey);
	}

	exists(key: string) {
		return this.vault.adapter.exists(toVaultPath(key));
	}

	async stat(key: string): Promise<Stat> {
		if (key === '/') return { isDir: true, key: '/' };

		const nativePath = toVaultPath(key);
		const stat = await this.vault.adapter.stat(nativePath);
		if (!stat) throw new Error(`Stat of ${key} not found!`);
		return toStat(nativePath, stat);
	}

	async list(key: string): Promise<Array<Stat>> {
		const result: Array<Stat> = [];
		const visit = async (dir: string) => {
			const path = dir === '/' ? '/' : dir.slice(0, -1);
			const { files, folders } = await this.vault.adapter.list(path);
			await Promise.all(
				[...files, ...folders].map(async (p) => {
					const stat = await this.vault.adapter.stat(p);
					if (!stat) throw new Error(`Stat of ${p} not found!`);
					const s = toStat(p, stat);
					result.push(s);
					if (s.isDir) await visit(s.key);
				}),
			);
		};
		await visit(toVaultPath(key));
		return result;
	}
}
