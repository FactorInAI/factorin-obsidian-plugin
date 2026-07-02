import { hash } from '@repo/shared';
import { App, Notice, Setting } from 'obsidian';
import type { LocalFs, RemoteFs } from '@/fs';
import type { Translate } from '@/modules/I18n';
import { exportLogs } from '@/modules/Observability';
import { clearAllStorage, clearStorageNamespace } from '@/storage';

export type DevelopmentSettingTranslations = {
	development: string;
	vaultRecordsCleared: string;
	clearVaultRecords: string;
	clearAllRecords: string;
	allRecordsCleared: string;
	clearRecords: string;
	clearRecordsDescription: string;
	export: string;
	exportLogsDescription: string;
	exportLogsToFile: string;
};

export default function developmentSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<DevelopmentSettingTranslations>;
		createLocalFs: () => LocalFs;
		createRemoteFs: () => RemoteFs;
		getLogs: () => string;
		app: App;
	},
) {
	const { translate, getLogs, app } = ctx;
	new Setting(el).setName(translate('development')).setHeading();

	new Setting(el)
		.setName(translate('clearRecords'))
		.setDesc(translate('clearRecordsDescription'))
		.addButton((button) =>
			button
				.setButtonText(translate('clearVaultRecords'))
				.onClick(() => void clearVaultRecords(ctx)),
		)
		.addButton((button) =>
			button
				.setButtonText(translate('clearAllRecords'))
				.onClick(() => void clearAllRecords(ctx)),
		);

	new Setting(el)
		.setName(translate('exportLogsToFile'))
		.setDesc(translate('exportLogsDescription'))
		.addButton((button) => {
			button.setButtonText(translate('export')).onClick(() => {
				void exportLogs(getLogs(), app);
			});
		});
}

async function clearVaultRecords({
	createLocalFs,
	createRemoteFs,
	translate,
}: {
	createLocalFs: () => LocalFs;
	createRemoteFs: () => RemoteFs;
	translate: Translate<DevelopmentSettingTranslations>;
}) {
	const namespace = hash(`${createLocalFs().getUid()}~~${createRemoteFs().getUid()}`);
	await clearStorageNamespace(namespace);
	new Notice(translate('vaultRecordsCleared'));
}

async function clearAllRecords({
	translate,
}: {
	translate: Translate<DevelopmentSettingTranslations>;
}) {
	await clearAllStorage();
	new Notice(translate('allRecordsCleared'));
}
