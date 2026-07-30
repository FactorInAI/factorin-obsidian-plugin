/**
 * Factor.In translation resources.
 *
 * These are registered at runtime from the module's constructor via
 * `ctx.registerI18n(...)` — upstream's own locale files (`packages/plugin/src/en.ts`
 * and friends) are never modified, so the rebrand adds no merge surface there.
 *
 * Keys land in one flat, kernel-wide i18n object shared with every other module,
 * so keep them prefixed with `factorin`.
 */
export type FactorinTranslations = {
	factorin: string;
	factorinDescription: string;
};

export const en: FactorinTranslations = {
	factorin: 'Factor.In',
	factorinDescription: 'Sync this vault with your Factor.In workspace.',
};

export const zh: FactorinTranslations = {
	factorin: 'Factor.In',
	factorinDescription: '将此 vault 与您的 Factor.In 工作区同步。',
};
