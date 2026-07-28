import { normalizeUrl } from '@repo/shared/path';
import { App, Modal, Notice, Setting } from 'obsidian';
import type { AugmentedModuleMeta } from '@/modules/Extensibility';
import type { Fragment, Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/types';
import sha256 from '@/utils/sha-256';

export type ModuleEditorTranslations = {
	editModuleInformation: string;
	enable: string;
	name: string;
	namePlaceholder: string;
	description: string;
	descriptionPlaceholder: string;
	icon: string;
	iconDescription: Fragment;
	iconPlaceholder: string;
	updateSource: string;
	updateSourceDescription: string;
	updateSourcePlaceholder: string;
	invalidValue: string;
	integrityVerification: string;
	integrityVerificationDescription: Fragment;
	save: string;
	cancel: string;
};

export default class ModuleEditorModal extends Modal {
	constructor(
		private readonly ctx: { app: App; translate: Translate<ModuleEditorTranslations> },
		private readonly options: {
			initial: AugmentedModuleMeta;
			getFile?: () => MaybePromise<string>;
			onSave: (updated: AugmentedModuleMeta) => MaybePromise<void>;
			onCancel?: () => MaybePromise<void>;
		},
	) {
		super(ctx.app);
	}

	onOpen() {
		const { translate } = this.ctx;
		const { initial, onCancel = () => {}, onSave, getFile } = this.options;
		const { enabled, name, icon, description, source, integrity } = initial;
		const updated = { ...this.options.initial };
		let integrityEnabled = integrity !== '';
		this.setTitle(translate('editModuleInformation'));

		new Setting(this.contentEl)
			.setName(translate('enable'))
			.addToggle((toggle) =>
				toggle.setValue(enabled).onChange((value) => (updated.enabled = value)),
			);

		new Setting(this.contentEl).setName(translate('name')).addText((text) =>
			text
				.setValue(name)
				.setPlaceholder(translate('namePlaceholder'))
				.inputEl.addEventListener('blur', () => {
					const trimmed = text.getValue().trim();
					text.setValue(trimmed);
					updated.name = trimmed;
				}),
		);

		new Setting(this.contentEl).setName(translate('description')).addTextArea((text) =>
			text
				.setValue(description)
				.setPlaceholder(translate('descriptionPlaceholder'))
				.inputEl.addEventListener('blur', () => {
					const trimmed = text.getValue().trim();
					text.setValue(trimmed);
					updated.description = trimmed;
				}),
		);

		new Setting(this.contentEl)
			.setName(translate('icon'))
			.setDesc(translate('iconDescription'))
			.addText((text) =>
				text
					.setValue(icon)
					.setPlaceholder(translate('iconPlaceholder'))
					.inputEl.addEventListener('blur', () => {
						const trimmed = text.getValue().trim();
						text.setValue(trimmed);
						updated.icon = trimmed;
					}),
			);

		new Setting(this.contentEl)
			.setName(translate('updateSource'))
			.setDesc(translate('updateSourceDescription'))
			.addText((text) =>
				text
					.setPlaceholder(translate('updateSourcePlaceholder'))
					.setValue(source)
					.inputEl.addEventListener('blur', () => {
						let current = text.getValue().trim();
						if (current !== '')
							try {
								current = normalizeUrl(current);
							} catch {
								new Notice(translate('invalidValue'));
								current = updated.source;
							}
						text.setValue(current);
						updated.source = current;
					}),
			);

		new Setting(this.contentEl)
			.setName(translate('integrityVerification'))
			.addToggle((toggle) =>
				toggle.setValue(integrityEnabled).onChange((value) => (integrityEnabled = value)),
			)
			.setDesc(translate('integrityVerificationDescription'));

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(translate('cancel')).onClick(async () => {
					await onCancel();
					this.close();
				}),
			)
			.addButton((button) =>
				button
					.setCta()
					.setButtonText(translate('save'))
					.onClick(async () => {
						const newHash = integrityEnabled
							? getFile
								? await sha256(await getFile())
								: integrity
							: '';
						await onSave(Object.assign(updated, { integrity: newHash }));
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
