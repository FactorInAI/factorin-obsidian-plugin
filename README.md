<h1 align="center">
    <img src="./packages/factorin/assets/logo.svg" alt="Factor.In" width="280px">
    <br />
    Factor.In Obsidian
    <br />
</h1>

<h4 align="center">Your Factor.In library, in your vault — and AI workflows, in your editor.</h4>

## What it is

Factor.In Obsidian makes Obsidian a first-class interface to [Factor.In](https://factor.in).

Factor.In is where you build the library that feeds your AI runs: documents, prompts, agent
skills, projects, and tasks. This plugin brings that library into your vault as ordinary
markdown files, and lets you launch Factor.In **workflows** — off-device agentic runs — on the
note you are looking at.

Two things, one plugin:

- **Library sync** — paste a Factor.In API token and your library syncs into the vault under
  `Documents/`. Edits made in Obsidian flow back. No WebDAV URLs, no passwords, no manual
  backend setup.
- **AI workflows** — "Write with AI" and "Run Task with AI" hand a content item to Factor.In,
  which runs it off-device and writes the result back into your library. The output arrives in
  your vault on the next sync.

## Requirements

- Obsidian **1.12.3** or newer (desktop or mobile).
- A Factor.In account and an API token with **Drive** access, minted in Factor.In's token UI.

## Install

The plugin is not in Obsidian's community plugin store yet. Install a build manually:

1. Download `main.js`, `manifest.json` and `styles.css` from a Factor.In Obsidian release.
2. Copy them into `<your vault>/.obsidian/plugins/factorin-obsidian-plugin/`.
3. Restart Obsidian, open **Settings → Community plugins**, and enable **Factor.In Obsidian**.

To build from source instead, see [FACTOR.IN.md](./FACTOR.IN.md).

## Connect

1. Open **Settings → Factor.In Obsidian**.
2. Paste your `fi_…` API token and press **Connect**.
3. Pick your account if the token unlocks more than one.

The plugin asks Factor.In which account and drive the token unlocks, then mounts it. Your token
is stored in Obsidian's secret storage — it is never written into the plugin's settings file.
A token with read-only Drive access syncs one way; a token with write access syncs both ways.

On the first successful connect, `Documents/Welcome.md` is created and opened.

## Sync behaviour

- Bidirectional, incremental sync — the whole library is never re-uploaded.
- Sync on startup, on a schedule, or on save.
- Conflict resolution strategies: keep both, latest survives, keep remote, keep local, skip.
- Rate and memory controls for large libraries.

The plugin talks only to Factor.In. Its backend is compiled in, so it downloads no code at
runtime and contacts no third-party module catalog.

## AI workflows

With a token that carries the `workflows` scope, the command palette gains:

- **Factor.In: Write with AI** — run a workflow against the active document or prompt; the run
  produces a new version of it.
- **Factor.In: Run Task with AI** — run a workflow against a task.

Runs take minutes. The plugin shows live status and the run id; the files a run produces land in
your library and reach the vault with the next sync.

> **Status:** the workflow commands appear only once your token reports the `workflows` scope.
> Until the Factor.In workflow API is public, library sync is the shipping surface.

## Privacy

- Your API token lives in Obsidian's secret storage, never in `data.json`.
- The plugin contacts `api.factorin.com` and `drive.factorin.com`, and nothing else.
- No telemetry.

## Support

Questions and bug reports go to the Factor.In team. For a sync problem, attach the support log
the plugin's settings tab can export — it records what the last syncs did.

## License

MIT. Copyright ©️ 2026 Factor.In. Portions copyright ©️ 2026 Hēsperus and contributors, used
under the MIT license.
