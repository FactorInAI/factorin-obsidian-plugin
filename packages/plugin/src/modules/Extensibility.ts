import type { Context, Events, Translations } from '@';
import type { App, DataAdapter } from 'obsidian';
import type { Ref } from 'synthkernel';
import type { StoreOperations } from 'uni-kv';
import loadModule from '$/e2e-utils';
import hash from '@repo/shared/crypto';
import obsidian, { Notice, requestUrl } from 'obsidian';
import { compare } from 'verkit';
import type { DatabaseAsync, StoreAsync } from '@/sdk';
import type { General } from '@/types';
import UnknownModuleModal from '@/components/UnknownModuleModal';
import sha256 from '@/utils/sha-256';
import toErrorMessage from '@/utils/to-error-message';
import untilTrue from '@/utils/until-true';
import type { Dispatch } from './EventBus';
import type { Translate } from './I18n';
import { VERSION } from './EventBus';

export type ModuleInstance = {
	moduleSettings: object;
	dispose?: () => void;
	start?: () => void;
};
export type ModuleCtor = new (ctx: object) => ModuleInstance;

export type ModuleMeta = {
	id: string;
	name: string;
	version: string;
	description: string;
	main: string; // Download link
	icon?: string;
	minPluginVersion?: string;
	integrity: string;
};
export type AugmentedModuleMeta = ModuleMeta & {
	enabled: boolean;
	source: string;
	icon: string;
};

const MODULE_EXTENSION = '.js';
const AUTO_UPDATE_DELAY = 200;

export default class Extensibility {
	private readonly moduleDir: string;
	private readonly sourceCache = new Map<string, Array<unknown>>(); // URL -> content
	private readonly discoveredModules = new Map<string, AugmentedModuleMeta>();
	private readonly loadedModules = new Map<string, ModuleCtor>(); // Name -> ctor
	private readonly moduleStore: StoreAsync<AugmentedModuleMeta>;
	private autoUpdateTimeout?: number;

	declare readonly settings: {
		moduleSources: Array<string>;
		moduleAutoUpdate: boolean;
		modules: Record<string, object>;
	};
	declare readonly i18n: {
		failedToLoadModule: string;
		failedToDownloadModule: string;
		failedToFetchSource: string;
	};
	declare readonly events: {
		moduleLoaded: string;
		moduleUnloaded: string;
	};

	constructor(
		private readonly ctx: {
			app: App;
			__addModule__: Context['__addModule__'];
			__getModule__: Context['__getModule__'];
			dispatch: Dispatch<Events>;
			translate: Translate<Translations>;
			allModules: Set<General>;
			isIdle: Ref<boolean>;
			saveSettings: () => Promise<void>;
			indexedDB: DatabaseAsync<Record<string, AugmentedModuleMeta>>;
		},
	) {
		this.moduleDir = `${ctx.app.vault.configDir}/plugins/sync-engine/modules`;
		(window as General).syncEngineApiBridge = obsidian;
		this.moduleStore = ctx.indexedDB.getStore(`module-${hash(ctx.app.vault.getName())}`);
	}

	readonly start = () => {
		if (!this.settings.moduleAutoUpdate) return;
		this.autoUpdateTimeout = window.setTimeout(
			() => void this.updateModules(),
			AUTO_UPDATE_DELAY,
		);
	};

	private readonly createOperationFactory = () => {
		const operations: Array<() => Promise<void>> = [];
		const storeOps: Array<StoreOperations<AugmentedModuleMeta>> = [];
		const execute = () =>
			Promise.all([
				...operations.splice(0).map((op) => op()),
				this.moduleStore.batch(storeOps.splice(0)),
			]);
		const { adapter } = this.ctx.app.vault;
		const factory = {
			delete: (path: string) => operations.push(() => adapter.remove(path)),
			download: (meta: AugmentedModuleMeta) =>
				operations.push(() => this.downloadModule(meta, false)),
			load: (meta: AugmentedModuleMeta) => operations.push(() => this.loadModule(meta)),
			store: (operation: StoreOperations<AugmentedModuleMeta>) => storeOps.push(operation),
		};
		return { execute, factory, operations };
	};

	private readonly loadAllModules = async () => {
		const { adapter } = this.ctx.app.vault;
		if (!(await adapter.exists(this.moduleDir))) {
			await adapter.mkdir(this.moduleDir);
			return;
		}
		const { factory, execute } = this.createOperationFactory();
		const [{ files, folders }, recordedModules] = await Promise.all([
			adapter.list(this.moduleDir),
			this.moduleStore.entries().then((result) => new Map(result)),
		]);

		const legacyValues = Object.values(this.settings.modules);
		if (
			files.some((str) => str.includes('~')) &&
			(!legacyValues.length || legacyValues.some((value) => typeof value === 'boolean'))
		)
			await migrateModules({
				adapter,
				baseDir: this.moduleDir,
				fileList: files,
				moduleStore: this.moduleStore,
				settings: this.settings,
			});

		folders.forEach((path) => factory.delete(path));
		const foundModules = new Set<string>();
		files.forEach((path) => {
			if (path.endsWith(MODULE_EXTENSION)) foundModules.add(this.parseModulePath(path));
			else factory.delete(path);
		});
		for (const id of new Set(...foundModules, ...recordedModules.keys())) {
			const meta = recordedModules.get(id);
			if (!foundModules.has(id)) factory.store({ key: id, type: 'delete' });
			else if (!meta)
				new UnknownModuleModal(this.ctx, {
					id,
					onSave: async (newMeta) => {
						this.discoveredModules.set(id, newMeta);
						await Promise.all([
							this.moduleStore.set(id, newMeta),
							newMeta.enabled ? this.loadModule(newMeta, true) : Promise.resolve(),
						]);
					},
					path: this.getModulePath(id),
				}).open();
			else {
				this.discoveredModules.set(id, meta);
				if (meta.enabled) factory.load(meta);
			}
		}
		await execute();
	};

	private readonly loadModule = async (
		{ id, integrity, name }: AugmentedModuleMeta,
		start = false,
		module?: string,
	) => {
		if (this.loadedModules.get(id)) return;
		const { dispatch, translate, app, __addModule__, __getModule__, allModules, saveSettings } =
			this.ctx;
		try {
			const ctor = await loadModule({
				integrity,
				module,
				path: app.vault.adapter.getResourcePath(this.getModulePath(id)),
			});
			__addModule__(ctor);
			const instance: ModuleInstance = __getModule__(ctor);
			const modules = this.settings.modules;
			const moduleSettings = modules[id];
			if (moduleSettings) {
				Object.assign(instance.moduleSettings, moduleSettings);
				modules[id] = instance.moduleSettings;
			} else modules[id] = instance.moduleSettings;
			void saveSettings();
			if (start) instance.start?.();
			allModules.add(ctor);
			this.loadedModules.set(id, ctor);
			dispatch('moduleLoaded', id);
		} catch (error) {
			const message = toErrorMessage(error);
			dispatch('errorGeneral', `Module \`${id}\` failed to load: ${message}`);
			new Notice(`${translate('failedToLoadModule', { name })}: ${message}`);
		}
	};

	private readonly unloadModule = (id: string) => {
		const ctor = this.loadedModules.get(id);
		if (!ctor) return;
		const { __getModule__, dispatch, allModules } = this.ctx;
		const instance: ModuleInstance = __getModule__(ctor as General);
		instance.dispose?.();
		this.loadedModules.delete(id);
		allModules.delete(ctor);
		dispatch('moduleUnloaded', id);
	};

	private readonly downloadModule = async (meta: AugmentedModuleMeta, waitIdle = true) => {
		const { id, version, main, enabled, name } = meta;
		const { dispatch, translate, app, isIdle } = this.ctx;
		let setBusy = false;
		try {
			const legacy = this.discoveredModules.get(id);
			if (legacy?.version === version) return;
			dispatch('logGeneral', `Downloading module \`${id}\` of version \`${version}\`.`);
			const { adapter } = app.vault;
			const module = await requestUrl(main).text;
			const isRunning = this.loadedModules.has(id);
			if (waitIdle) {
				await untilTrue(isIdle, 'stop');
				setBusy = true;
				isIdle(false);
			}
			if (isRunning) this.unloadModule(id);
			await Promise.all([
				adapter.write(this.getModulePath(id), module),
				isRunning || enabled ? this.loadModule(meta, true, module) : Promise.resolve(),
				this.moduleStore.set(id, meta),
			]);
			this.discoveredModules.set(id, meta);
		} catch (error) {
			const message = toErrorMessage(error);
			dispatch('errorGeneral', `Failed to download module \`${id}\`: ${message}`);
			new Notice(`${translate('failedToDownloadModule', { name })}: ${message}`);
		}
		if (setBusy) isIdle(true);
	};

	private readonly deleteModule = async (name: string) => {
		const version = this.discoveredModules.get(name);
		if (!version) return;
		this.unloadModule(name);
		await this.ctx.app.vault.adapter.remove(this.getModulePath(name));
		this.discoveredModules.delete(name);
		delete this.settings.modules[name];
		void this.ctx.saveSettings();
	};

	private readonly fetchSources = async (manual = false) => {
		const { dispatch, translate } = this.ctx;
		const { moduleSources } = this.settings;
		const modules = Array<AugmentedModuleMeta>();
		const fetchSingleSource = async (url: string): Promise<Array<unknown>> => {
			try {
				const content = await requestUrl(url).json;
				if (!Array.isArray(content)) throw new Error('Wrong source schema!');
				this.sourceCache.set(url, content);
				return content;
			} catch (error) {
				const message = toErrorMessage(error);
				dispatch('errorGeneral', `Failed to fetch source from \`${url}\`: ${message}`);
				if (manual) new Notice(`${translate('failedToFetchSource', { url })}: ${message}`);
				return [];
			}
		};
		await Promise.all(
			moduleSources.map(async (url) => {
				const content = manual
					? await fetchSingleSource(url)
					: (this.sourceCache.get(url) ?? (await fetchSingleSource(url)));
				const seenId = new Set<string>();
				content.forEach((meta: unknown) => {
					if (!isValidMeta(meta)) return;
					const { id, minPluginVersion, icon } = meta;
					if (
						(minPluginVersion && compare(VERSION, minPluginVersion) === -1) ||
						seenId.has(id)
					)
						return;
					seenId.add(id);
					modules.push({
						...meta,
						enabled: this.discoveredModules.get(id)?.enabled ?? false,
						icon: icon ?? 'puzzle',
						id: id.normalize('NFC'),
						source: url,
					});
				});
			}),
		);
		dispatch(
			'logGeneral',
			`Discovered ${modules.length} module(s) from ${moduleSources.length} source(s).`,
		);
		return modules;
	};

	private readonly updateModules = async () => {
		if (!this.discoveredModules.size) return;
		const { execute, factory, operations } = this.createOperationFactory();
		const { isIdle } = this.ctx;
		(await this.fetchSources()).forEach((meta) => {
			const { id, source, version } = meta;
			const existing = this.discoveredModules.get(id);
			if (!existing || source !== existing.source) return;
			if (compare(version, existing.version) === 1) factory.download(meta);
		});
		if (!operations.length) return;
		await untilTrue(isIdle, 'stop');
		isIdle(false);
		await execute();
		isIdle(true);
	};

	private readonly enableModule = async (id: string, load = false) => {
		const meta = await this.moduleStore.get(id);
		if (!meta || meta.enabled) return;
		await Promise.all([
			this.moduleStore.set(id, Object.assign(meta, { enabled: true })),
			load ? this.loadModule(meta, true) : Promise.resolve(),
		]);
	};

	private readonly disableModule = async (id: string, unload = false) => {
		const meta = await this.moduleStore.get(id);
		if (!meta || !meta.enabled) return;
		if (unload) this.unloadModule(id);
		await this.moduleStore.set(id, Object.assign(meta, { enabled: false }));
	};

	private readonly getModulePath = (id: string) => `${this.moduleDir}/${id}${MODULE_EXTENSION}`;

	private readonly parseModulePath = (path: string) =>
		path.slice(this.moduleDir.length + 1, -MODULE_EXTENSION.length).normalize('NFC');

	readonly dispose = () => {
		window.clearTimeout(this.autoUpdateTimeout);
		delete (window as General).syncEngineApiBridge;
		this.loadedModules.clear();
	};

	readonly root = {
		deleteModule: this.deleteModule,
		disableModule: this.disableModule,
		discoveredModules: this.discoveredModules,
		downloadModule: this.downloadModule,
		enableModule: this.enableModule,
		fetchSources: this.fetchSources,
		loadAllModules: this.loadAllModules,
		loadModule: this.loadModule,
		loadedModules: this.loadedModules,
		unloadModule: this.unloadModule,
		updateModules: this.updateModules,
	};
}

function isValidMeta(meta: unknown): meta is ModuleMeta {
	const isMetaShape = (item: unknown): item is ModuleMeta => {
		if (!item || typeof item !== 'object') return false;
		const requiredFields = [
			'name',
			'version',
			'description',
			'main',
			'integrity',
			'id',
		] as const;
		return requiredFields.every((field) => typeof (item as never)[field] === 'string');
	};
	if (!isMetaShape(meta)) return false;
	return !/[<>:"/\\|?*]/.test(meta.id) && meta.integrity !== '';
}

// TODO: remove after August 12
async function migrateModules({
	moduleStore,
	fileList,
	adapter,
	baseDir,
	settings,
}: {
	moduleStore: StoreAsync<AugmentedModuleMeta>;
	fileList: Array<string>;
	adapter: DataAdapter;
	baseDir: string;
	settings: { modules: Record<string, object> };
}) {
	const moduleIdMap: Record<string, string> = {
		Encryption: 'encryption',
		'I18n 简体中文': 'i18n-zh',
		'Smart Merge': 'smart-merge',
		WebDAV: 'webdav',
	};
	const legacySettings = settings as unknown as {
		modules: Record<string, boolean>;
	} & Record<string, object>;
	function parseModulePath(path: string) {
		const name = path.slice(baseDir.length + 1, -MODULE_EXTENSION.length);
		const segments = name.split('~').map((segment) => segment.normalize('NFC'));
		return { name: segments[0], version: segments[1] };
	}
	const getModulePath = (name: string) => `${baseDir}/${name}${MODULE_EXTENSION}`;
	const dbWrites: Array<{ key: string; value: AugmentedModuleMeta }> = [];
	const operations: Array<() => Promise<unknown>> = [
		() =>
			moduleStore.batch(
				dbWrites.map(
					(write): StoreOperations<AugmentedModuleMeta> =>
						Object.assign(write, { type: 'set' } as const),
				),
			),
	];
	await Promise.all(
		fileList.map(async (path) => {
			if (!path.includes('~')) return;
			const { name, version } = parseModulePath(path);
			const file = await adapter.read(path);
			const key = moduleIdMap[name] ?? name;
			const id = moduleIdMap[name] ?? name;
			dbWrites.push({
				key,
				value: {
					description: '',
					enabled: legacySettings.modules[name] ?? false,
					icon: 'puzzle',
					id,
					integrity: await sha256(file),
					main: `https://sync.consensia.cc/modules/${encodeURIComponent(name)}.js`,
					name,
					source: 'https://sync.consensia.cc/modules.json',
					version,
				},
			});
			settings.modules[id] = legacySettings[id];
			operations.push(
				() => adapter.remove(path),
				() => adapter.write(getModulePath(id), file),
			);
		}),
	);
	await Promise.all(operations.map((fn) => fn()));
}
