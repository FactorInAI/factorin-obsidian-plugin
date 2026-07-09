import { Notice, Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { RecordStore } from '@/modules/Storage';

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
		clearRecordStores: () => Promise<void>;
		getRecordStore: (namespace?: string) => RecordStore;
		exportLogs: () => Promise<void>;
	},
) {
	const { translate, exportLogs } = ctx;
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
			button.setButtonText(translate('export')).onClick(() => void exportLogs());
		});
}

async function clearVaultRecords({
	translate,
	getRecordStore,
}: {
	getRecordStore: (namespace?: string) => RecordStore;
	translate: Translate<DevelopmentSettingTranslations>;
}) {
	await getRecordStore().clear();
	new Notice(translate('vaultRecordsCleared'));
}

async function clearAllRecords({
	translate,
	clearRecordStores,
}: {
	translate: Translate<DevelopmentSettingTranslations>;
	clearRecordStores: () => Promise<void>;
}) {
	await clearRecordStores();
	new Notice(translate('allRecordsCleared'));
}
