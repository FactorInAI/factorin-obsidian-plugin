import { mock } from 'bun:test';

/**
 * SVG bodies passed to `addIcon`, keyed by icon id.
 *
 * Deliberately self-contained rather than reusing `@repo/shared/obsidian-mock`,
 * which `AGENTS.md` names as the home for Obsidian API mocks. Two reasons: that
 * mock has no `addIcon` and adding one there would mean editing an upstream file
 * for a fork-only test, and this is a recording spy rather than the plain stub
 * that file holds. `packages/factorin` also takes no workspace dependency beyond
 * the SDK — see this package's README.
 */
export const registeredIcons = new Map<string, string>();

void mock.module('obsidian', () => ({
	addIcon: (iconId: string, svgContent: string) => {
		registeredIcons.set(iconId, svgContent);
	},
}));
