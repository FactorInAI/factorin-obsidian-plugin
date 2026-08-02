import { beforeEach, describe, expect, test } from 'bun:test';
import { FACTORIN_API_BASE, fetchBootstrap, pickDefaultAccount } from '@/api/client';
import { replyWith, requestUrlCalls } from './mocks';

/** The §6.1 `/me` payload, wire-shaped (snake_case `drive_url`). */
function payload(overrides: Record<string, unknown> = {}) {
	return {
		accounts: [
			{
				drive_url: 'https://drive.factorin.com/acme/',
				id: 456,
				name: 'Acme',
				personal: false,
				role: 'member',
				slug: 'acme',
			},
			{
				drive_url: 'https://drive.factorin.com/jon-doe/',
				id: 123,
				name: 'Jon Doe',
				personal: true,
				role: 'admin',
				slug: 'jon-doe',
			},
		],
		email: 'jon@junketholdings.com',
		id: 1,
		name: 'Jon Doe',
		token: { permissions: { drive: 'write', workflows: 'write' } },
		...overrides,
	};
}

describe('fetchBootstrap', () => {
	beforeEach(() => {
		requestUrlCalls.length = 0;
		replyWith({ json: payload(), status: 200 });
	});

	test('sends the token as a Bearer header to /me without throwing on status', async () => {
		await fetchBootstrap('fi_live_token');
		expect(requestUrlCalls).toEqual([
			{
				headers: { Authorization: 'Bearer fi_live_token' },
				throw: false,
				url: `${FACTORIN_API_BASE}/me`,
			},
		]);
	});

	test('normalizes the wire shape: drive_url becomes driveUrl, nothing else changes', async () => {
		const bootstrap = await fetchBootstrap('fi_x');
		expect(bootstrap).toEqual({
			accounts: [
				{
					driveUrl: 'https://drive.factorin.com/acme/',
					id: 456,
					name: 'Acme',
					personal: false,
					role: 'member',
					slug: 'acme',
				},
				{
					driveUrl: 'https://drive.factorin.com/jon-doe/',
					id: 123,
					name: 'Jon Doe',
					personal: true,
					role: 'admin',
					slug: 'jon-doe',
				},
			],
			config: {},
			email: 'jon@junketholdings.com',
			id: 1,
			name: 'Jon Doe',
			token: { permissions: { drive: 'write', workflows: 'write' } },
		});
	});

	/*
	 * `token.permissions` is an addition the server team ships alongside this flow
	 * (Overview §6.1) — an older deploy omitting it must read as "no grants", not
	 * crash.
	 */
	test('defaults a missing token block to no permissions', async () => {
		replyWith({ json: payload({ token: undefined }), status: 200 });
		const bootstrap = await fetchBootstrap('fi_x');
		expect(bootstrap.token.permissions).toEqual({});
	});

	test.each([401, 403])('%i reads as a rejected token, not a server fault', (status) => {
		replyWith({ status });
		return expect(fetchBootstrap('fi_revoked')).rejects.toThrow(
			'Factor.In rejected the token. Check it was copied whole and not revoked.',
		);
	});

	test('any other non-200 surfaces the status code', () => {
		replyWith({ status: 503 });
		return expect(fetchBootstrap('fi_x')).rejects.toThrow('Factor.In API error: 503');
	});

	test.each([[[]], [undefined]])(
		'an accounts list of %p is the actionable error, not a crash downstream',
		(accounts) => {
			replyWith({ json: payload({ accounts }), status: 200 });
			return expect(fetchBootstrap('fi_x')).rejects.toThrow(
				'This token cannot reach any Factor.In account with a Drive.',
			);
		},
	);
});

describe('pickDefaultAccount', () => {
	const acme = { driveUrl: 'https://d/acme/', id: 456, name: 'Acme', slug: 'acme' };
	const personal = {
		driveUrl: 'https://d/jon/',
		id: 123,
		name: 'Jon Doe',
		personal: true,
		slug: 'jon-doe',
	};

	test('prefers the personal account regardless of order', () => {
		expect(pickDefaultAccount([acme, personal])).toBe(personal);
	});

	test('falls back to the first account when none is personal', () => {
		expect(pickDefaultAccount([acme, { ...acme, id: 789, slug: 'other' }])).toBe(acme);
	});
});
