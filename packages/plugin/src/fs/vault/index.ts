import type { Stat, Binary } from '@/types';
import type { ListReporter, RootFs } from '../interface';
import type { VaultRequest } from './request';

const TEMP_FOLDER = '.trash';

async function removeIfExists(fs: VaultFs, key: string, permanent?: boolean): Promise<void> {
	if (await fs.exists(key)) await fs.delete(key, permanent);
}

async function getFileUid(fs: VaultFs, key: string): Promise<string> {
	// Vault cache might be stale after a fresh write
	const stat = await fs.stat(key, true);
	if (stat.isDir) throw new Error(`File ${key} not found!`);
	return stat.uid;
}

export default class VaultFs implements RootFs {
	constructor(
		private readonly request: VaultRequest,
		private readonly name: string,
	) {}

	getUid(): string {
		return `obsidian-vault~${this.name}`;
	}

	read(key: string): Promise<Binary> {
		return this.request({ key, method: 'GET' });
	}

	readStream(key: string) {
		return this.request({ key, method: 'GET_STREAM' });
	}

	async write(key: string, value: Binary): Promise<string> {
		await this.request({ key, method: 'POST', value });
		return getFileUid(this, key);
	}

	async writeStream(key: string, value: ReadableStream<Binary>): Promise<string> {
		const tempPath = `${TEMP_FOLDER}/${crypto.randomUUID()}.part`;
		const reader = value.getReader();
		if (!(await this.exists(TEMP_FOLDER))) await this.mkdir(TEMP_FOLDER);
		try {
			while (true) {
				const result = await reader.read();
				if (result.done) break;
				await this.request({ key: tempPath, method: 'APPEND', value: result.value });
			}
			await removeIfExists(this, key);
			await this.move(tempPath, key);
			return getFileUid(this, key);
		} catch (error) {
			await reader.cancel().catch(() => {});
			await removeIfExists(this, tempPath, true);
			throw error;
		} finally {
			reader.releaseLock();
		}
	}

	delete(key: string, permanent = false): Promise<void> {
		return this.request({ headers: { permanent }, key, method: 'DELETE' });
	}

	move(oldKey: string, newKey: string): Promise<void> {
		return this.request({ headers: { destination: newKey }, key: oldKey, method: 'MOVE' });
	}

	mkdir(key: string): Promise<void> {
		return this.request({ key, method: 'MKDIR' });
	}

	exists(key: string) {
		return this.request({ key, method: 'EXISTS' });
	}

	async list(key: string, reporter: ListReporter, noCache = false): Promise<Array<Stat>> {
		const result: Array<Stat> = [];
		let completed = 1;
		let total = 1;
		const visit = async (dir: string) => {
			const { files, folders } = await this.request({
				headers: { noCache },
				key: dir,
				method: 'LIST',
			});
			completed++;
			total += files.length + folders.length;
			await Promise.all([
				...files.map(async (p) => {
					if ((await reporter({ completed, current: p, total })) === 'exclude') {
						completed++;
						return;
					}
					result.push(await this.stat(p));
					completed++;
				}),
				...folders.map(async (p) => {
					const report = await reporter({ completed, current: p, total });
					if (report !== 'advance') completed++;
					if (report === 'exclude') return;
					result.push({ isDir: true, key: p });
					if (report === 'include') return;
					await visit(p);
				}),
			]);
		};
		await visit(key);
		return result;
	}

	async stat(key: string, noCache = false): Promise<Stat> {
		const { type, mtime, size } = await this.request({
			headers: { noCache },
			key,
			method: 'STAT',
		});
		return type === 'file'
			? { isDir: false, key, mtime, size, uid: `${mtime}~${size}` }
			: { isDir: true, key };
	}
}
