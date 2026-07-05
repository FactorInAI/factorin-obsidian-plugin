import type {
	SelectFromContext,
	ObsidianLanguageCode,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import zh from './i18n';

export default class Webdav {
	readonly dispose: () => void;

	constructor(
		ctx: SelectFromContext<{
			registerI18n: (
				lang: ObsidianLanguageCode,
				translations: TranslationResource,
			) => () => void;
		}>,
	) {
		this.dispose = ctx.registerI18n('zh', zh);
	}
}
