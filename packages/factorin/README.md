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

Today it registers its i18n resources and the Factor.In icon, and carries the vendored
WebDAV FS core under `src/backend/webdav/` (see `VENDORED.md` there). Wiring that FS
into `registerRemoteFs('factorin', …)`, the API-token settings section, and the
workflow UI land in later milestones.

## How it reaches the plugin

`exports` points at `./src/index.ts`, not `./dist`. `packages/plugin` declares
`"@factorin/module": "workspace:*"` and its bundler inlines the TypeScript source
directly, exactly the way it does `@repo/shared`. This keeps the internal module a
single build with no intermediate artifact.

## Rules

**Dependency direction is one-way.** `packages/factorin` depends on `obsidian` and
`@repo/shared`, and nothing else. No upstream package may import from here; the sole
exception is the `internalModules` wiring in `packages/plugin/src/index.ts`.

`@repo/shared` is safe because it is a leaf: no `build` or `dev` task, no
dependencies of its own, exported as raw `./src/*.ts`. The edge
`@factorin/module → @repo/shared` therefore adds nothing to Turbo's task graph and
cannot cycle — unlike an SDK edge, which would (see the next rule). The vendored
WebDAV FS uses its path/binary helpers exactly as upstream does; re-implementing
`normalizeUrl` / `normalizeKey` / `concatBinary` here would fork the path grammar the
sync engine agrees on. See `src/backend/webdav/VENDORED.md`.

**`src/` must not import `@hesprs/sync-engine-sdk`.** The SDK _is_
`packages/plugin`, published from `packages/plugin/dist`, and `packages/plugin`
compiles this package's sources inside its own program. So an SDK import here means
the `postinstall` SDK build has to type a file that imports the SDK's own
not-yet-emitted `dist/index.d.ts`, and declaration emit fails with `tsgo did not
generate dts file for packages/factorin/src/index.ts`. Declare the leaf types
locally instead — `FactorinLanguageCode` and `FactorinTranslationResource` in
`src/index.ts` are narrowings of the SDK's `ObsidianLanguageCode` and
`TranslationResource`, and narrowing is the safe direction for a context slice.

**This package has no build.** It has no `dev`/`build` script and no
`tsdown.config.ts`, so Turbo gives it no `build` task and the plugin's `postinstall`
(`turbo run build -F @hesprs/sync-engine-sdk`) never waits on it. That is what makes
the workspace edge below legal: a standalone build would need `obsidianBridge` from
`@hesprs/sync-engine-sdk/dev`, and an SDK devDependency here plus the plugin's
dependency on this package is a cycle Turbo rejects. Internal modules ship inside
`main.js`; they do not need a bundle of their own.

**Never name `Context` in this package's type surface.** Downloadable modules can
write `SelectFromContext<{…}>`, which expands to `Context extends O ? O : never`.
Factor.In is a member of the plugin's own `internalModules` array, so the plugin's
`Context` is _defined in terms of this class_; naming it here makes the two types
reference each other through their own definitions. Declare the context slice
structurally instead, from leaf types only — the same thing upstream's internal
modules (e.g. `Extensibility`) do. See the `FactorinContext` comment in `src/index.ts`.

**Resolve `@factorin/module` through Bun's workspace linking, never through a
tsconfig `paths` alias.** A `paths` entry in `packages/plugin/tsconfig.json` rewrites
the bare specifier to a relative source path, so `rolldown-plugin-dts` treats this
package as _internal_ to the SDK's declaration bundle and demands a `.d.ts` for
`src/index.ts` that `tsgo` will not emit for a file outside the plugin's `rootDir`.
A real `workspace:*` dependency keeps the specifier bare, so the SDK's `dist/index.d.ts`
re-exports it as an external import — the same treatment `@repo/shared` gets.

## Layout

```
packages/factorin/
├── assets/            brand assets — see assets/README.md
├── src/
│   ├── index.ts       the module class (default export)
│   ├── i18n.ts        translation resources, registered via ctx.registerI18n
│   ├── icon.ts        the Factor.In brandmark, inlined as an Obsidian icon
│   └── backend/
│       └── webdav/    vendored WebDAV FS core — READ VENDORED.md BEFORE EDITING
└── test/
    ├── test-kit.ts        vendored copy of the SDK's test kit
    ├── fs-webdav.test.ts  ┐ vendored upstream WebDAV tests
    └── base-dir.test.ts   ┘
```

`src/backend/webdav/` is upstream's code, pinned. Everything in it except `types.ts`
is byte-identical to `packages/webdav/src/` apart from import specifiers, and that
property is load-bearing: it is what makes an upstream refresh a readable `git diff`.
Fix bugs upstream-side where you can, and read `VENDORED.md` before touching anything
there.

## Commands

Run from the repository root (Bun `1.3.13`, pinned by `packageManager`):

| Command                                         | What                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `bun run build:plugin`                          | Build the plugin, Factor.In bundled in → `packages/plugin/dist-plugin/` |
| `bun --bun turbo run tests -F @factorin/module` | This package's tests                                                    |
| `bun --bun turbo run check -F @factorin/module` | `tsc` + `oxlint` + `oxfmt --check`                                      |

There is no `build` for this package — see "This package has no build" above.
