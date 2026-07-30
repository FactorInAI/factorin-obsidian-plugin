# Factor.In fork — conventions, branding & merge strategy

This repository is a **branded fork of the upstream Sync Engine monorepo**. It ships as its own
Obsidian plugin, **Factor.In Obsidian** (`factorin-obsidian-plugin`), built from upstream's v3
codebase with all Factor.In code kept in one workspace package so upstream stays mergeable.

Read this before merging anything from upstream, before touching a branding file, and before
cutting a release. The full architecture rationale lives in the Factor.In `Overview` design
document; this file is the operational half — what is ours, what is theirs, and how to take an
upstream update.

## One-time setup per clone

The owned-files strategy below relies on git's `ours` merge driver, which git does **not** define by
default. Every clone must register it once, or merges will fail on the files listed in `.gitattributes`:

```sh
git config merge.ours.driver true
```

This is a local config value — it cannot be committed, so each developer and each CI checkout has to run
it. (`merge=ours` as a *driver* is unrelated to `git merge -s ours`; the driver resolves per-file conflicts
by keeping our version.)

## Plugin identity

Everything a user sees is Factor.In's. The Obsidian manifest is the source of that identity:

| Field | Value |
|---|---|
| `id` | `factorin-obsidian-plugin` (also the folder under `<vault>/.obsidian/plugins/`) |
| `name` | Factor.In Obsidian |
| `author` | Factor.In |
| `authorUrl` | `https://factorin.com` |
| `minAppVersion` | `1.12.3` (upstream's floor; raise only with a reason) |

Never reintroduce the strings "Sync Engine", `sync-engine`, or Hēsperus into a **user-facing** surface —
the manifest, the README, or plugin UI. They stay where they describe upstream's own code: the SDK
package name (`@hesprs/sync-engine-sdk`), upstream's specs in `blueprint/`, `CONTRIBUTING.md`,
`SECURITY.md`, `AGENTS.md`, `modules.json`, and the MIT attribution in `LICENSE` / the README license
line. Those contributor-facing upstream files are deliberately left unmodified so they keep merging
cleanly; rebranding them is a separate decision, not part of the plugin's identity.

Upstream's own English UI strings (`packages/plugin/src/en.ts`) are also left alone. Factor.In UI text
arrives through the module's `ctx.registerI18n(...)`, never by patching upstream translations.

**One manifest.** Upstream keeps a single `manifest.json` at the repository root; the plugin build
(`packages/plugin/tsdown.config.ts`) copies it into `dist-plugin/` and inlines its `version`. Do **not**
add a second copy at `packages/plugin/manifest.json` — it would silently drift. `.gitattributes` lists
that path anyway so the ownership rule already applies if upstream ever moves the manifest there.

### Versioning

Factor.In Obsidian versions itself — the manifest version is **ours**, not upstream's, and it started
at `0.1.0` on the `3.0.0-beta-15` base. Plain semver: breaking user-visible change → major, feature →
minor, fix → patch. Pre-`1.0.0` while the Factor.In package is being built out.

The upstream base is recorded in the root `package.json` under `factorin.upstream`
(`repository` / `branch` / `baseVersion`) — update it whenever you merge upstream.

To bump: edit `version` (and `minAppVersion` if it moved) in `manifest.json`, then

```sh
bun ver
```

which writes the version→`minAppVersion` entry into `versions.json` and syncs the root
`package.json` version. It deliberately does **not** touch `packages/plugin/package.json` — that
package is upstream's SDK and keeps upstream's version line. Tagging the commit runs
`.github/workflows/release-plugin.yml`, which builds and attaches `main.js`, `manifest.json` and
`styles.css` to a GitHub release (a tag containing `-` is published as a pre-release).

### Brand assets

The Factor.In logo and brandmark live in `packages/factorin/assets/` — see the README there.
The runtime (ribbon/UI) icon is inlined in `packages/factorin/src/icon.ts`, because an Obsidian
plugin ships as a single JS bundle and cannot reference an SVG by URL.

## Owned files (never taken from upstream)

`.gitattributes` marks these `merge=ours`, so an upstream merge always keeps the Factor.In version:

| File | Why it's ours |
|---|---|
| `manifest.json` | Obsidian manifest — Factor.In id/name/author/description/version |
| `versions.json` | version→`minAppVersion` map for *our* versioning scheme |
| `package.json` | fork name, metadata, upstream-base record, workspace list |
| `packages/plugin/manifest.json` | listed pre-emptively; see "One manifest" above |
| `README.md` | Factor.In product docs, no upstream references |
| `README.zh.md` | deleted in this fork; see below |
| `FACTOR.IN.md` | this file |
| `.gitattributes` | the list itself |
| `packages/factorin/**` | all Factor.In code and brand assets |

Everything else is upstream's and merges normally.

## Files deleted in this fork

The `ours` driver only settles *content* conflicts. A file we deleted that upstream later modifies
comes back as a "deleted by us" conflict — resolve it by deleting again (`git rm <path>`), not by
taking upstream's version:

| Path | Why |
|---|---|
| `docs/` | upstream's VitePress site. We do not publish a docs site; product docs live in `README.md`, contributor docs here. Removing it also drops the `docs` workspace, the `dev:docs`/`build:docs` scripts, and the docs half of `bun check`. |
| `README.zh.md` | upstream-branded Chinese README. Factor.In has no translated product docs yet; a stale Sync Engine page at the repo root is worse than none. |
| `.github/workflows/deploy.yml` | deployed the docs site and the module catalog to upstream's GitHub Pages. Both are upstream infra we deliberately do not use. |

`scripts/deploy-modules.ts` and `modules.json` survive as upstream files but are inert here: nothing
runs them, and the branded build ships with `moduleSources: []` (no third-party module catalog).

> `bun.lock` was hand-edited when the `docs` workspace was dropped (root package renamed, `docs`
> workspace and its entry removed). Transitive VitePress/Vue entries are still listed; the next
> `bun install` on a machine with Bun prunes them. Run it and commit the result — CI installs with a
> frozen lockfile.

## Upstream remote

```sh
git remote add upstream https://github.com/hesprs/obsidian-webdav-sync
git fetch upstream feat/fs
```

The v3 rewrite lives on the **`feat/fs`** branch, not `main`. It becomes `main` at v3 GA — re-point the
commands below at `upstream/main` when that happens.

> **Repo rename pending.** The design doc refers to `github.com/hesprs/sync-engine`, and upstream's own
> `packages/plugin/package.json` already points its `repository`/`bugs` URLs there, but as of 2026-07-30
> that repository does not exist. The code still lives at `hesprs/obsidian-webdav-sync`. Re-point the
> `upstream` remote once the rename lands.

## Taking an upstream update

```sh
git fetch upstream feat/fs
git merge upstream/feat/fs
```

The owned files above resolve themselves. Then work through:

1. **Deliberate touch points.** Today: the `internalModules` array and the default settings literal in
   `packages/plugin/src/index.ts` (see the Overview document §5). Re-apply the same edit to the new
   upstream version.
2. **Deleted paths.** Re-delete anything from the table above that the merge resurrected.
3. **Vendored WebDAV core.** Diff upstream's WebDAV FS against the pinned copy under
   `packages/factorin/src/backend/webdav/` and port fixes deliberately. Vendored code never conflicts,
   so it goes stale silently if nobody looks.
4. **Upstream base record.** Update `factorin.upstream.baseVersion` in `package.json`.
5. **Branding sweep.** `grep -rin "sync engine\|sync-engine\|hesprs" -- . ':!node_modules'` and confirm
   every remaining hit is one of the allowed upstream-describing places listed under "Plugin identity".

### Known fork-local edits outside the owned list

These live in upstream files, so they are *not* `merge=ours` — we want upstream's changes to keep
flowing. Expect to re-apply them by hand when a merge conflicts:

- `AGENTS.md` — a pointer to this file, plus removal of the `docs/` site references (that workspace no
  longer exists here). On conflict, take upstream's file and re-apply both.
- `scripts/version-bump.ts` — rewired to our versioning scheme (see "Versioning"). On conflict, take
  upstream's file and re-apply the same redirection.
- `packages/plugin/src/index.ts` — the two Overview §5.1 touch points: `Factorin` last in
  `internalModules`, and `remoteFs: 'factorin'` / `moduleSources: []` / `moduleAutoUpdate: false` in the
  `onload` defaults. Each is marked with a `// Factor.In — FORK EDIT` comment; grep for that string
  after a merge.
- `packages/plugin/tsconfig.json` — two `paths` entries mapping `@hesprs/sync-engine-sdk` and
  `.../dev` to `./src/sdk/*.ts`. `@factorin/module` is compiled into this package and type-checks
  against the SDK by package name; the SDK *is* this package, so resolving it to `./dist` would make the
  SDK build depend on its own previous output. On conflict, take upstream's file and re-add the two
  entries.

> `@factorin/module` is deliberately **not** declared in `packages/plugin/package.json`. It resolves
> through Bun's workspace linking. Declaring it would make the two packages depend on each other
> (`@factorin/module` → `@hesprs/sync-engine-sdk` *is* `packages/plugin`), and Turbo rejects a cyclic
> task graph — which would break the `postinstall` SDK build and therefore every build.

## History: the pre-v3 reset

The fork's history before v3 is **unrelated** to upstream's `feat/fs` branch — `git merge-base` between
them is empty. Rather than merge, the fork's mainline was reset onto the v3 monorepo commit
(`30ba2e9`, `3.0.0-beta-15`) so future upstream merges have a real common ancestor.

The pre-v3 state (single-package layout with a root `src/`) is preserved for reference at:

- commit `a1e7ff5c8cc499bdec7abd9cf44f51f86a4a51c2`
- branch `factorin/pre-v3` and tag `pre-v3-base`

Nothing was lost in the reset: the pre-v3 tree carried no Factor.In patches — the branding work had not
started, and none of the files the old plan targeted exist in v3.

## Building

From the repository root:

```sh
bun install          # postinstall builds @hesprs/sync-engine-sdk first
bun run build:plugin # → packages/plugin/dist-plugin/{main.js,manifest.json,styles.css}
```

Bun (pinned to `1.3.13` by `packageManager`) is required; see `AGENTS.md` for the rest of the task
runner commands.

### Installing a build into a test vault

```sh
dest="<your test vault>/.obsidian/plugins/factorin-obsidian-plugin"
mkdir -p "$dest"
cp packages/plugin/dist-plugin/{main.js,manifest.json,styles.css} "$dest"
```

Restart Obsidian (or run **Reload app without saving**), then check **Settings → Community plugins**:
the entry must read **Factor.In Obsidian** by **Factor.In**, at the manifest's version. The plugin
folder name must match the manifest `id`, or Obsidian ignores the plugin.
