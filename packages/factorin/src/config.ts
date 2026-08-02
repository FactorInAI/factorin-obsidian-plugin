/**
 * Factor.In's runtime config — the values that make the branded build behave the
 * way our architecture needs, gathered in one place so there is exactly one file
 * to read for "what config Factor.In runs on and what happens if the server says
 * nothing."
 *
 * Three kinds live here:
 *
 * 1. **Fallbacks for server-driven settings.** The connect flow overlays whatever
 *    the Factor.In API returns in the `/me` `config` block; anything the API omits
 *    (an older deploy, a field not shipped yet) falls back to these, so a setting is
 *    never left `undefined`. `applyServerConfig` in `./index` does the overlay, and
 *    the plugin's `onload` seeds the same values as the pre-connect state — see
 *    `packages/plugin/src/index.ts` (both import from here).
 *
 * 2. **Pinned architectural constants** that have no UI and are never server-driven.
 *    Most already live in the `onload` literal (`remoteFs`, `moduleSources`,
 *    `moduleAutoUpdate`, `asymmetricStorage`); the conflict strategy is pinned here
 *    because a shared library wants one deterministic rule.
 *
 * 3. **The upstream settings-tab section priorities the branded build suppresses.**
 *    The tab shows only the Factor.In section; every upstream section is blanked by
 *    registering a no-op `apply` at its priority (`SettingTab.display` keeps one
 *    `apply` per priority, last registered wins, and our module registers last).
 *
 * Values are conservative defaults for a shared, hierarchical Drive; tune them (and
 * grow the `config` block) as the API matures.
 */

/** An upstream `{ enabled, value }` toggle setting. */
type Toggle = { enabled: boolean; value: number };

/**
 * Fallbacks for the settings the Factor.In API owns (account tier / server
 * capacity / cadence policy). The `/me` `config` block overlays these on connect;
 * omitted fields keep the fallback. Keys match the upstream `Settings` shape.
 */
export const FACTORIN_CONFIG_FALLBACKS = {
	maxFileSize: { enabled: false, value: 31_457_280 },
	maxRequestConcurrency: { enabled: true, value: 50 },
	minRequestInterval: { enabled: false, value: 0 },
	realtimeSync: { enabled: false, value: 5000 },
	scheduledSync: { enabled: false, value: 15 * 60 * 1000 },
	startupSync: { enabled: false, value: 5000 },
} satisfies Record<string, Toggle>;

/** The server-driven config the `/me` bootstrap may carry — every field optional. */
export type FactorinServerConfig = Partial<Record<keyof typeof FACTORIN_CONFIG_FALLBACKS, Toggle>>;

/**
 * Conflict strategy pinned for the shared library: the most recently edited side
 * wins (`latestSurvive`). Not `renameAndKeepBoth` — a shared, multi-vault library
 * should converge, not accumulate `… (conflicted copy)` duplicates.
 */
export const FACTORIN_CONFLICT_RESOLVER = 'latestSurvive';

/**
 * Upstream settings-tab section priorities the branded build blanks (see kind 3 in
 * this file's doc). These are the priorities `Bootstrap` registers its sections at
 * (`headSettings` 0, `featuresSettings` 1000, `controlsSettings` 2000,
 * `filterSettings` 3000, `miscellaneousSettings` 4000, `developmentSettings` 5000).
 *
 * Re-check against `Bootstrap`'s `registerSetting` calls on every upstream merge —
 * a section added at a new priority would leak into the UI until listed here.
 */
export const SUPPRESSED_UPSTREAM_SETTING_PRIORITIES = [0, 1000, 2000, 3000, 4000, 5000];
