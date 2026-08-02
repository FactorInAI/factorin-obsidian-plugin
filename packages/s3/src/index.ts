import type {
	RemoteFsEntry,
	FsWrapperEntry,
	Translate,
	Translations,
	SelectFromContext,
	SettingEntry,
	ObsidianLanguageCode,
	TranslationResource,
	Settings,
	OptimizerEntry,
	RemoteRequestMiddlewareEntry,
} from '@hesprs/sync-engine-sdk';
import type { App } from 'obsidian';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import type { UrlStyle } from './s3/sigv4';
import type { S3Translations } from './setting';
import { en, zh } from './i18n';
import s3BatchDeleteOptimizer from './optimizer';
import prefixWrapper from './prefix';
import { checkConnection } from './s3/check-connection';
import S3Fs from './s3/fs';
import s3Setting from './setting';

export type S3Settings = {
	endpoint: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	urlStyle: UrlStyle;
	prefix: string;
	proxyUrl: string;
};

export default class S3 {
	private readonly cleanup: Array<() => void> = [];

	constructor(
		private readonly ctx: SelectFromContext<{
			translate: Translate<Translations & S3Translations>;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => () => void;
			app: App;
			registerRemoteFsWrapper: (entry: FsWrapperEntry) => () => void;
			registerSetting: (entry: SettingEntry) => () => void;
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
			registerRemoteOptimizer: (entry: OptimizerEntry) => () => void;
			registerRemoteRequestMiddleware: (entry: RemoteRequestMiddlewareEntry) => () => void;
			saveSettings: () => Promise<void>;
			settings: { remoteFs: string };
		}>,
	) {
		if (!this.moduleSettings.prefix) this.moduleSettings.prefix = `${ctx.app.vault.getName()}/`;
		ctx.registerI18n('en', en);
		ctx.registerI18n('zh', zh);
	}

	readonly moduleSettings: S3Settings = {
		accessKeyId: '',
		bucket: '',
		endpoint: '',
		prefix: '',
		proxyUrl: '',
		region: 'us-east-1',
		secretAccessKey: '',
		urlStyle: 'virtual-hosted',
	};

	declare settings: Settings;

	readonly start = () => {
		const {
			translate,
			registerRemoteFs,
			app: { secretStorage },
			registerRemoteFsWrapper,
			registerSetting,
			registerRemoteOptimizer,
			registerRemoteRequestMiddleware,
		} = this.ctx;

		const resolveConfig = () => {
			const { endpoint, region, accessKeyId, bucket, urlStyle, prefix } = this.moduleSettings;
			const secretAccessKey = secretStorage.getSecret(this.moduleSettings.secretAccessKey);
			if (secretAccessKey === null || !endpoint || !bucket)
				throw new Error('Please configure S3 account!');
			return { accessKeyId, bucket, endpoint, prefix, region, secretAccessKey, urlStyle };
		};

		this.cleanup.push(
			registerRemoteFs('s3', {
				checkConnection: (request) => {
					const config = resolveConfig();
					return checkConnection(config, request);
				},
				instantiate: (request) => new S3Fs({ ...resolveConfig(), request }),
				prettyName: () => translate('s3'),
			}),
			registerRemoteFsWrapper({
				apply: (fs) => {
					if (digOriginal(fs) instanceof S3Fs)
						return prefixWrapper(
							fs,
							this.moduleSettings.prefix || `${this.ctx.app.vault.getName()}/`,
						);
				},
				priority: 11_500,
			}),
			registerRemoteOptimizer({
				apply: s3BatchDeleteOptimizer,
				priority: 500,
			}),
		);

		// Proxy URL middleware — always registered; only active when S3 is selected and proxyUrl is set
		this.cleanup.push(
			registerRemoteRequestMiddleware({
				apply: (request) => {
					if (this.ctx.settings.remoteFs !== 's3') return undefined;
					const proxyUrl = this.moduleSettings.proxyUrl;
					if (!proxyUrl) return undefined;
					return (params) => {
						const originalUrl = typeof params === 'string' ? params : params.url;
						const original = new URL(originalUrl);
						const proxy = new URL(proxyUrl);
						const rewritten = `${proxy.protocol}//${proxy.host}${original.pathname}${original.search}`;
						if (typeof params === 'string') return request(rewritten);
						return request({ ...params, url: rewritten });
					};
				},
				priority: 500,
			}),
		);

		this.cleanup.push(
			registerSetting({
				apply: (el) => s3Setting(el, this.ctx, this.moduleSettings),
				priority: 749,
			}),
		);
	};

	readonly dispose = () => {
		this.cleanup.forEach((fn) => fn());
		this.cleanup.length = 0;
	};
}
