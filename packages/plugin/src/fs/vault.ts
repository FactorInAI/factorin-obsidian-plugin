import type { ListedFiles, Vault } from 'obsidian';
import { toArrayBuffer, toUint8Array } from '@repo/shared/binary';
import { stripEndSlash } from '@repo/shared/path';
import { TFolder } from 'obsidian';
import type { Stat, Binary } from '@/types';
import type { Fs, ListReporter, RootFs } from './interface';

// Wait for the completion of file enumeration: https://forum-zh.obsidian.md/t/topic/58894
let canUseCache = false;
window.setTimeout(() => (canUseCache = true), 5000);
const TEMP_FOLDER = '.trash';

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
		const tempPath = `${TEMP_FOLDER}/${crypto.randomUUID()}.part`;
		const reader = value.getReader();
		const { adapter } = this.vault;
		if (!(await adapter.exists(TEMP_FOLDER))) await adapter.mkdir(TEMP_FOLDER);
		try {
			while (true) {
				const result = await reader.read();
				if (result.done) break;
				await adapter.appendBinary(tempPath, toArrayBuffer(result.value));
			}
			await removeVaultFileIfExists(this.vault, nativePath);
			await adapter.rename(tempPath, nativePath);
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

	async list(key: string, reporter: ListReporter): Promise<Array<Stat>> {
		const result: Array<Stat> = [];
		let completed = 1;
		let total = 1;
		const visit = async (dir: string) => {
			const { files, folders } = await this.listCached(toVaultPath(dir));
			completed++;
			total += files.length + folders.length;
			await Promise.all([
				...files.map(async (p) => {
					if ((await reporter({ completed, current: p, total })) === 'exclude') {
						completed++;
						return;
					}
					result.push(await this.statCached(p));
					completed++;
				}),
				...folders.map(async (p) => {
					const folderKey = toKey(p, true);
					const report = await reporter({ completed, current: folderKey, total });
					if (report === 'exclude') {
						completed++;
						return;
					}
					result.push({ isDir: true, key: folderKey });
					if (report === 'include') {
						completed++;
						return;
					}
					await visit(p);
				}),
			]);
		};
		await visit(toVaultPath(key));
		return result;
	}

	private listCached(dir: string): ListedFiles | Promise<ListedFiles> {
		const path = toVaultPath(dir);
		if (canUseCache && dir !== '/') {
			const folder = this.vault.getAbstractFileByPath(dir);
			if (folder instanceof TFolder) {
				const children: ListedFiles = { files: [], folders: [] };
				folder.children.forEach((child) =>
					child instanceof TFolder
						? children.folders.push(child.path)
						: children.files.push(child.path),
				);
				return children;
			}
		}
		return this.vault.adapter.list(path);
	}

	private async statCached(key: string): Promise<Stat> {
		if (canUseCache) {
			const file = this.vault.getFileByPath(key);
			if (file) {
				const { mtime, size } = file.stat;
				return { isDir: false, key, mtime, size, uid: `${mtime}~${size}` };
			}
		}
		const rawFile = await this.vault.adapter.stat(key);
		if (!rawFile) throw new Error(`Stat of "${key}" not found!`);
		return toStat(key, rawFile);
	}
}
