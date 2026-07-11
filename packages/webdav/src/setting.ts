import type { WebdavSettings } from '@';
import type { Translate, Translations } from '@hesprs/sync-engine-sdk';
import { normalizeBaseDir } from '@repo/shared/path';
import { App, SecretComponent, Setting } from 'obsidian';
import handleInput from './handle-input';

export type WebdavTranslations = {
	webdav: string;
	endpoint: string;
	endpointDescription: string;
	endpointPlaceholder: string;
	username: string;
	usernameDescription: string;
	usernamePlaceholder: string;
	password: string;
	passwordDescription: string;
	baseDirectory: string;
	baseDirectoryDescription: string;
	baseDirectoryPlaceholder: string;
	depthInfinity: string;
	depthInfinityDescription: string;
	chunkedUpload: string;
	chunkedUploadDescription: string;
};

export default function webdavSetting(
	el: HTMLElement,
	ctx: {
		translate: Translate<WebdavTranslations & Translations>;
		saveSettings: () => Promise<void>;
		app: App;
	},
	settings: WebdavSettings,
) {
	const { translate, saveSettings, app } = ctx;
	const invalidValue = translate('invalidValue');
	new Setting(el).setName(translate('webdav')).setHeading();

	new Setting(el)
		.setName(translate('endpoint'))
		.setDesc(translate('endpointDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('endpointPlaceholder')).setValue(settings.endpoint);
			handleInput({
				invalidValue,
				key: 'endpoint',
				processValue: (value) => {
					let parsedUrl: URL;
					try {
						parsedUrl = new URL(value);
					} catch {
						return false;
					}
					if (!['http:', 'https:'].includes(parsedUrl.protocol)) return false;
					return parsedUrl.toString().replace(/\/+$/, '');
				},
				saveSettings,
				settings,
				text,
			});
		});

	new Setting(el)
		.setName(translate('username'))
		.setDesc(translate('usernameDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('usernamePlaceholder')).setValue(settings.username);
			handleInput({
				invalidValue,
				key: 'username',
				processValue: (value) => value.trim(),
				saveSettings,
				settings,
				text,
			});
		});

	new Setting(el)
		.setName(translate('password'))
		.setDesc(translate('passwordDescription'))
		.addComponent((element) =>
			new SecretComponent(app, element).setValue(settings.password).onChange((password) => {
				settings.password = password;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('baseDirectory'))
		.setDesc(translate('baseDirectoryDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('baseDirectoryPlaceholder')).setValue(
				settings.baseDirectory,
			);
			handleInput({
				invalidValue,
				key: 'baseDirectory',
				processValue: (original) => normalizeBaseDir(original.trim()),
				saveSettings,
				settings,
				text,
			});
		});

	new Setting(el)
		.setName(translate('depthInfinity'))
		.setDesc(translate('depthInfinityDescription'))
		.addToggle((toggle) => {
			toggle.setValue(settings.depthInfinity).onChange((value) => {
				settings.depthInfinity = value;
				void saveSettings();
			});
		});

	new Setting(el)
		.setName(translate('chunkedUpload'))
		.setDesc(translate('chunkedUploadDescription'))
		.addToggle((toggle) => {
			toggle.setValue(settings.chunkedUpload).onChange((value) => {
				settings.chunkedUpload = value;
				void saveSettings();
			});
		});
}
