import type { FactorinAccount, FactorinBootstrap, FactorinPermissions } from './types';
import { requestUrl } from 'obsidian';

/**
 * A thin client for the Factor.In REST API, built on Obsidian's `requestUrl`
 * (no external fetch dependency — Overview document §6.1). The pasted `fi_…`
 * token authenticates as a Bearer token here and doubles as the WebDAV password
 * on the Drive side (§6.0); this client is how the plugin discovers what that
 * token unlocks.
 */
export const FACTORIN_API_BASE = 'https://api.factorin.com/api/v1';

/**
 * What the server actually sends for an account: snake_case `drive_url`
 * (Rails/jbuilder), everything else as-is. Only `client.ts` ever sees this
 * shape; {@link normalizeBootstrap} turns it into {@link FactorinAccount}.
 */
type WireAccount = Omit<FactorinAccount, 'driveUrl'> & { drive_url: string };
type WireBootstrap = Omit<FactorinBootstrap, 'accounts' | 'token'> & {
	accounts?: Array<WireAccount>;
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
	const accounts = (raw.accounts ?? []).map(({ drive_url, ...account }) => ({
		...account,
		driveUrl: drive_url,
	}));
	if (!accounts.length)
		throw new Error('This token cannot reach any Factor.In account with a Drive.');
	return {
		accounts,
		email: raw.email,
		id: raw.id,
		name: raw.name,
		token: { permissions: raw.token?.permissions ?? {} },
	};
}

/**
 * The account the connect flow selects when the user has not chosen one: the
 * personal account, falling back to the first the token can reach (Overview
 * §6.2). `fetchBootstrap` guarantees the list is non-empty.
 */
export function pickDefaultAccount(accounts: Array<FactorinAccount>): FactorinAccount {
	return accounts.find((account) => account.personal) ?? accounts[0];
}
