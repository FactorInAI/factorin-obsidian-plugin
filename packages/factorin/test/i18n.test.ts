import { describe, expect, test } from 'bun:test';
import type { FactorinTranslations } from '@/i18n';
import { en, zh } from '@/i18n';

const locales: Array<[string, FactorinTranslations]> = [
	['en', en],
	['zh', zh],
];

const sortedKeys = (resource: FactorinTranslations): Array<string> =>
	Object.keys(resource).sort((a, b) => a.localeCompare(b));

describe('Factor.In translation resources', () => {
	test('every locale carries the same key set', () => {
		expect(sortedKeys(zh)).toEqual(sortedKeys(en));
	});

	/*
	 * Keys land in one flat, kernel-wide i18n object shared with every other module.
	 * An unprefixed key would silently collide with upstream's.
	 * See the `src/i18n.ts` doc comment.
	 */
	test.each(locales)('%s prefixes every key with `factorin`', (_locale, resource) => {
		expect(sortedKeys(resource).filter((key) => !key.startsWith('factorin'))).toEqual([]);
	});

	test.each(locales)('%s has a non-empty string for every key', (_locale, resource) => {
		const blank = Object.entries(resource)
			.filter(([, value]) => value.trim().length === 0)
			.map(([key]) => key);
		expect(blank).toEqual([]);
	});

	// The brand name is deliberately identical across locales — it is not translated.
	test('the brand name is left untranslated', () => {
		expect(zh.factorin).toBe(en.factorin);
	});

	test('the description is localised rather than copied', () => {
		expect(zh.factorinDescription).not.toBe(en.factorinDescription);
	});
});
