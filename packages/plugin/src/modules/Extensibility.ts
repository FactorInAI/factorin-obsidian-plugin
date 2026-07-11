import type { Context, Events, Translations } from '@';
import type { App } from 'obsidian';
import type { Ref } from 'synthkernel';
import obsidian, { Notice, requestUrl } from 'obsidian';
import type { General } from '@/types';
import compareVersions from '@/utils/compare-versions';
import toErrorMessage from '@/utils/to-error-message';
import untilTrue from '@/utils/until-true';
import type { Dispatch } from './EventBus';
import type { Translate } from './I18n';

export type ModuleMeta = {
	name: string;
	version: string;
	description: string;
	main: string; // Download link
};
type ModuleSourceSchema = Array<ModuleMeta>;

type NameVersion = { name: string; version: string };
type ModuleInstance = {
	moduleSettings: object;
	dispose?: () => void;
	start?: () => void;
};
type ModuleCtor = new (ctx: object) => ModuleInstance;

const MODULE_EXTENSION = '.js';
const AUTO_UPDATE_DELAY = 10_000;

export default class Extensibility {
	private readonly moduleDir: string;
	private readonly sourceCache = new Map<string, ModuleSourceSchema>(); // URL -> content
	private readonly discoveredModules = new Map<string, string>(); // Name -> version
	private readonly loadedModules = new Map<string, ModuleCtor>(); // Name -> ctor
	private autoUpdateTimeout?: number;

	declare readonly settings: {
		moduleSources: Array<string>;
		modules: Record<string, boolean>;
		moduleAutoUpdate: boolean;
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
		},
	) {
		this.moduleDir = `${ctx.app.vault.configDir}/plugins/sync-engine/modules`;
		(window as General).syncEngineApiBridge = obsidian;
	}

	readonly start = () => {
		const enabled = this.settings.moduleAutoUpdate;
		if (!enabled) return;
		this.autoUpdateTimeout = window.setTimeout(this.updateModules, AUTO_UPDATE_DELAY);
	};

	private readonly createOperationFactory = () => {
		const operations: Array<() => Promise<void>> = [];
		const execute = () => Promise.all(operations.splice(0).map(async (op) => await op()));
		const { adapter } = this.ctx.app.vault;
		const factory = {
			delete: (path: string) => operations.push(() => adapter.remove(path)),
			download: (name: string, version: string, url: string) =>
				operations.push(() => this.downloadModule(name, version, url, false)),
			load: (name: string) => operations.push(() => this.loadModule(name)),
			rename: (source: string, target: string) =>
				operations.push(() => adapter.rename(source, target)),
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
		const { files, folders } = await adapter.list(this.moduleDir);
		folders.forEach((path) => factory.delete(path));
		const foundModules: Array<NameVersion> = [];
		files.forEach((path) => {
			if (!path.includes(MODULE_EXTENSION)) factory.delete(path);
			else if (!path.includes('~')) {
				const versionedPath = `${path.slice(0, -MODULE_EXTENSION.length)}~0.0.1${MODULE_EXTENSION}`;
				factory.rename(path, versionedPath);
				foundModules.push(this.parseModulePath(versionedPath));
			} else foundModules.push(this.parseModulePath(path));
		});
		foundModules.forEach(({ name, version }) => {
			const existingVersion = this.discoveredModules.get(name);
			if (!existingVersion) this.discoveredModules.set(name, version);
			else if (compareVersions(version, existingVersion) === 1) {
				factory.delete(this.getModulePath(name));
				this.discoveredModules.set(name, version);
			} else factory.delete(this.getModulePath(name, version));
		});
		await execute();
		this.discoveredModules.keys().forEach((name) => {
			const enabled = this.settings.modules[name];
			if (enabled === undefined) {
				this.settings.modules[name] = false;
				void this.ctx.saveSettings();
			} else if (enabled) factory.load(name);
		});
		await execute();
	};

	private readonly loadModule = async (name: string, start = false) => {
		if (this.loadedModules.get(name)) return;
		const { dispatch, translate, app, __addModule__, __getModule__, allModules, saveSettings } =
			this.ctx;
		try {
			const { default: ctor } = await import(
				app.vault.adapter.getResourcePath(this.getModulePath(name))
			);
			__addModule__(ctor);
			const instance: ModuleInstance = __getModule__(ctor);
			const settings = this.settings as Partial<Record<string, General>>;
			const existingSettings = settings[name];
			if (existingSettings) {
				Object.assign(instance.moduleSettings, existingSettings);
				settings[name] = instance.moduleSettings;
			} else settings[name] = instance.moduleSettings;
			void saveSettings();
			if (start) instance.start?.();
			allModules.add(ctor);
			this.loadedModules.set(name, ctor);
			dispatch('moduleLoaded', name);
		} catch (error) {
			const message = toErrorMessage(error);
			dispatch('errorGeneral', `Module \`${name}\` failed to load: ${message}`);
			new Notice(`${translate('failedToLoadModule', { name })}: ${message}`);
		}
	};

	private readonly unloadModule = (name: string) => {
		const ctor = this.loadedModules.get(name);
		if (!ctor) return;
		const { __getModule__, dispatch, allModules } = this.ctx;
		const instance: ModuleInstance = __getModule__(ctor as General);
		instance.dispose?.();
		this.loadedModules.delete(name);
		allModules.delete(ctor);
		dispatch('moduleUnloaded', name);
	};

	private readonly downloadModule = async (
		name: string,
		version: string,
		url: string,
		waitIdle = true,
	) => {
		const { dispatch, translate, app, isIdle } = this.ctx;
		try {
			const legacyVersion = this.discoveredModules.get(name);
			if (legacyVersion === version) return;
			dispatch('logGeneral', `Downloading module \`${name}\` of version \`${version}\`.`);
			const { adapter } = app.vault;
			const { arrayBuffer: module } = await requestUrl(url);
			const isRunning = this.loadedModules.has(name);
			if (waitIdle) {
				await untilTrue(isIdle, 'stop');
				isIdle(false);
			}
			if (isRunning) this.unloadModule(name);
			await Promise.all([
				legacyVersion ? adapter.remove(this.getModulePath(name)) : Promise.resolve(),
				adapter.writeBinary(this.getModulePath(name, version), module),
			]);
			this.discoveredModules.set(name, version);
			if (isRunning || this.settings.modules[name]) await this.loadModule(name, true);
			if (waitIdle) isIdle(true);
		} catch (error) {
			const message = toErrorMessage(error);
			dispatch('errorGeneral', `Failed to download module \`${name}\`: ${message}`);
			new Notice(`${translate('failedToDownloadModule', { name })}: ${message}`);
		}
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

	private readonly fetchSources = async (cached = true) => {
		const { dispatch, translate } = this.ctx;
		const { moduleSources } = this.settings;
		const contents = (
			await Promise.all(
				moduleSources.map(async (url) => {
					if (cached) {
						const cachedContent = this.sourceCache.get(url);
						if (cachedContent) return cachedContent;
					}
					try {
						const content = await requestUrl(url).json;
						if (isValidSource(content)) {
							content.forEach((meta) => (meta.name = meta.name.normalize('NFC')));
							this.sourceCache.set(url, content);
							return content;
						}
						throw new Error('Wrong source schema!');
					} catch (error) {
						const message = toErrorMessage(error);
						dispatch(
							'errorGeneral',
							`Failed to fetch source from \`${url}\`: ${message}`,
						);
						new Notice(`${translate('failedToFetchSource', { url })}: ${message}`);
						return [];
					}
				}),
			)
		).flat();
		const modules = new Map<string, ModuleMeta>();
		contents.forEach((meta) => {
			const { name, version } = meta;
			const existingModule = modules.get(name);
			if (existingModule && compareVersions(existingModule.version, version) === 1) return;
			modules.set(name, meta);
		});
		const moduleList = [...modules.values()];
		dispatch(
			'logGeneral',
			`Discovered ${moduleList.length} module(s) from ${moduleSources.length} source(s).`,
		);
		return moduleList;
	};

	private readonly updateModules = async () => {
		if (!this.discoveredModules.size) return;
		const { execute, factory, operations } = this.createOperationFactory();
		const { isIdle } = this.ctx;
		(await this.fetchSources()).forEach(({ name, version, main }) => {
			const existingVersion = this.discoveredModules.get(name);
			if (!existingVersion) return;
			if (compareVersions(version, existingVersion) === 1)
				factory.download(name, version, main);
		});
		if (!operations.length) return;
		await untilTrue(isIdle, 'stop');
		isIdle(false);
		await execute();
		isIdle(true);
	};

	private readonly getModulePath = (name: string, version = this.discoveredModules.get(name)) =>
		`${this.moduleDir}/${name}~${version}${MODULE_EXTENSION}`;

	private readonly parseModulePath = (path: string): NameVersion => {
		const name = path.slice(this.moduleDir.length + 1, -MODULE_EXTENSION.length);
		const segments = name.split('~').map((segment) => segment.normalize('NFC'));
		return { name: segments[0], version: segments[1] };
	};

	readonly dispose = () => {
		window.clearTimeout(this.autoUpdateTimeout);
		delete (window as General).syncEngineApiBridge;
		this.loadedModules.clear();
	};

	readonly root = {
		deleteModule: this.deleteModule,
		discoveredModules: this.discoveredModules,
		downloadModule: this.downloadModule,
		fetchSources: this.fetchSources,
		loadAllModules: this.loadAllModules,
		loadModule: this.loadModule,
		loadedModules: this.loadedModules,
		unloadModule: this.unloadModule,
		updateModules: this.updateModules,
	};
}

function isValidSource(d: unknown): d is ModuleSourceSchema {
	return (
		Array.isArray(d) &&
		d.every(
			(i) =>
				i &&
				['name', 'version', 'description', 'main'].every((k) => typeof i[k] === 'string'),
		)
	);
}
