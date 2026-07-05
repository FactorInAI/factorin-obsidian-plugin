import type {
	SelectFromContext,
	ObsidianLanguageCode,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';
import zh from './i18n';

// oxlint-disable-next-line typescript/no-extraneous-class
export default class Webdav {
	constructor(
		ctx: SelectFromContext<{
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
		}>,
	) {
		ctx.registerI18n('zh', zh);
	}
}
