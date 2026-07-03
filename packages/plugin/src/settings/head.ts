import type { Settings } from '@';
import type { DatabaseSync } from 'uni-kv';
import { ExtraButtonComponent, Notice, Setting } from 'obsidian';
import type { RemoteFs } from '@/fs';
import type { Translate } from '@/modules/I18n';
import type { DeciderEntry, RemoteFsEntry } from '@/modules/Registrar';
import type { General } from '@/types';
import toErrorMessage from '@/utils/to-error-message';

const CHECK_CONNECTION_INTERVAL = 10_000;

export type HeadSettingTranslations = {
	moduleAutoUpdate: string;
	moduleAutoUpdateDescription: string;
	moduleManagement: string;
	moduleManagementDescription: string;
	openPanel: string;
	backend: string;
	backendDescription: string;
	syncStrategy: string;
	syncStrategyDescription: string;
	checkConnectionFailed: string;
	checkConnectionSuccess: string;
	checkConnection: string;
};

export default function headSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<HeadSettingTranslations>;
		saveSettings: () => Promise<void>;
		settings: Settings;
		openModuleManagement: () => void;
		remoteFsRegistry: Map<string, RemoteFsEntry>;
		deciderRegistry: Map<string, DeciderEntry>;
		createRemoteFs: () => RemoteFs;
		memoryDB: DatabaseSync<General, { lastCheckedFs: string }>;
	},
) {
	const {
		translate,
		saveSettings,
		settings,
		openModuleManagement,
		remoteFsRegistry,
		deciderRegistry,
		createRemoteFs,
		memoryDB,
	} = ctx;

	let statusButton: ExtraButtonComponent | undefined;

	const possibleClasses = [
		'color-green-400',
		'color-rose-500',
		'color-neutral-600',
		'sync-engine-spinning',
	];
	const setChecking = () => {
		statusButton?.setIcon('refresh-ccw');
		statusButton?.extraSettingsEl.removeClasses(possibleClasses);
		statusButton?.extraSettingsEl.addClasses(['sync-engine-spinning', 'color-neutral-600']);
	};
	const setSuccess = () => {
		statusButton?.setIcon('check');
		statusButton?.extraSettingsEl.removeClasses(possibleClasses);
		statusButton?.extraSettingsEl.addClasses(['color-green-400']);
	};
	const setError = () => {
		statusButton?.setIcon('cloud-off');
		statusButton?.extraSettingsEl.removeClasses(possibleClasses);
		statusButton?.extraSettingsEl.addClasses(['color-rose-500']);
	};
	const scheduleCheckConnection = () =>
		window.setInterval(checkConnection, CHECK_CONNECTION_INTERVAL);

	const checkConnection = async (force = false, noGC = false) => {
		// Self garbage collection
		if (!noGC && statusButton?.extraSettingsEl.isConnected) {
			statusButton = undefined;
			return;
		}
		if (memoryDB.getMeta('lastCheckedFs') === settings.remoteFs && !force) {
			setSuccess();
			return;
		}
		if (!settings.remoteFs) {
			setError();
			return;
		}
		try {
			setChecking();
			const result = await createRemoteFs().checkConnection();
			if (result.success) {
				memoryDB.setMeta('lastCheckedFs', settings.remoteFs);
				setSuccess();
				if (force) new Notice(translate('checkConnectionSuccess'));
			} else {
				setError();
				scheduleCheckConnection();
				if (force) new Notice(`${translate('checkConnectionFailed')}: ${result.reason}`);
			}
		} catch (error) {
			setError();
			scheduleCheckConnection();
			if (force)
				new Notice(`${translate('checkConnectionFailed')}: ${toErrorMessage(error)}`);
		}
	};

	new Setting(el)
		.setName(translate('backend'))
		.setDesc(translate('backendDescription'))
		.addExtraButton((button) => {
			statusButton = button
				.setTooltip(translate('checkConnection'))
				.onClick(() => void checkConnection(true));
			void checkConnection(undefined, true);
		})
		.addDropdown((dropdown) => {
			for (const [key, { prettyName }] of remoteFsRegistry)
				dropdown.addOption(key, prettyName);
			dropdown.setValue(settings.remoteFs).onChange((value) => {
				settings.remoteFs = value;
				void checkConnection();
				void saveSettings();
			});
		});

	new Setting(el)
		.setName(translate('moduleManagement'))
		.setDesc(translate('moduleManagementDescription'))
		.addButton((button) =>
			button.setButtonText(translate('openPanel')).onClick(openModuleManagement).setCta(),
		);

	new Setting(el)
		.setName(translate('moduleAutoUpdate'))
		.setDesc(translate('moduleAutoUpdateDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.moduleAutoUpdate).onChange((value) => {
				settings.moduleAutoUpdate = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('syncStrategy'))
		.setDesc(translate('syncStrategyDescription'))
		.addDropdown((dropdown) => {
			for (const [key, { prettyName }] of deciderRegistry)
				dropdown.addOption(key, prettyName);
			dropdown.setValue(settings.decider).onChange((value) => {
				settings.decider = value;
				void saveSettings();
			});
		});
}
