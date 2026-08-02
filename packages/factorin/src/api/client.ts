import { requestUrl } from 'obsidian';
import type { FactorinServerConfig } from '../config';
import type { FactorinAccount, FactorinBootstrap, FactorinPermissions } from './types';
import { FACTORIN_CONFIG_FALLBACKS } from '../config';

/**
 * A thin client for the Factor.In REST API, built on Obsidian's `requestUrl`
 * (no external fetch dependency — Overview document §6.1). The pasted `fi_…`
 * token authenticates as a Bearer token here and doubles as the WebDAV password
 * on the Drive side (§6.0); this client is how the plugin discovers what that
 * token unlocks.
 *
 * Overridable at build time via the `FACTORIN_API_BASE` env var, injected by
 * tsdown's `define` (see `packages/plugin/tsdown.config.ts`) — a dev build sets
 * `FACTORIN_API_BASE=https://dev-api.factorin.com/api/v1 bun run build:plugin`;
 * unset falls back to production. The `?? …` also supplies the value on the
 * non-bundled path (e.g. `bun test`, where `define` never runs). The Drive host
 * is deliberately *not* configured here: it comes back per-account in the `/me`
 * bootstrap, so it follows whichever API this base resolves to.
 */
export const FACTORIN_API_BASE = Bun.env.FACTORIN_API_BASE ?? 'https://api.factorin.com/api/v1';

/**
 * What the server actually sends for an account: snake_case `drive_url`
 * (Rails/jbuilder), and the server-driven policy under `sync` (which
 * {@link normalizeBootstrap} normalises into the internal `config` field);
 * everything else as-is. Only `client.ts` ever sees this shape.
 */
type WireAccount = Omit<FactorinAccount, 'driveUrl'> & { drive_url: string };
type WireBootstrap = Omit<FactorinBootstrap, 'accounts' | 'config' | 'token'> & {
	accounts?: Array<WireAccount>;
	sync?: unknown;
	token?: { permissions?: FactorinPermissions };
};

/**
 * The server judged the token itself invalid (401/403) — as opposed to the API
 * being unreachable or broken. The distinction is what the startup re-auth
 * (Overview §6.3) branches on: this error means disconnect; anything else is
 * transient and keeps the last-known-good mount.
 */
export class FactorinAuthError extends Error {
	override readonly name = 'FactorinAuthError';
}

/**
 * Fetch the bootstrap: the user, the token's granted permissions, and the
 * accounts (with Drive URLs) the token can reach — `GET /me`.
 *
 * Throws with a user-facing message on failure ({@link FactorinAuthError} when
 * the token is the problem); the settings tab surfaces it verbatim in a Notice,
 * so keep the strings self-explanatory.
 */
export async function fetchBootstrap(token: string): Promise<FactorinBootstrap> {
	const response = await requestUrl({
		headers: { Authorization: `Bearer ${token}` },
		throw: false,
		url: `${FACTORIN_API_BASE}/me`,
	});
	if (response.status === 401 || response.status === 403)
		throw new FactorinAuthError(
			'Factor.In rejected the token. Check it was copied whole and not revoked.',
		);
	if (response.status !== 200) throw new Error(`Factor.In API error: ${response.status}`);
	return normalizeBootstrap(response.json as WireBootstrap);
}

/**
 * Wire → package shape: camelCase the Drive URL and default the blocks the
 * server may omit. `token.permissions` and `accounts` are additions the server
 * team is shipping alongside this flow (Overview §6.1), so tolerate their
 * absence rather than crashing on an older deploy — an empty `accounts` list is
 * reported as the actionable problem it is.
 */
function normalizeBootstrap(raw: WireBootstrap): FactorinBootstrap {
	const accounts = (raw.accounts ?? []).map((account) => ({
		driveUrl: account.drive_url,
		id: account.id,
		name: account.name,
		personal: account.personal,
		role: account.role,
		slug: account.slug,
	}));
	if (!accounts.length)
		throw new Error('This token cannot reach any Factor.In account with a Drive.');
	return {
		accounts,
		config: normalizeConfig(raw.sync),
		email: raw.email,
		id: raw.id,
		name: raw.name,
		token: { permissions: raw.token?.permissions ?? {} },
	};
}

/**
 * Pick the well-formed server-driven settings out of the `/me` `sync` block,
 * keyed exactly as {@link FACTORIN_CONFIG_FALLBACKS}. Anything missing or malformed
 * is dropped rather than trusted — the caller falls back to the pinned default, so
 * an older deploy (no `sync` block) or a stray field can never write junk into settings.
 */
function normalizeConfig(raw: unknown): FactorinServerConfig {
	if (!raw || typeof raw !== 'object') return {};
	const source = raw as Record<string, unknown>;
	const result: FactorinServerConfig = {};
	for (const key of Object.keys(FACTORIN_CONFIG_FALLBACKS) as Array<
		keyof typeof FACTORIN_CONFIG_FALLBACKS
	>) {
		const value = source[key];
		if (
			value &&
			typeof value === 'object' &&
			typeof (value as { enabled?: unknown }).enabled === 'boolean' &&
			typeof (value as { value?: unknown }).value === 'number'
		)
			result[key] = {
				enabled: (value as { enabled: boolean }).enabled,
				value: (value as { value: number }).value,
			};
	}
	return result;
}

/**
 * The account the connect flow selects when the user has not chosen one: the
 * personal account, falling back to the first the token can reach (Overview
 * §6.2). `fetchBootstrap` guarantees the list is non-empty.
 */
export function pickDefaultAccount(accounts: Array<FactorinAccount>): FactorinAccount {
	return accounts.find((account) => account.personal) ?? accounts[0];
}
