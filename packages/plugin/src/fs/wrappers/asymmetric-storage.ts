import type { StoreSync } from 'uni-kv';
import { basename, dirname, isFolder, isSub } from '@repo/shared/path';
import type { Progress, Stat, Binary } from '@/types';
import type { Fs, WrappedFs } from '../interface';

const ROOT_KEY = '/';
const ROOT_ANCHOR = '00000';
const EMPTY_BINARY = new Uint8Array(0);

type ParsedFlatKey =
	| { isDir: false; basename: string; parentAnchor: string }
	| { isDir: true; anchor: string; basename: string; parentAnchor: string };

function isRootKey(key: string) {
	return key === ROOT_KEY;
}

function joinFolderKey(parentKey: string, base: string) {
	return parentKey === ROOT_KEY ? `${base}/` : `${parentKey}${base}/`;
}

function joinFileKey(parentKey: string, base: string) {
	return parentKey === ROOT_KEY ? base : `${parentKey}${base}`;
}

function isDescendantOrSelf(key: string, parentKey: string) {
	return isSub(parentKey, key, true);
}

function parseFlattenedKey(key: string): ParsedFlatKey | undefined {
	if (key === ROOT_KEY || key.includes('/')) return undefined;
	if (key.length > 6 && key[5] === '~') {
		const base = key.slice(6);
		if (!base) return undefined;
		return { basename: base, isDir: false, parentAnchor: key.slice(0, 5) };
	}
	if (key.length > 11 && key[10] === '~') {
		const base = key.slice(11);
		if (!base) return undefined;
		return {
			anchor: key.slice(5, 10),
			basename: base,
			isDir: true,
			parentAnchor: key.slice(0, 5),
		};
	}
	return undefined;
}

class AsymmetricStorageFs implements WrappedFs {
	private readonly keyToAnchor = new Map<string, string>([[ROOT_KEY, ROOT_ANCHOR]]);
	private readonly anchorToKey = new Map<string, string>([[ROOT_ANCHOR, ROOT_KEY]]);
	private readonly knownAnchors = new Set<string>([ROOT_ANCHOR]);
	private bootstrapped = false;

	constructor(
		public readonly original: Fs,
		private readonly statStore: StoreSync<Stat>,
	) {}

	getUid() {
		return this.original.getUid();
	}

	read(key: string, size?: number) {
		return this.original.read(this.flattenFileKey(key), size);
	}

	readStream(key: string, size?: number) {
		return this.original.readStream(this.flattenFileKey(key), size);
	}

	write(key: string, value: Binary) {
		return this.original.write(this.flattenFileKey(key), value);
	}

	writeStream(key: string, value: ReadableStream<Binary>, size?: number) {
		return this.original.writeStream(this.flattenFileKey(key), value, size);
	}

	async delete(key: string) {
		if (isFolder(key)) {
			const anchor = this.findAnchor(key);
			this.deleteMapping(key, anchor);
			try {
				return await this.original.delete(this.flattenFolderKey(key, anchor));
			} catch (error) {
				this.registerMapping(key, anchor);
				throw error;
			}
		} else return this.original.delete(this.flattenFileKey(key));
	}

	async move(oldKey: string, newKey: string) {
		const bothFolder = isFolder(oldKey) && isFolder(newKey);
		if (bothFolder) {
			const oldAnchor = this.findAnchor(oldKey);
			const moveAnchor = () => {
				this.anchorToKey.delete(oldAnchor);
				this.registerMapping(newKey, oldAnchor);
			};
			const revertAnchor = () => {
				this.deleteMapping(newKey, oldAnchor);
				this.anchorToKey.set(oldAnchor, oldKey);
			};
			const flattenedNewKey = this.flattenFolderKey(newKey, oldAnchor);
			const flattenedOldKey = this.flattenFolderKey(oldKey);
			moveAnchor();
			if (flattenedOldKey === flattenedNewKey) {
				this.keyToAnchor.delete(oldKey);
				return;
			}
			try {
				await this.original.move(flattenedOldKey, flattenedNewKey);
			} catch (error) {
				revertAnchor();
				throw error;
			}
			this.keyToAnchor.delete(oldKey);
		} else {
			const flattenedNewKey = this.flattenFileKey(newKey);
			const flattenedOldKey = this.flattenFileKey(oldKey);
			if (flattenedOldKey === flattenedNewKey) return;
			return this.original.move(flattenedOldKey, flattenedNewKey);
		}
	}

	async mkdir(key: string, recursive?: boolean) {
		if (isRootKey(key)) return this.original.mkdir(key, recursive);
		const anchor = this.generateAnchor(key);
		this.registerMapping(key, anchor);
		try {
			await this.original.write(this.flattenFolderKey(key, anchor), EMPTY_BINARY);
		} catch (error) {
			this.deleteMapping(key, anchor);
			throw error;
		}
	}

	async stat(key: string) {
		if (isRootKey(key)) return this.original.stat(key);
		const stat = await this.original.stat(this.flattenKey(key));
		return this.inflateStat(stat) ?? stat;
	}

	exists(key: string) {
		return this.original.exists(this.flattenKey(key));
	}

	async list(key: string, progress?: (prog: Progress) => void) {
		const stats = await this.original.list(this.flattenKey(key), progress);
		const seen = new Set<string>();
		const result: Array<Stat> = [];
		for (const stat of stats) {
			const inflated = this.inflateStat(stat);
			if (!inflated || !isDescendantOrSelf(inflated.key, key) || seen.has(inflated.key))
				continue;
			seen.add(inflated.key);
			result.push(inflated);
		}
		return result;
	}

	private flattenKey(key: string) {
		if (isRootKey(key)) return ROOT_KEY;
		return isFolder(key) ? this.flattenFolderKey(key) : this.flattenFileKey(key);
	}

	private flattenFileKey(key: string) {
		const parentAnchor = this.findAnchor(dirname(key));
		return `${parentAnchor}~${basename(key)}`;
	}

	private flattenFolderKey(key: string, folderAnchor = this.findAnchor(key)) {
		const parentAnchor = this.findAnchor(dirname(key));
		return `${parentAnchor}${folderAnchor}~${basename(key)}`;
	}

	private inflateStat(stat: Stat): Stat | undefined {
		if (stat.key === ROOT_KEY) return { isDir: true, key: ROOT_KEY };
		this.bootstrapMaps();
		const parsed = parseFlattenedKey(stat.key);
		if (!parsed) return;
		const parentKey = this.anchorToKey.get(parsed.parentAnchor);
		if (!parentKey) return;
		if (parsed.isDir) {
			const folderKey = joinFolderKey(parentKey, parsed.basename);
			if (!this.registerMapping(folderKey, parsed.anchor)) return;
			return { isDir: true, key: folderKey };
		}
		if (stat.isDir) return;
		return { ...stat, key: joinFileKey(parentKey, parsed.basename) };
	}

	private findAnchor(folderKey: string): string {
		if (isRootKey(folderKey)) return ROOT_ANCHOR;
		this.bootstrapMaps();
		const existing = this.keyToAnchor.get(folderKey);
		if (existing) return existing;
		throw new Error('Cannot find existing anchor, this is probably a bug of Sync Engine.');
	}

	private generateAnchor(folderKey: string): string {
		this.bootstrapMaps();
		const parentAnchor = this.keyToAnchor.get(dirname(folderKey));
		if (!parentAnchor)
			throw new Error(
				"Parent anchor doesn't exist when generating child's. This is probably a bug of Sync Engine.",
			);
		const anchor = generateAnchor(`${parentAnchor}~${basename(folderKey)}`, this.knownAnchors);
		this.registerMapping(folderKey, anchor);
		return anchor;
	}

	private bootstrapMaps() {
		if (this.bootstrapped) return;
		this.bootstrapped = true;
		const candidates: Array<{ anchor: string; basename: string; parentAnchor: string }> = [];
		for (const stat of this.statStore.values()) {
			const parsed = parseFlattenedKey(stat.key);
			if (parsed?.isDir)
				candidates.push({
					anchor: parsed.anchor,
					basename: parsed.basename,
					parentAnchor: parsed.parentAnchor,
				});
		}
		const pending = new Set(candidates.keys());
		let changed = true;
		while (changed && pending.size > 0) {
			changed = false;
			// oxlint-disable-next-line unicorn/no-useless-spread
			for (const index of [...pending]) {
				const candidate = candidates[index];
				const parentKey = this.anchorToKey.get(candidate.parentAnchor);
				if (!parentKey) continue;
				const folderKey = joinFolderKey(parentKey, candidate.basename);
				this.registerMapping(folderKey, candidate.anchor);
				pending.delete(index);
				changed = true;
			}
		}
	}

	private registerMapping(folderKey: string, anchor: string) {
		const currentAnchor = this.keyToAnchor.get(folderKey);
		if (currentAnchor) return currentAnchor === anchor;
		const currentFolderKey = this.anchorToKey.get(anchor);
		if (currentFolderKey) return currentFolderKey === folderKey;
		this.keyToAnchor.set(folderKey, anchor);
		this.anchorToKey.set(anchor, folderKey);
		this.knownAnchors.add(anchor);
		return true;
	}

	private deleteMapping(folderKey: string, anchor: string) {
		this.keyToAnchor.delete(folderKey);
		this.anchorToKey.delete(anchor);
		this.knownAnchors.delete(anchor);
	}
}

export default function asymmetricStorageWrapper(
	original: Fs,
	options: StoreSync<Stat>,
): WrappedFs {
	return new AsymmetricStorageFs(original, options);
}

const SAFE_85 =
	" !#$%&'()+,-.0123456789;=@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{}";
const SAFE_83 =
	"!#$%&'()+,-0123456789;=@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{}";

function generateId(str: string): string {
	let h1 = 0xde_ad_be_ef | 0,
		h2 = 0x41_c6_ce_57 | 0;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2_654_435_761);
		h2 = Math.imul(h2 ^ ch, 1_597_334_677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
	let hash = 4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0);
	const c4 = hash % 83;
	hash = Math.trunc(hash / 83);
	const c3 = hash % 85;
	hash = Math.trunc(hash / 85);
	const c2 = hash % 85;
	hash = Math.trunc(hash / 85);
	const c1 = hash % 85;
	hash = (hash / 85) | 0;
	const c0 = hash % 85;
	return SAFE_85[c0] + SAFE_85[c1] + SAFE_85[c2] + SAFE_85[c3] + SAFE_83[c4];
}
function generateAnchor(source: string, existing: Set<string>) {
	let anchor: string;
	do anchor = generateId(source);
	while (existing.has(anchor) && (source += '☭'));
	return anchor;
}
