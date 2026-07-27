import { App, Modal } from 'obsidian';
import type { AugmentedModuleMeta } from '@/sdk';
import type { MaybePromise } from '@/types';

export default class ModuleEditorModal extends Modal {
	constructor(
		app: App,
		private readonly options: {
			initial: AugmentedModuleMeta;
			getFile?: () => MaybePromise<string>;
			onSave: (updated: AugmentedModuleMeta) => MaybePromise<void>;
			onCancel: () => MaybePromise<void>;
		},
	) {
		super(app);
	}

	// TODO
}
