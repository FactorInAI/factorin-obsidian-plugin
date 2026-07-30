# Factor.In brand assets

**Owned by Factor.In — never sourced from or overwritten by upstream.** Upstream
(Sync Engine) keeps its own docs-site logos under `docs/public/`; these are ours.
Everything Factor.In lives under `packages/factorin/`, so this directory never
collides on an upstream merge.

## Source of truth

Mirrored from the Factor.In web app (`app/assets/images/{logo,mark}.svg`). When
the brand changes there, re-copy here and regenerate `mark-icon.svg`. Keep the
files byte-faithful to the brand originals except `mark-icon.svg` (a derived,
theme-adaptive variant — see below).

This directory holds the **design-source** SVGs. The brandmark is also inlined as
an Obsidian icon in code — see [Runtime usage](#runtime-usage-obsidian-ribbon--ui).

## Inventory

| File | What | Use |
|------|------|-----|
| `logo.svg` | Full lockup: mark + "FACTOR.IN" wordmark (800×100) | Docs, marketing, store listing |
| `mark.svg` | Brandmark only, brand colors (800×800) | Favicon, marketing, full-color contexts; **source of truth** for the runtime icon |

Optional theme variants (`logo-dark.svg` / `logo-light.svg`) can be added here if
a context needs them; none are required today.

## Runtime usage (Obsidian ribbon / UI)

An Obsidian plugin ships as a single JS bundle, so icons can't be referenced by
URL — the SVG must be **inlined**. Rather than load a file, the mark lives in code
at **`../src/icon.ts`**, which makes its usage self-evident:

```ts
import { registerFactorinIcon, FACTORIN_ICON } from './icon';

// once, in the module's start():
registerFactorinIcon();                                   // addIcon('factorin', <mark>)
addRibbonIcon(FACTORIN_ICON, 'Factor.In', () => { … });
```

`src/icon.ts` stores the mark as the *inner* SVG content on a `0 0 100 100`
viewport with `fill="currentColor"`, so it follows the active theme. Its geometry
mirrors `mark.svg` (scaled ×0.125) — regenerate it from `mark.svg` if the brand
changes. `logo.svg` / `mark.svg` carry the brand's own colors and are **not** for
the ribbon.

## Docs / store rebrand

If the docs site is rebranded, copy `logo.svg` over `docs/public/logo*.svg` — but
that is an upstream-owned path, so add those specific files to `.gitattributes`
as `merge=ours` so an upstream pull can't revert them.
