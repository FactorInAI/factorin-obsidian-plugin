# What's Sync Engine

## Introduction

**Sync Engine** is born from the chaos of syncing plugin landscape:

- The absolute dominator, [Remotely Save](https://github.com/remotely-save/remotely-save), has been unmaintained for years, with a series of stability issues. And requires subscription to access advanced features.
- Some other famous solutions, like [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) and [Fast Note Sync](https://github.com/haierkeys/obsidian-fast-note-sync) require custom server setup, which aren't great choices for users without technical understanding or economic power.
- Services like [Relay](https://github.com/No-Instructions/Relay) are based on proprietary infrastructure and requires payment. Your data isn't fully controlled by yourself.
- Most tiny syncing plugins often focus on a single service, which is nice, but the optimization can be awful.
- Newly emerged syncing plugins might be **vibe-coded**, they could have significant maintenance risk and security defects (especially in sensitive areas like encryption).
- More importantly, all syncing plugins above are **monolithic**, the function of the plugin is fixed, extension requires the author to change source code. This closeness not only adds maintenance overhead, but also often makes the plugin overly **bloated**, full of features that only a fraction of users use.

Sync Engine adapts an architecture that nobody has tried before: **the plugin core offers no more than a module manager and a highly optimized sync routine, all backends, advanced features, translations, etc. come from optional modules**. This architecture powers Sync Engine to achieve infinite feature probability and higher performance. You no longer need to find a new plugin to satisfy your syncing needs, you simply install a module.

## Features

Sync Engine core offers necessary features to ensure the extensibility and performance:

🧰 **Basic Features**:

- Bidirectional syncing.
- Startup / periodic / save-on-change syncing.
- Conflict resolution strategies (keep both / latest survive / keep remote / keep local / skip).
- Rate / memory control options.
- Custom headers.
- You can extend most above features by writing modules.

🧩 **Extensible Architecture**:

- You can add backends, optimizers, sync triggers, i18n resources, decision strategies, conflict strategies, setting entries, custom file processing, and invoke all possible operations in custom modules.
- Documentation, AI agent skills, and SDK with debug and testing kit are provided.
- Plugin provides dedicated module discovery and management UI.
- Repo accepts any module contribution as long as it respects [contribution guide](/development/contributing.md).

⚡ **Radical Optimization**:

- Incremental syncing never uploads the full vault each time.
- [**Anchored Asymmetric Storage™**](asymmetric-storage.md) technology substantially accelerates syncing.
- Real-time sync uses cached remote states, allowing it to complete within milliseconds.
- **40 times** smaller size than Remotely Save, **20 times** faster startup time.
- Handles vaults with thousands of files smoothly.
- Highly optimized core sync timing never wastes one millisecond.
- Extensible optimizer slot ensures every request is optimized for your own service.
- Detailed performance comparison can be found in [performance benchmark](benchmark.md).

📦 **Module-provided Features**:

- 🖥 Supported backends:
  - WebDAV (`WebDAV` official module)
- 🔐 Client-side encryption: provided by `Encryption` official module. See detail in the [encryption specification](https://github.com/hesprs/sync-engine/blob/main/blueprint/encryption.md).
- 📑 Smart merge: provided by `Smart Merge` official module. Merges documents when file conflict is detected.
- The full list of official modules can be found in [modules](modules.md).

## Usage

It is simple to start using Sync Engine:

1. Download and enable `Sync Engine` from Obsidian plugin store.
2. Open "Module management" panel, install needed translations, backends and optional features.
3. Fill the necessary information about your cloud service.
4. Start your first sync.
