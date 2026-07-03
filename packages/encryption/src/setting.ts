import type { EncryptionSettings } from '@';
import type { Context, Fragment, Translate } from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import { MigrationModal } from '@hesprs/sync-engine-sdk';
import { SecretComponent, Setting } from 'obsidian';

export type EncryptionTranslations = {
	encryption: string;
	encryptionDescription: string;
	encryptionEnableMigration: Fragment;
	encryptionDisableMigration: Fragment;
};

export default function encryptionSetting(
	el: HTMLElement,
	ctx: {
		translate: Translate<EncryptionTranslations>;
		app: App;
		saveSettings: () => Promise<void>;
	},
	settings: EncryptionSettings,
) {
	const { translate, app, saveSettings } = ctx;
	let selfTrigger = false;

	new Setting(el)
		.setName(translate('encryption'))
		.setDesc(translate('encryptionDescription'))
		.addComponent((element) =>
			new SecretComponent(app, element).setValue(settings.password).onChange((value) => {
				settings.password = value;
				void saveSettings();
			}),
		)
		.addToggle((toggle) =>
			toggle.setValue(settings.enabled).onChange((value) => {
				if (selfTrigger) {
					selfTrigger = false;
					return;
				}
				const original = settings.enabled;
				new MigrationModal(ctx as Context, {
					apply: () => {
						settings.enabled = value;
						void saveSettings();
					},
					content: translate(
						value ? 'encryptionEnableMigration' : 'encryptionDisableMigration',
					),
					onCancel: () => {
						settings.enabled = original;
						void saveSettings();
						selfTrigger = true;
						toggle.setValue(original);
					},
				}).open();
			}),
		);
}
