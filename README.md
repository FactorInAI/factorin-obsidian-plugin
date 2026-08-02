<h1 align="center">
    <img src="./docs/public/logo.svg" alt="Sync Engine logo" width="280px">
    <br />
    Sync Engine
    <br />
</h1>

<h4 align="center">The next-generation syncing plugin: Fast · Free · Extend with Modules</h4>

<p align="center">
    <a href="https://github.com/hesprs/obsidian-webdav-sync/releases/latest">
        <img src="https://img.shields.io/github/downloads/hesprs/obsidian-webdav-sync/manifest.json.svg?style=flat&label=%E2%AC%87%20Downloads&labelColor=008811&color=333333&displayAssetName=false" alt="accumulated downloads">
    </a>
    <a href="https://github.com/hesprs/obsidian-webdav-sync/actions">
        <img src="https://img.shields.io/github/actions/workflow/status/hesprs/obsidian-webdav-sync/ci.yml?style=flat&logo=github&logoColor=white&label=CI&labelColor=d4ab00&color=333333" alt="ci">
    </a>
    <a href="https://sync.consensia.cc">
        <img src="https://img.shields.io/badge/Documentation-Ready-333333?labelColor=5C73E7&logo=vitepress&logoColor=white" alt="Documentation" />
    </a>
    <img src="https://img.shields.io/badge/Types-Strict-333333?logo=typescript&labelColor=blue&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/%F0%9F%96%90%EF%B8%8F%20Made%20by-Humans-333333?labelColor=15C2C0" alt="Made by Humans">
    <img src="https://img.shields.io/github/stars/hesprs/obsidian-webdav-sync" alt="GitHub stars">
</p>


<p align="center">
    <a href="https://github.com/hesprs/synthkernel">
        <img src="https://github.com/hesprs/synthkernel/raw/refs/heads/main/assets/powered-by-synthkernel.svg" width="200px" alt="powered by SynthKernel"></img>
    </a>
</p>

<p align="center">
    <a href="./README.zh.md">
        <strong>简体中文</strong>
    </a> • 
    <a href="https://sync.consensia.cc">
        <strong>Documentation</strong>
    </a> • 
    <a href="https://community.obsidian.md/plugins/webdav-sync">
        <strong>Plugin Store</strong>
    </a> • 
    <a href="#license-copyright-and-originality">
        <strong>License</strong>
    </a>
</p>

## Introduction

Sync Engine is a revolutionary solution for vault syncing. Its not only a syncing plugin, it is a modular platform that everyone can build upon.

The core ships the infrastructure, and all backends (WebDAV, S3, GDrive) and features (i18n, optimization, sync strategy) come from composable modules. You and your AI agents can build your own modules via convenient SDK, extend the plugin, contribute to community, all without modifying the source code.

There's already a lot of plugins to sync your notes between devices:

- [Remotely Save](https://github.com/remotely-save/remotely-save) supports many backends (S3, Dropbox, OneDrive, WebDAV). But is optionally paid, development paused for years with stability issues
- [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) and [Fast Note Sync](https://github.com/haierkeys/obsidian-fast-note-sync) offer real-time, server-based sync. They work well if you are comfortable setting up your own server.
- [Relay](https://github.com/No-Instructions/Relay) is a managed relay service. Convenient, but your notes pass through infrastructure you don't control.

Sync Engine fits the gap: you want to choose your own storage, you want the plugin to stay small because unused features aren't bundled in, and you want a highly optimized syncing that is no slower than a self-hosted server.

## Features

### Core Functions

- Bidirectional syncing.
- Startup / periodic / save-on-change syncing.
- Conflict resolution strategies (keep both / latest survive / keep remote / keep local / skip).
- Rate / memory control options.
- Custom headers.
- You can extend most above features by writing modules.

### Module-Extended

- **Backends**: WebDAV
- **Features**: Encryption, Smart Merge Conflict Resolution

### Extensible Architecture

- You can add backends, optimizers, sync triggers, i18n resources, decision strategies, conflict strategies, setting entries, custom file processing, and invoke all possible operations in custom modules.
- Documentation, AI agent skills, and SDK with debug and testing kit are provided.
- Plugin provides dedicated module discovery and management UI.
- Repo accepts any module contribution as long as it respects [contribution guide](./CONTRIBUTING.md).

### Radical Optimization

- Incremental syncing never uploads the full vault each time.
- [Anchored Asymmetric Storage](https://sync.consensia.cc/deep-dive/asymmetric-storage) technology substantially accelerates syncing.
- Real-time sync uses cached remote states, allowing it to complete within milliseconds.
- **40 times** smaller size than Remotely Save, **20 times** faster startup time.
- Handles vaults with thousands of files smoothly.
- No slower than a self-hosted server
- Detailed performance comparison can be found in [performance benchmark](https://sync.consensia.cc/usage/benchmark).

## Install & Setup

Sync Engine v3 is in beta testing, you can install via BRAT:

1. Go to **Community plugins** and search for `BRAT`.
2. Install and enable it.
3. Click **Add beta plugin** and fill `https://github.com/hesprs/obsidian-webdav-sync` into _repository_.
4. Select _Latest_ and install + enable Sync Engine.

Configuration:

1. Go to plugin settings, find **Module management**, open the panel.
2. Browse and install needed translations and backends.
3. Configure your backend, automatic connectivity check is shown as an icon inside **Storage backend** entry.
4. Start your first sync from command palette or ribbon button.
5. Review the sync tasks that will be performed.
6. Click "Confirm", and your files will arrive the configured backend at the speed of light.

## Common Questions

<details><summary>What should I do if I get an error during syncing?</summary>

You can simply retry the sync. An error does not block later syncs nor corrupt your files.

If the error persists after retrying, please [open an issue](https://github.com/hesprs/obsidian-webdav-sync/issues/new), describing the error, your setup, with the support log attached.

</details>

<details><summary>How should I manage my WebDAV storage when using this plugin?</summary>

According to this plugin's [file handling strategy](https://hesprs.github.io/projects/obsidian-webdav-sync#technical-breakdown), all remote changes will be propagated to all vaults. So it's generally not recommended to manually manage your WebDAV storage unless you intend to add / remove these files. Manual management is more discouraged when you have encryption or asymmetric storage enabled.

</details>

## Roadmap

Below is a list of planned features and improvements, the faster this plugin is adopted and the star ⭐ grows, the faster the development will be. Also, we welcome contributors that would like to help us with the development of either modules or core.

- [x] v3.0: Rewrite entirely, dynamic module loading, module store, asymmetric storage, and rebrand
- [ ] v3.1: Migrate settings to Obsidian v1.13 API

## License

The source code of Sync Engine and modules in this repository are licensed under the [MIT License](https://mit-license.org/).<br>
Documents in the documentation website are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license.

Copyright ©️ 2026 Hēsperus and All Contributors
