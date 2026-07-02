import type { Settings } from '@';
import { Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import { ConflictStrategy, UnmergeableStrategy } from '@/types';

export type MiscellaneousSettingTranslations = {
	miscellaneous: string;
	conflictStrategy: string;
	conflictStrategyDescription: string;
	diffMatchPatch: string;
	latestTimestamp: string;
	keepLocal: string;
	keepRemote: string;
	skip: string;
	unmergeableStrategy: string;
	unmergeableStrategyDescription: string;
	useGitStyle: string;
	useGitStyleDescription: string;
	noticeStatusOnMobile: string;
	noticeStatusOnMobileDescription: string;
	confirmTasksInSync: string;
	confirmTasksInSyncDescription: string;
	confirmDeleteInAutoSync: string;
	confirmDeleteInAutoSyncDescription: string;
};

export default function miscellaneousSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<MiscellaneousSettingTranslations>;
		saveSettings: () => Promise<void>;
		rerenderSettingTab: () => void;
		settings: Settings;
	},
) {
	const { translate, saveSettings, rerenderSettingTab, settings } = ctx;

	new Setting(el).setName(translate('miscellaneous')).setHeading();

	new Setting(el)
		.setName(translate('conflictStrategy'))
		.setDesc(translate('conflictStrategyDescription'))
		.addDropdown((dropdown) =>
			dropdown
				.addOption(ConflictStrategy.DiffMatchPatch, translate('diffMatchPatch'))
				.addOption(ConflictStrategy.LatestTimeStamp, translate('latestTimestamp'))
				.addOption(ConflictStrategy.KeepLocal, translate('keepLocal'))
				.addOption(ConflictStrategy.KeepRemote, translate('keepRemote'))
				.addOption(ConflictStrategy.Skip, translate('skip'))
				.setValue(settings.conflictStrategy)
				.onChange((value) => {
					const nextValue = value as ConflictStrategy;
					const originalValue = settings.conflictStrategy;
					if (nextValue === originalValue) return;
					settings.conflictStrategy = nextValue;
					void saveSettings();
					if (
						(originalValue === ConflictStrategy.DiffMatchPatch) !==
						(nextValue === ConflictStrategy.DiffMatchPatch)
					)
						rerenderSettingTab();
				}),
		);

	if (settings.conflictStrategy === ConflictStrategy.DiffMatchPatch)
		new Setting(el)
			.setName(translate('unmergeableStrategy'))
			.setDesc(translate('unmergeableStrategyDescription'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption(UnmergeableStrategy.LatestTimeStamp, translate('latestTimestamp'))
					.addOption(UnmergeableStrategy.KeepLocal, translate('keepLocal'))
					.addOption(UnmergeableStrategy.KeepRemote, translate('keepRemote'))
					.addOption(UnmergeableStrategy.Skip, translate('skip'))
					.setValue(settings.unmergeableStrategy)
					.onChange((value) => {
						settings.unmergeableStrategy = value as UnmergeableStrategy;
						void saveSettings();
					}),
			);

	new Setting(el)
		.setName(translate('useGitStyle'))
		.setDesc(translate('useGitStyleDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.useGitStyle).onChange((value) => {
				settings.useGitStyle = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('noticeStatusOnMobile'))
		.setDesc(translate('noticeStatusOnMobileDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.noticeStatusOnMobile).onChange((value) => {
				settings.noticeStatusOnMobile = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('confirmTasksInSync'))
		.setDesc(translate('confirmTasksInSyncDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.confirmTasksInSync).onChange((value) => {
				settings.confirmTasksInSync = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('confirmDeleteInAutoSync'))
		.setDesc(translate('confirmDeleteInAutoSyncDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.confirmDeleteInAutoSync).onChange((value) => {
				settings.confirmDeleteInAutoSync = value;
				void saveSettings();
			}),
		);
}
