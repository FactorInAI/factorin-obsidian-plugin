import type { FactorinLanguageCode, FactorinTranslationResource } from '@/index';
import { beforeEach, describe, expect, test } from 'bun:test';
import Factorin from '@/index';
import { FACTORIN_ICON } from '@/icon';
import { en, zh } from '@/i18n';
import { registeredIcons } from './mocks';

type Registration = [FactorinLanguageCode, FactorinTranslationResource];

function createContext() {
	const registrations: Array<Registration> = [];
	return {
		registerI18n: (locale: FactorinLanguageCode, resource: FactorinTranslationResource) => {
			registrations.push([locale, resource]);
		},
		registrations,
	};
}

describe('Factor.In module', () => {
	beforeEach(() => registeredIcons.clear());

	test('registers its translation resources when constructed', () => {
		const ctx = createContext();
		new Factorin(ctx);
		expect(ctx.registrations).toEqual([
			['en', en],
			['zh', zh],
		]);
	});

	test('exposes a moduleSettings object for the kernel', () => {
		expect(new Factorin(createContext()).moduleSettings).toEqual({});
	});

	test('start() registers the Factor.In icon under a stable id', () => {
		new Factorin(createContext()).start();
		expect(registeredIcons.get(FACTORIN_ICON)).toContain('currentColor');
	});

	test('dispose() is safe before start() and idempotent after it', () => {
		const module = new Factorin(createContext());
		expect(() => module.dispose()).not.toThrow();
		module.start();
		expect(() => module.dispose()).not.toThrow();
		expect(() => module.dispose()).not.toThrow();
	});

	test('start() and dispose() can be cycled, as plugin reload does', () => {
		const module = new Factorin(createContext());
		module.start();
		module.dispose();
		registeredIcons.clear();
		module.start();
		expect(registeredIcons.has(FACTORIN_ICON)).toBe(true);
		module.dispose();
	});
});
