import type { Events } from '@';
import type { App, Plugin, RequestUrlParam } from 'obsidian';
import type { StoreAsync } from 'uni-kv';
import { toArrayBuffer, toUint8Array } from '@repo/shared/binary';
import { hash } from '@repo/shared/crypto';
import { PluginSettingTab, requestUrl } from 'obsidian';
import type { BatchOptimizer, Fs, RootFs } from '@/fs';
import type { ConflictResolver, Decider } from '@/sync';
import type { General, MaybePromise, RecordStat, Stat, Binary } from '@/types';
import { VaultFs } from '@/fs';
import type { On } from './EventBus';
import type { RecordStore } from './Storage';

export type FsWrapperEntry = {
	order: number;
	apply: (fs: Fs) => Fs;
	condition?: () => boolean;
};
export type CheckConnectionResult = { success: true } | { success: false; reason: string };
export type RemoteFsEntry = {
	instantiate: (request: Request) => RootFs;
	prettyName: string;
	checkConnection: (request: Request) => MaybePromise<CheckConnectionResult>;
};
export type RequestMiddlewareEntry = {
	order: number;
	apply: RequestMiddleware;
};
export type DeciderEntry = { decider: Decider; prettyName: string };
export type RemoteStatsGetter = (infras: Infras) => MaybePromise<Array<Stat> | undefined>;
export type SyncTriggerEntry = {
	getRemoteStats?: RemoteStatsGetter;
	priority: number;
};
export type OptimizerEntry = {
	optimizer: BatchOptimizer;
	condition?: () => boolean;
};
export type SettingEntry = {
	order: number;
	render: (el: HTMLElement) => void;
};
export type ConflictResolverEntry = {
	prettyName: string;
	resolver: ConflictResolver;
};
export type RequestParam = Omit<RequestUrlParam, 'body'> & { body?: string | Binary };
export type Request = (params: RequestParam | string) => Promise<{
	text: () => string;
	bytes: () => Binary;
	json: () => General;
	headers: Record<string, string>;
	status: number;
}>;
export type RequestMiddleware = (request: Request) => Request;
export type Infras = { localFs: Fs; remoteFs: Fs; record: RecordStore };

const request: Request = async (params: RequestParam | string) => {
	if (typeof params === 'object' && params.body instanceof Uint8Array)
		(params as RequestUrlParam).body = toArrayBuffer(params.body);
	const response = await requestUrl(params as RequestUrlParam);
	return {
		bytes: () => toUint8Array(response.arrayBuffer),
		headers: response.headers,
		json: () => response.json,
		status: response.status,
		text: () => response.text,
	};
};

export default class Registrar {
	private settingTab?: SettingTab;
	private readonly cleanupCallbacks: Array<() => void> = [];

	private readonly localFsWrapperRegistry = new Set<FsWrapperEntry>();
	private readonly remoteFsWrapperRegistry = new Set<FsWrapperEntry>();
	private readonly localOptimizerRegistry = new Set<OptimizerEntry>();
	private readonly remoteOptimizerRegistry = new Set<OptimizerEntry>();
	private readonly remoteFsRegistry = new Map<string, RemoteFsEntry>();
	private readonly deciderRegistry = new Map<string, DeciderEntry>();
	private readonly syncTriggerRegistry = new Map<string, SyncTriggerEntry>();
	private readonly settingRegistry = new Set<SettingEntry>();
	private readonly conflictResolverRegistry = new Map<string, ConflictResolverEntry>();
	private readonly requestMiddlewareRegistry = new Set<RequestMiddlewareEntry>();

	declare readonly settings: { remoteFs: string; decider: string; conflictResolver: string };

	constructor(
		private readonly ctx: {
			app: App;
			on: On<Events>;
			getRecordStore: (namespace?: string) => StoreAsync<RecordStat>;
		},
	) {
		this.cleanupCallbacks.push(
			ctx.on('moduleLoaded', this.rerenderSettingTab),
			ctx.on('moduleUnloaded', this.rerenderSettingTab),
		);
	}

	private readonly registerLocalFsWrapper = (entry: FsWrapperEntry) => {
		this.localFsWrapperRegistry.add(entry);
		return () => this.localFsWrapperRegistry.delete(entry);
	};
	private readonly registerRemoteFsWrapper = (entry: FsWrapperEntry) => {
		this.remoteFsWrapperRegistry.add(entry);
		return () => this.remoteFsWrapperRegistry.delete(entry);
	};
	private readonly registerRemoteFs = (id: string, entry: RemoteFsEntry) => {
		this.remoteFsRegistry.set(id, entry);
		return () => this.remoteFsRegistry.delete(id);
	};
	private readonly registerDecider = (id: string, entry: DeciderEntry) => {
		this.deciderRegistry.set(id, entry);
		return () => this.deciderRegistry.delete(id);
	};
	private readonly registerRemoteOptimizer = (entry: OptimizerEntry) => {
		this.remoteOptimizerRegistry.add(entry);
		return () => this.remoteOptimizerRegistry.delete(entry);
	};
	private readonly registerLocalOptimizer = (optimizer: OptimizerEntry) => {
		this.localOptimizerRegistry.add(optimizer);
		return () => this.localOptimizerRegistry.delete(optimizer);
	};
	private readonly registerSyncTrigger = (id: string, entry: SyncTriggerEntry) => {
		this.syncTriggerRegistry.set(id, entry);
		return () => this.syncTriggerRegistry.delete(id);
	};
	private readonly registerSetting = (entry: SettingEntry) => {
		this.settingRegistry.add(entry);
		return () => this.settingRegistry.delete(entry);
	};
	private readonly registerConflictResolver = (id: string, entry: ConflictResolverEntry) => {
		this.conflictResolverRegistry.set(id, entry);
		return () => this.conflictResolverRegistry.delete(id);
	};
	private readonly registerRequestMiddleware = (entry: RequestMiddlewareEntry) => {
		this.requestMiddlewareRegistry.add(entry);
		return () => this.requestMiddlewareRegistry.delete(entry);
	};
	private readonly registerCss = (css: string) => {
		const style = createEl('style', { text: css, type: 'text/css' });
		document.head.appendChild(style);
		return () => style.remove();
	};

	private readonly createLocalFs = () => {
		const wrappers: Record<number, (fs: Fs) => Fs> = {};
		for (const { apply, order, condition } of this.localFsWrapperRegistry)
			if (!condition || condition()) wrappers[order] = apply;
		let fs: Fs = new VaultFs(this.ctx.app.vault);
		for (const apply of Object.values(wrappers)) fs = apply(fs);
		return fs;
	};

	private readonly createRemoteFs = (remoteFs = this.settings.remoteFs) => {
		const wrappers: Record<number, (fs: Fs) => Fs> = {};
		for (const { apply, order, condition } of this.remoteFsWrapperRegistry)
			if (!condition || condition()) wrappers[order] = apply;
		const entry = this.remoteFsRegistry.get(remoteFs);
		if (!entry) {
			if (!remoteFs) throw new Error('Please install a backend!');
			throw new Error(`Backend "${remoteFs}" is not installed!`);
		}
		let fs = entry.instantiate(this.getRequest());
		for (const apply of Object.values(wrappers)) fs = apply(fs);
		return fs;
	};

	private readonly getRequest = () => {
		const middlewares: Record<number, RequestMiddleware> = {};
		for (const { apply, order } of this.requestMiddlewareRegistry) middlewares[order] = apply;
		let req: Request = request;
		for (const apply of Object.values(middlewares)) req = apply(req);
		return req;
	};

	private readonly getCheckConnection = (remoteFs = this.settings.remoteFs) => {
		const entry = this.remoteFsRegistry.get(remoteFs);
		if (!entry) {
			if (!remoteFs) throw new Error('Please install a backend!');
			throw new Error(`Backend "${remoteFs}" is not installed!`);
		}
		return () => entry.checkConnection(this.getRequest());
	};

	private readonly getDecider = () => {
		const decider = this.deciderRegistry.get(this.settings.decider);
		if (!decider) throw new Error(`Decider "${this.settings.decider}" not installed!`);
		return decider.decider;
	};

	private readonly getOptimizer = (registry: Set<OptimizerEntry>) => {
		let selected: BatchOptimizer | undefined;
		let isBounded = false;
		for (const { optimizer, condition } of registry)
			if (condition?.()) {
				isBounded = true;
				selected = optimizer;
			} else if (!isBounded) selected = optimizer;
		if (!selected) throw new Error('No remote optimizer registered!');
		return selected;
	};

	private readonly getLocalOptimizer = () => this.getOptimizer(this.localOptimizerRegistry);
	private readonly getRemoteOptimizer = () => this.getOptimizer(this.remoteOptimizerRegistry);

	private readonly getConflictResolver = () => {
		const id = this.settings.conflictResolver;
		const resolver = this.conflictResolverRegistry.get(id);
		if (!resolver) throw new Error(`Conflict resolution strategy "${id}" not installed!`);
		return resolver.resolver;
	};

	private readonly reduceSyncTrigger = (triggers: Array<string>) => {
		let maxPriority = -Infinity;
		let trigger: string | undefined;
		for (const id of triggers) {
			const entry = this.syncTriggerRegistry.get(id);
			if (entry && entry.priority >= maxPriority) {
				maxPriority = entry.priority;
				trigger = id;
			}
		}
		return trigger ?? 'unknown';
	};

	private readonly getRemoteStatsGetter = (trigger: string) =>
		this.syncTriggerRegistry.get(trigger)?.getRemoteStats;

	private readonly getNamespace = (localFs?: Fs, remoteFs?: Fs) => {
		localFs ??= this.createLocalFs();
		remoteFs ??= this.createRemoteFs();
		return hash(`${localFs.getUid()}~~${remoteFs.getUid()}`);
	};

	private readonly initializeSync = (): Infras => {
		const localFs = this.createLocalFs();
		const remoteFs = this.createRemoteFs();
		const namespace = this.getNamespace(localFs, remoteFs);
		const record = this.ctx.getRecordStore(namespace);
		return { localFs, record, remoteFs };
	};

	private readonly addSettingTab = (plugin: Plugin) => {
		this.settingTab = new SettingTab(plugin, this.settingRegistry);
		plugin.addSettingTab(this.settingTab);
	};
	private readonly rerenderSettingTab = () => this.settingTab?.display();

	root = {
		addSettingTab: this.addSettingTab,
		conflictResolverRegistry: this.conflictResolverRegistry,
		createLocalFs: this.createLocalFs,
		createRemoteFs: this.createRemoteFs,
		deciderRegistry: this.deciderRegistry,
		getCheckConnection: this.getCheckConnection,
		getConflictResolver: this.getConflictResolver,
		getDecider: this.getDecider,
		getLocalOptimizer: this.getLocalOptimizer,
		getNamespace: this.getNamespace,
		getRemoteOptimizer: this.getRemoteOptimizer,
		getRemoteStatsGetter: this.getRemoteStatsGetter,
		getRequest: this.getRequest,
		initializeSync: this.initializeSync,
		reduceSyncTrigger: this.reduceSyncTrigger,
		registerConflictResolver: this.registerConflictResolver,
		registerCss: this.registerCss,
		registerDecider: this.registerDecider,
		registerLocalFsWrapper: this.registerLocalFsWrapper,
		registerLocalOptimizer: this.registerLocalOptimizer,
		registerRemoteFs: this.registerRemoteFs,
		registerRemoteFsWrapper: this.registerRemoteFsWrapper,
		registerRemoteOptimizer: this.registerRemoteOptimizer,
		registerRequestMiddleware: this.registerRequestMiddleware,
		registerSetting: this.registerSetting,
		registerSyncTrigger: this.registerSyncTrigger,
		remoteFsRegistry: this.remoteFsRegistry,
		rerenderSettingTab: this.rerenderSettingTab,
	};

	readonly dispose = () => this.cleanupCallbacks.splice(0).forEach((fn) => fn());
}

class SettingTab extends PluginSettingTab {
	constructor(
		plugin: Plugin,
		private readonly settingRegistry: Set<SettingEntry>,
	) {
		super(plugin.app, plugin);
	}

	display(): void {
		if (!this.containerEl) return;
		this.containerEl.empty();
		const sorted: Record<number, (el: HTMLElement) => void> = {};
		for (const { order, render } of this.settingRegistry) sorted[order] = render;
		for (const render of Object.values(sorted)) render(this.containerEl);
	}
}
