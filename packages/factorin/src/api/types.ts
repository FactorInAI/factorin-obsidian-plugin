/**
 * Shapes of the Factor.In REST API (`https://api.factorin.com/api/v1`) as the
 * plugin consumes them — see the Overview document §6.1.
 *
 * These are the *normalized* forms: `driveUrl` is camelCase even though the wire
 * carries `drive_url`, because everything past `api/client.ts` should read like
 * the rest of this package. The raw wire shapes live next to the normalization
 * in `client.ts` and nowhere else.
 */

/**
 * Access level a token scope carries. A scope the token lacks is omitted from
 * the payload entirely (equivalently "none") — never assume a scope is present.
 */
export type FactorinAccess = 'read' | 'write';

/**
 * The grants carried by the pasted token, from `GET /me` → `token.permissions`.
 *
 * - `drive: 'write'` → bidirectional vault sync; `'read'` → pull-only.
 * - `workflows` gates the workflow UI (Overview document §8) — cached in memory
 *   by the module, never persisted.
 */
export type FactorinPermissions = {
	content?: FactorinAccess;
	drive?: FactorinAccess;
	workflows?: FactorinAccess;
};

/** An account the token can reach. `driveUrl` is the account's WebDAV mount root. */
export type FactorinAccount = {
	/** The account-scoped Drive endpoint, e.g. `https://drive.factorin.com/acme/`. */
	driveUrl: string;
	id: number;
	name: string;
	/** The user's personal account — the connect flow's default selection. */
	personal?: boolean;
	role?: string;
	/** Doubles as the WebDAV Basic-auth username (decorative; Overview §6.0). */
	slug: string;
};

/**
 * The bootstrap: everything `GET /me` tells us about a token — who it belongs
 * to, what it may do, and which accounts it unlocks. Fetched once per connect
 * (and, later, on startup re-auth per Overview §6.3); never persisted whole.
 */
export type FactorinBootstrap = {
	accounts: Array<FactorinAccount>;
	email?: string;
	id: number;
	name: string;
	token: { permissions: FactorinPermissions };
};
