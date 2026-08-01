<h1 align="center">
    <img src="./docs/public/logo.svg" alt="Sync Engine logo" width="280px">
    <br />
    Sync Engine
    <br />
</h1>

<h4 align="center">下一代同步插件：快速 · 免费 · 模块化扩展</h4>

<p align="center">
    <a href="https://github.com/hesprs/obsidian-webdav-sync/releases/latest">
        <img src="https://img.shields.io/github/downloads/hesprs/obsidian-webdav-sync/manifest.json.svg?style=flat&label=%E2%AC%87%20Downloads&labelColor=008811&color=333333&displayAssetName=false" alt="累计下载量">
    </a>
    <a href="https://github.com/hesprs/obsidian-webdav-sync/actions">
        <img src="https://img.shields.io/github/actions/workflow/status/hesprs/obsidian-webdav-sync/ci.yml?style=flat&logo=github&logoColor=white&label=CI&labelColor=d4ab00&color=333333" alt="ci">
    </a>
    <a href="https://sync.consensia.cc">
        <img src="https://img.shields.io/badge/Documentation-Ready-333333?labelColor=5C73E7&logo=vitepress&logoColor=white" alt="文档" />
    </a>
    <img src="https://img.shields.io/badge/Types-Strict-333333?logo=typescript&labelColor=blue&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/%F0%9F%96%90%EF%B8%8F%20Made%20by-Humans-333333?labelColor=15C2C0" alt="人类制造">
</p>

<p align="center">
    <a href="./README.md">
        <strong>English</strong>
    </a> • 
    <a href="https://sync.consensia.cc">
        <strong>文档</strong>
    </a> • 
    <a href="https://community.obsidian.md/plugins/webdav-sync">
        <strong>插件市场</strong>
    </a> • 
    <a href="#license-copyright-and-originality">
        <strong>开源协议</strong>
    </a>
</p>

## 简介

Sync Engine 是一个革命性的 Vault 同步解决方案。它不仅是一个同步插件，更是一个人人都可以为其构建生态的模块化平台。

插件核心仅提供基础设施，所有的后端支持（WebDAV、S3、GDrive）和功能（国际化、性能优化、同步策略）均由可组合的模块提供。您和您的 AI Agent 可以通过便捷的 SDK 开发专属模块、扩展插件功能并贡献给社区，全程无需修改核心源代码。

目前已经有不少用于在设备间同步笔记的插件：

- [Remotely Save](https://github.com/remotely-save/remotely-save)：支持多种后端（S3、Dropbox、OneDrive、WebDAV）。但包含可选的付费项目，且已暂停维护多年，存在稳定性问题。
- [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) 和 [Fast Note Sync](https://github.com/haierkeys/obsidian-fast-note-sync)：提供基于服务器的实时同步。如果您擅长搭建和维护自己的服务器，它们是不错的选择。
- [Relay](https://github.com/No-Instructions/Relay)：一项托管式中继服务。虽然便捷，但您的笔记会经过您无法掌控的基础设施。

Sync Engine 恰好填补了这一空白：您可以自由选择存储服务，插件因未打包无用功能而保持轻量，同时还拥有不亚于自建服务器的高度优化同步体验。

## 特性

### 核心功能

- 双向同步。
- 启动同步 / 定时同步 / 改动时保存同步。
- 冲突解决策略（保留两者 / 最新优先 / 保留远程 / 保留本地 / 跳过）。
- 速率 / 内存控制选项。
- 自定义请求头（Custom headers）。
- 以上绝大多数功能均可通过编写模块进行扩展。

### 模块扩展功能

- **存储后端**：WebDAV
- **高级功能**：加密、智能合并冲突解决（Smart Merge）

### 极具扩展性的架构

- 您可以在自定义模块中添加后端、优化器、同步触发器、国际化资源、决策策略、冲突策略、设置项、自定义文件处理，并调用所有可用的操作。
- 提供完善的文档、AI Agent Skill 以及带有调试和测试工具包的 SDK。
- 插件内置专门的模块探索与管理 UI。
- 只要符合[贡献指南](./CONTRIBUTING.md)，本仓库欢迎任何模块贡献。

### 激进的性能优化

- 增量同步，绝不每次都上传整个 Vault。
- [锚定非对称存储（Anchored Asymmetric Storage）](https://sync.consensia.cc/deep-dive/asymmetric-storage) 技术大幅提速同步过程。
- 实时同步使用缓存的远程状态，可在数毫秒内完成。
- 体积比 Remotely Save 小 **40 倍**，启动速度快 **20 倍**。
- 轻松胜任包含数千个文件的 Vault。
- 速度不亚于自建服务器。
- 详细的性能对比请参阅 [性能基准测试](https://sync.consensia.cc/usage/benchmark)。

## 安装与设置

Sync Engine v3 目前处于 Beta 测试阶段，您可以通过 BRAT 进行安装：

1. 打开 **社区插件（Community plugins）** 并搜索 `BRAT`。
2. 安装并启用该插件。
3. 点击 **Add beta plugin**，在 _repository_ 输入框中填写 `https://github.com/hesprs/obsidian-webdav-sync`。
4. 选择 _Latest_ 并安装 + 启用 Sync Engine。

配置步骤：

1. 进入插件设置，找到 **模块管理（Module management）**，打开管理面板。
2. 浏览并安装所需的语言包和存储后端。
3. 配置您的后端，连通性自动检查结果会以图标形式展示在 **存储后端（Storage backend）** 设置项中。
4. 通过命令面板或侧边栏图标启动您的第一次同步。
5. 预览即将执行的同步任务。
6. 点击“确认”，您的文件将以光速同步至配置好的后端。

## 常见问题

<details><summary>同步过程中出现报错怎么办？</summary>

您可以直接尝试重新同步。个别错误不会阻塞后续的同步，也不会损坏您的文件。

如果重试后错误依然存在，请 [提交 Issue](https://github.com/hesprs/obsidian-webdav-sync/issues/new)，附上错误描述、您的配置环境以及支持日志（Support log）。

</details>

<details><summary>使用本插件时，我应该如何管理 WebDAV 存储？</summary>

根据本插件的 [文件处理策略](https://hesprs.github.io/projects/obsidian-webdav-sync#technical-breakdown)，所有远程变更都会传播到所有 Vault 中。因此通常不建议手动管理 WebDAV 存储中的文件，除非您确定要手动添加或删除这些文件。当您启用了加密或非对称存储时，更不建议进行手动干预。

</details>

## 路线图

以下是计划中的功能和改进清单。插件获得的关注和 Star ⭐ 越多，开发进度就会越快。同时，我们也极其欢迎贡献者加入我们，共同开发模块或插件核心。

- [x] v3.0：全面重构，支持动态模块加载、模块商店、非对称存储，并完成品牌重塑
- [ ] v3.1：将设置项迁移至 Obsidian v1.13 API

## 开源协议与版权

本仓库中的 Sync Engine 源代码及模块采用 [MIT 协议](https://mit-license.org/) 开源。<br>
文档网站中的文档采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 协议授权。

Copyright ©️ 2026 Hēsperus and All Contributors
