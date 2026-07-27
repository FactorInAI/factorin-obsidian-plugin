import type { Hook } from 'synthkernel';
import { render } from 'solid-js/web';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { Translate } from '@/modules/I18n';
import App from './App';

export type PendingAction = 'delete' | 'disable' | 'download' | 'enable';

export type ModuleManagementTranslations = {
	disableModule: string;
	disabled: string;
	downloadModule: string;
	enableModule: string;
	enabled: string;
	installed: string;
	loadingModules: string;
	noInstalledModulesFound: string;
	noMatchingModulesFound: string;
	noModulesAvailable: string;
	notInstalled: string;
	updateAvailable: string;
	updateModule: string;
	deleteModule: string;
};

type ModuleManagementHooks = {
	onQuery: Hook<[string]>;
	onShowInstalledOnlyChange: Hook<[boolean]>;
	onSourcesChange: Hook;
};

export type ModuleManagementContext = {
	fetchSources: (manual?: boolean) => Promise<Array<AugmentedModuleMeta>>;
	discoveredModules: Map<string, AugmentedModuleMeta>;
	loadedModules: Map<string, unknown>;
	downloadModule: (meta: AugmentedModuleMeta) => Promise<void>;
	deleteModule: (id: string) => Promise<void>;
	loadModule: (meta: AugmentedModuleMeta, start?: boolean) => Promise<void>;
	unloadModule: (id: string) => void;
	enableModule: (id: string, load?: boolean) => Promise<void>;
	disableModule: (id: string, unload?: boolean) => Promise<void>;
	translate: Translate<ModuleManagementTranslations>;
} & ModuleManagementHooks;

export function mountModuleManagementList(el: Element, ctx: ModuleManagementContext) {
	let isUnmounted = false;
	const unmount = render(() => App({ ctx, isUnmounted: () => isUnmounted }), el);
	return () => {
		isUnmounted = true;
		unmount();
	};
}
