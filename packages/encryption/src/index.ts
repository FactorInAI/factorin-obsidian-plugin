import type {
	Context,
	ObsidianLanguageCode,
	RemoteFsWrapperEntry,
	SelectFromContext,
	SettingEntry,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import type { EncryptionDB } from '@/wrapper';
import encryptionWrapper from '@/wrapper';
import { en, zh } from './i18n';
import encryptionSetting from './setting';

export type EncryptionSettings = {
	enabled: boolean;
	password: string;
};

export default class Encryption {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			registerRemoteFsWrapper: (entry: RemoteFsWrapperEntry) => () => boolean;
			app: App;
			memoryDB: EncryptionDB;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (
				locale: ObsidianLanguageCode,
				resource: TranslationResource,
			) => () => void;
		}>,
	) {
		this.cleanup.push(ctx.registerI18n('en', en), ctx.registerI18n('zh', zh));
	}

	moduleSettings: EncryptionSettings = {
		enabled: false,
		password: '',
	};

	readonly start = () => {
		const { app, memoryDB, registerRemoteFsWrapper, registerSetting } = this.ctx;
		this.cleanup.push(
			registerRemoteFsWrapper({
				apply: (fs) => {
					const { enabled, password: pwd } = this.moduleSettings;
					if (!enabled) return fs;
					const password = app.secretStorage.getSecret(pwd);
					if (!password) throw new Error('Please configure encryption password!');
					return encryptionWrapper(fs, { memoryDB, password });
				},
				order: 7919,
			}),
			registerSetting({
				order: 1355,
				render: (el) => encryptionSetting(el, this.ctx as Context, this.moduleSettings),
			}),
		);
	};

	readonly dispose = () => this.cleanup.splice(0).forEach((fn) => fn());
}
