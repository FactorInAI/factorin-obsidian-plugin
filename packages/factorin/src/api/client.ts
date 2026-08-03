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
 * Fetch the bootstrap: the user, the token's granted permissions, and the
 * accounts (with Drive URLs) the token can reach — `GET /me`.
 *
 * Throws with a user-facing message on failure; the settings tab surfaces it
 * verbatim in a Notice, so keep the strings self-explanatory.
 */
export async function fetchBootstrap(token: string): Promise<FactorinBootstrap> {
	const response = await requestUrl({
		headers: { Authorization: `Bearer ${token}` },
		throw: false,
		url: `${FACTORIN_API_BASE}/me`,
	});
	if (response.status === 401 || response.status === 403)
		throw new Error('Factor.In rejected the token. Check it was copied whole and not revoked.');
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
 * The `/me` `sync` block's wire field → the internal setting it drives. The API speaks
 * a clean, semantic shape — one nullable number per setting, units in the name — so it
 * never leaks the plugin's `{ enabled, value }` representation; see
 * `docs/ME-API-CONTRACT.md` in the Rails repo.
 */
const SYNC_FIELDS = {
	max_concurrent_requests: 'maxRequestConcurrency',
	max_file_size_bytes: 'maxFileSize',
	min_request_interval_ms: 'minRequestInterval',
	realtime_sync_interval_ms: 'realtimeSync',
	scheduled_sync_interval_ms: 'scheduledSync',
	startup_sync_delay_ms: 'startupSync',
} satisfies Record<string, keyof typeof FACTORIN_CONFIG_FALLBACKS>;

/**
 * Map the `/me` `sync` block onto the plugin's internal toggles. Per the contract:
 *
 * - a field the server **omits** is dropped → the caller falls back to the pinned
 *   default (which for realtime/startup is *on*), so `{}` or an older deploy is a no-op;
 * - `null` is an explicit **off** → `{ enabled: false }`;
 * - a non-negative **number** turns the setting on with that value (`min_request_interval_ms:
 *   0` is "no throttle", i.e. off);
 * - anything else (wrong type, negative) is dropped → fallback, so junk can never land in settings.
 */
function normalizeConfig(raw: unknown): FactorinServerConfig {
	if (!raw || typeof raw !== 'object') return {};
	const source = raw as Record<string, unknown>;
	const result: FactorinServerConfig = {};
	for (const [field, key] of Object.entries(SYNC_FIELDS) as Array<
		[keyof typeof SYNC_FIELDS, keyof typeof FACTORIN_CONFIG_FALLBACKS]
	>) {
		if (!(field in source)) continue;
		const value = source[field];
		if (value === null)
			result[key] = { enabled: false, value: FACTORIN_CONFIG_FALLBACKS[key].value };
		else if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
			result[key] = { enabled: key === 'minRequestInterval' ? value > 0 : true, value };
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
