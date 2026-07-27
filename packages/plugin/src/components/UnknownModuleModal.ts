import { basename } from '@repo/shared/path';
import { App, Modal, Setting } from 'obsidian';
import type { Fragment, Translate } from '@/modules/I18n';
import type { AugmentedModuleMeta, MaybePromise } from '@/sdk';
import ModuleEditorModal from './ModuleEditorModal';

type FileInfo = { path: string; size: number; mtime: number; ctime: number; fileName: string };

export type UnknownModuleTranslations = {
	unknownModule: string;
	unknownModuleDescription: Fragment<FileInfo>;
	delete: string;
	configure: string;
};

export default class UnknownModuleModal extends Modal {
	private cachedInfo?: FileInfo;

	constructor(
		private readonly ctx: { app: App; translate: Translate<UnknownModuleTranslations> },
		private readonly options: {
			onSave: (meta: AugmentedModuleMeta) => MaybePromise<void>;
			path: string;
			id: string;
		},
	) {
		super(ctx.app);
	}

	onOpen() {
		const { translate, app } = this.ctx;
		const { id, path, onSave } = this.options;
		this.setTitle(translate('unknownModule'));
		this.contentEl.addClass('markdown-rendered');

		if (this.cachedInfo)
			this.contentEl.appendChild(translate('unknownModuleDescription', this.cachedInfo));
		else
			void app.vault.adapter.stat(path).then((stat) => {
				if (!stat) {
					this.close();
					return;
				}
				const { ctime, mtime, size } = stat;
				const fileInfo: FileInfo = { ctime, fileName: basename(path), mtime, path, size };
				this.cachedInfo = fileInfo;
				this.contentEl.appendChild(translate('unknownModuleDescription', fileInfo));
			});

		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText(translate('delete'))
					.setWarning()
					.setCta()
					.onClick(async () => {
						await app.vault.adapter.remove(path);
						this.close();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText(translate('configure'))
					.setIcon('wrench')
					.onClick(() => {
						new ModuleEditorModal(app, {
							getFile: () => app.vault.adapter.read(path),
							initial: {
								description: '',
								enabled: false,
								icon: 'puzzle',
								id,
								integrity: '<placeholder>',
								main: '',
								name: 'Unknown Module',
								source: '',
								version: '0.0.1',
							},
							onCancel: () => this.open(),
							onSave,
						}).open();
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
