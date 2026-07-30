import { addIcon } from 'obsidian';

/**
 * The Factor.In brandmark as an Obsidian icon.
 *
 * Obsidian ships a plugin as a single JS bundle, so icons cannot be referenced
 * by URL — the SVG must be inlined. This module holds the mark inline and
 * registers it under a stable id, so `addRibbonIcon(FACTORIN_ICON, …)` and any
 * other consumer can refer to it by name.
 *
 * `MARK_BODY` is the *inner* SVG content (no `<svg>` wrapper): `addIcon` injects
 * it into its own `<svg viewBox="0 0 100 100">`, so the content is authored on a
 * 0 0 100 100 viewport and uses `fill="currentColor"` to follow the active theme.
 *
 * Geometry mirrors `packages/factorin/assets/mark.svg` (the brand source, 800×800)
 * scaled by 0.125 into the 100×100 viewport. Regenerate from `mark.svg` if the
 * brand changes.
 */
export const FACTORIN_ICON = 'factorin';

const MARK_BODY = `<g fill="currentColor" transform="scale(0.125)">
  <path d="M498.1,301.9c13.26-.5,64.67-2.4,111.91-3.93,18-16.89,34.44-32.43,44.55-42.22,30.95-29.97,30.46-79.85,0-110.31s-80.34-30.95-110.31,0c-9.8,10.12-25.33,26.55-42.22,44.55-1.53,47.24-3.44,98.65-3.93,111.91Z"/>
  <path d="M189.99,297.97c47.24,1.53,98.65,3.44,111.91,3.93-.5-13.26-2.4-64.67-3.93-111.91-16.89-18-32.43-34.44-42.22-44.55-29.97-30.95-79.85-30.46-110.31,0-30.46,30.46-30.95,80.34,0,110.31,10.12,9.8,26.55,25.33,44.55,42.22Z"/>
  <path d="M610.01,502.03c-47.24-1.53-98.65-3.44-111.91-3.93.5,13.26,2.4,64.67,3.93,111.91,16.89,18,32.43,34.44,42.22,44.55,29.97,30.95,79.85,30.46,110.31,0,30.46-30.46,30.95-80.34,0-110.31-10.12-9.8-26.55-25.33-44.55-42.22Z"/>
  <path d="M301.9,498.1c-13.26.5-64.67,2.4-111.91,3.93-18,16.89-34.44,32.43-44.55,42.22-30.95,29.97-30.46,79.85,0,110.31,30.46,30.46,80.34,30.95,110.31,0,9.8-10.12,25.33-26.55,42.22-44.55,1.53-47.24,3.44-98.65,3.93-111.91Z"/>
  <path d="M118,478c-43.07.69-78-34.92-78-78s34.93-78.69,78-78c46.52.75,186,6,186,6,13.25,0,24-10.75,24-24,0,0-5.25-139.48-6-186-.69-43.07,34.92-78,78-78s78.69,34.93,78,78c-.75,46.52-6,186-6,186,0,13.25,10.75,24,24,24,0,0,139.48-5.25,186-6,43.07-.69,78,34.92,78,78s-34.93,78.69-78,78c-46.52-.75-186-6-186-6-13.25,0-24,10.75-24,24,0,0,5.25,139.48,6,186,.69,43.07-34.92,78-78,78s-78.69-34.93-78-78c.75-46.52,6-186,6-186,0-13.25-10.75-24-24-24,0,0-139.48,5.25-186,6Z"/>
</g>`;

/**
 * Register the Factor.In mark so it is available to `addRibbonIcon(FACTORIN_ICON, …)`
 * and anywhere else Obsidian resolves icons by id. Call once, from the module's `start()`.
 */
export function registerFactorinIcon(): void {
	addIcon(FACTORIN_ICON, MARK_BODY);
}
