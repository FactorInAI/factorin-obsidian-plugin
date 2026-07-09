import type {
	RemoteFsEntry,
	RemoteFsWrapperEntry,
	Translate,
	Translations,
	SelectFromContext,
	SettingEntry,
	Context,
	ObsidianLanguageCode,
	TranslationResource,
	Settings,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import type { WebdavTranslations } from './setting';
import baseDirWrapper from './base-dir';
import { en, zh } from './i18n';
import webdavSetting from './setting';
import WebdavFs from './webdav/fs';

export type WebdavSettings = {
	baseDirectory: string;
	depthInfinity: boolean;
	endpoint: string;
	password: string;
	username: string;
};

export default class Webdav {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			translate: Translate<Translations & WebdavTranslations>;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => () => void;
			app: App;
			registerRemoteFsWrapper: (entry: RemoteFsWrapperEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
		}>,
	) {
		if (!this.moduleSettings.baseDirectory)
			this.moduleSettings.baseDirectory = `${ctx.app.vault.getName()}/`;
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
	}

	readonly moduleSettings: WebdavSettings = {
		baseDirectory: '',
		depthInfinity: false,
		endpoint: '',
		password: '',
		username: '',
	};

	declare settings: Settings;

	readonly start = () => {
		const {
			translate,
			registerRemoteFs,
			app: { secretStorage },
			registerRemoteFsWrapper,
			registerSetting,
		} = this.ctx;
		this.cleanup.push(
			registerRemoteFs('webdav', {
				instantiate: () => {
					const {
						endpoint,
						username,
						password: pwd,
						depthInfinity,
					} = this.moduleSettings;
					const password = secretStorage.getSecret(pwd);
					if (password === null || !endpoint)
						throw new Error('Please configure WebDAV account!');
					return new WebdavFs({ depthInfinity, endpoint, password, username });
				},
				prettyName: translate('webdav'),
			}),
			registerRemoteFsWrapper({
				apply: (fs) => baseDirWrapper(fs, this.moduleSettings.baseDirectory),
				condition: () => this.settings.remoteFs === 'webdav',
				order: 6318,
			}),
			registerSetting({
				order: 749,
				render: (el) => webdavSetting(el, this.ctx as Context, this.moduleSettings),
			}),
		);
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}
