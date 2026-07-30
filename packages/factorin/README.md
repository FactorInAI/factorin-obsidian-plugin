# `@factorin/module`

All Factor.In-specific code. Nothing Factor.In lives outside this package except
the two wiring lines in `packages/plugin/src/index.ts` described below.

See `documents/overview.md` §4 and §5.1 for the full rationale; `FACTOR.IN.md` at
the repository root for the fork conventions.

## What it is

A Sync Engine **module** — the same contract upstream's `packages/webdav`,
`packages/encryption` and `packages/smart-merge` implement:

```ts
export default class Factorin {
  readonly moduleSettings = { … };
  constructor(ctx) { /* ctx.registerI18n(…) */ }
  readonly start = () => { /* register capabilities, collect unregister fns */ };
  readonly dispose = () => { /* run them all */ };
}
```

…but compiled into the plugin as an **internal** kernel module rather than
downloaded at runtime. That is the whole point of the branded fork: no module
catalog, no CDN, no integrity handshake, no auto-update. A Factor.In build never
contacts `sync.consensia.cc`.

Today it is a shell: it registers its i18n resources and the Factor.In icon. The
`factorin` remote FS, the API-token settings section, and the workflow UI land in
later milestones.

## How it reaches the plugin

`exports` points at `./src/index.ts`, not `./dist`. `packages/plugin`'s bundler
inlines the TypeScript source directly, the same way it does `@repo/shared`. This
keeps the internal module a single build with no intermediate artifact.

`tsdown.config.ts` still produces a standalone `dist/factorin.js`, because the
package is *also* a valid downloadable module. Nothing consumes that output
today; it exists so Factor.In could be distributed as an external module with no
source change.

## Rules

**Dependency direction is one-way.** `packages/factorin` imports `obsidian` and
nothing else in the workspace. No upstream package may import from here — the sole
exception is the `internalModules` wiring in `packages/plugin/src/index.ts`.

**`src/` must not import `@hesprs/sync-engine-sdk`.** The SDK *is*
`packages/plugin`, published from `packages/plugin/dist`, and `packages/plugin`
compiles this package's sources inside its own program (see the `@factorin/module`
entry in `packages/plugin/tsconfig.json`). So an SDK import here means the
`postinstall` SDK build has to type a file that imports the SDK's own
not-yet-emitted `dist/index.d.ts`, and declaration emit fails with `tsgo did not
generate dts file for packages/factorin/src/index.ts`. Declare the leaf types
locally instead — `FactorinLanguageCode` and `FactorinTranslationResource` in
`src/index.ts` are narrowings of the SDK's `ObsidianLanguageCode` and
`TranslationResource`, and narrowing is the safe direction for a context slice.
The SDK devDependency stays for `tsdown.config.ts`, which only this package's own
tooling reads.

**Never name `Context` in this package's type surface.** Downloadable modules can
write `SelectFromContext<{…}>`, which expands to `Context extends O ? O : never`.
Factor.In is a member of the plugin's own `internalModules` array, so the plugin's
`Context` is *defined in terms of this class*; naming it here makes the two types
reference each other through their own definitions. Declare the context slice
structurally instead, from leaf types only — the same thing upstream's internal
modules (e.g. `Extensibility`) do. See the `FactorinContext` comment in `src/index.ts`.

**`@factorin/module` is not declared in `packages/plugin/package.json`.** It is
resolved through Bun's workspace linking. Declaring it would make the two packages
depend on each other (`@factorin/module` → `@hesprs/sync-engine-sdk` *is*
`packages/plugin`), and Turbo rejects a cyclic task graph — which would break the
`postinstall` SDK build and therefore every build. Keep the edge implicit.

## Layout

```
packages/factorin/
├── assets/            brand assets — see assets/README.md
├── src/
│   ├── index.ts       the module class (default export)
│   ├── i18n.ts        translation resources, registered via ctx.registerI18n
│   └── icon.ts        the Factor.In brandmark, inlined as an Obsidian icon
└── test/
```

## Commands

Run from the repository root (Bun `1.3.13`, pinned by `packageManager`):

| Command | What |
|---|---|
| `bun run build:plugin` | Build the plugin, Factor.In bundled in → `packages/plugin/dist-plugin/` |
| `bun --bun turbo run tests -F @factorin/module` | This package's tests |
| `bun --bun turbo run check -F @factorin/module` | `tsc` + `oxlint` + `oxfmt --check` |
| `bun --bun turbo run build -F @factorin/module` | The standalone module bundle (unused by the plugin) |

`bun install` must run first — its `postinstall` builds the SDK that
`tsdown.config.ts` (and the rest of the workspace) resolves against.
