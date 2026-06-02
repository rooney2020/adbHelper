# Contracts 目录说明

本目录用于维护 ADB Helper 的模块间契约，当前重点覆盖：

1. Renderer 与 Electron 主进程之间的 IPC 契约
2. Electron 主进程与 Python 后端之间的 CLI/进程调用契约
3. 核心数据结构（设备、命令元数据、执行结果、快照）的 schema 约束

规则：

- 契约变更需同步更新 docs/plan.md 中的接口契约章节。
- 契约版本独立遵循 SemVer。
- 实现阶段新增接口前，先更新对应契约文件。