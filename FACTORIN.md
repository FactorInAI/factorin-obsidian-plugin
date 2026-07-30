# Factorin fork — repository & merge strategy

This repository is a **branded fork of the upstream Sync Engine monorepo**. Factorin ships as its own
Obsidian plugin ("Factorin Sync"), built from upstream's v3 codebase with Factorin-specific code kept in
its own workspace package so upstream stays mergeable.

Read this before merging anything from upstream. The full architecture rationale lives in the Factorin
`Overview` design document; this file is the operational half — what is ours, what is theirs, and how to
take an upstream update.

## One-time setup per clone

The owned-files strategy below relies on git's `ours` merge driver, which git does **not** define by
default. Every clone must register it once, or merges will fail on the files listed in `.gitattributes`:

```sh
git config merge.ours.driver true
```

This is a local config value — it cannot be committed, so each developer and each CI checkout has to run
it. (`merge=ours` as a *driver* is unrelated to `git merge -s ours`; the driver resolves per-file conflicts
by keeping our version.)

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

## Owned files (never taken from upstream)

`.gitattributes` marks these `merge=ours`, so an upstream merge always keeps the Factorin version:

| File | Why it's ours |
|---|---|
| `manifest.json` | Obsidian manifest — Factorin id/name/author/description |
| `package.json` | fork name and metadata |
| `packages/plugin/manifest.json` | listed pre-emptively; see note below |
| `README.md` | Factorin product docs, no upstream references |
| `FACTORIN.md` | this file |
| `.gitattributes` | the list itself |

> `packages/plugin/manifest.json` does **not** exist in upstream `feat/fs` — the root `manifest.json` is
> the only Obsidian manifest today. The entry is harmless and covers the case where upstream moves the
> manifest into the plugin package.

Everything else is upstream's and merges normally.

## Taking an upstream update

```sh
git fetch upstream feat/fs
git merge upstream/feat/fs
```

The owned files above resolve themselves. Expect conflicts only in the deliberate touch points the
Overview document lists (today: the `internalModules` array and the default settings literal in
`packages/plugin/src/index.ts`) — re-apply the same edit to the new upstream version.

Also at every merge, diff upstream's WebDAV FS core against the pinned copy Factorin vendors under
`packages/factorin/src/backend/webdav/` and port fixes deliberately. Vendored code never conflicts, so it
will silently go stale if nobody looks.

### Known fork-local edits outside the owned list

- `AGENTS.md` — one added line pointing here. Not `merge=ours` (we want upstream's guidance to keep
  flowing); if a merge conflicts on it, take upstream's file and re-add the pointer.

## History: the pre-v3 reset

The fork's history before v3 is **unrelated** to upstream's `feat/fs` branch — `git merge-base` between
them is empty. Rather than merge, the fork's mainline was reset onto the v3 monorepo commit
(`30ba2e9`, `3.0.0-beta-15`) so future upstream merges have a real common ancestor.

The pre-v3 state (single-package layout with a root `src/`) is preserved for reference at:

- commit `a1e7ff5c8cc499bdec7abd9cf44f51f86a4a51c2`
- branch `factorin/pre-v3` and tag `pre-v3-base`

Nothing was lost in the reset: the pre-v3 tree carried no Factorin patches — the branding work had not
started, and none of the files the old plan targeted exist in v3.

## Building

From the repository root:

```sh
bun install          # postinstall builds @hesprs/sync-engine-sdk first
bun run build:plugin # → packages/plugin/dist-plugin/{main.js,styles.css}
```

Bun (pinned to `1.3.13` by `packageManager`) is required; see upstream `AGENTS.md` for the rest of the
task runner commands.
