# ADB Helper 技术计划

**版本**: v1.0.0 | **日期**: 2026-05-12 | **需求规格**: docs/spec.md

## 项目 Foundation

| 属性 | 值 |
|------|-----|
| 项目类型 | 桌面应用 |
| 目标平台 | Ubuntu / Windows / macOS |
| 用户群体 | Android 开发者 / 测试工程师 / 技术支持 |
| 项目规模 | 大型 |
| 预计工期 | > 4h |

## 项目原则（v1.0.0）

- **P1. [架构] Capability 优先执行** — 所有 adb 操作必须先经过设备识别、能力探测和适配决策，禁止 UI 直接盲执行底层命令。
- **P2. [安全] 前后端隔离** — Renderer 禁止直接访问 Node 能力或系统命令，所有执行请求必须经 Electron 主进程白名单 IPC 和 Python 后端适配层。
- **P3. [代码质量] 结果双视图** — 文本型命令必须同时保留原始输出与结构化视图，解析失败时禁止丢失原文。
- **P4. [架构] 全量命令可导航** — “全部 adb 命令”必须通过分类目录、搜索、收藏和原始命令模式组合承载，禁止把全部能力直接平铺成按钮堆叠。
- **P5. [性能] 大结果优先可读性** — 结果展示层必须把搜索、高亮、折叠、虚拟滚动和导出视为核心能力，而不是附属功能。

## 技术栈

| 类别 | 技术 | 版本 | 选择依据 |
|------|------|------|---------|
| 桌面壳 | Electron | 35.x | 满足 Ubuntu/Windows/macOS 跨平台桌面分发，适合复杂文本展示和桌面集成 |
| 前端 | React + TypeScript + Vite | React 19 / TS 5.8 / Vite 7 | 适合大型信息架构、复杂状态展示和组件化原型复用 |
| 后端执行层 | Python | 3.10+ | 便于封装 adb/fastboot 调用、适配规则、解析器与本地工具链 |
| 本地存储 | SQLite | 3.x | 存储命令目录元数据、执行历史、收藏、快照与 capability 缓存 |
| 样式系统 | CSS Variables + 组件级样式 | - | 便于原型阶段沉淀视觉令牌，跨平台一致性强 |
| 前端测试 | Vitest + Playwright | 当前稳定版 | 覆盖组件、交互与 Electron renderer 行为 |
| 后端测试 | Pytest | 当前稳定版 | 覆盖命令适配、解析器与存储逻辑 |

## 模块划分

| 模块 | 职责 | 对外接口 | 依赖 |
|------|------|---------|------|
| electron-main | 窗口、菜单、生命周期、IPC 路由、文件/系统集成 | `window.api.*` 暴露、后端进程调度 | preload、python-backend |
| preload-bridge | 建立安全 IPC 白名单，将有限能力暴露给 renderer | `device.list()`、`command.run()`、`result.export()` | electron-main |
| renderer-shell | 工作台 UI、导航、设备页、结果页、原型承接 | React 路由、状态管理、组件树 | preload-bridge |
| command-catalog | 全量 adb 命令目录、分类、搜索、收藏、模板管理 | `searchCommands()`、`getCommandMeta()` | SQLite、capability-engine |
| capability-engine | 设备探测、命令支持度评估、替代链路选择 | `probeDevice()`、`resolveCommand()` | adb-runner、catalog |
| adb-runner | 统一封装 adb/fastboot 子进程调用、超时、stderr 处理 | `run_adb()`、`run_shell()` | Python runtime |
| parser-engine | dumpsys/am/cmd/logcat 等文本的语义分段与结构化解析 | `parse_result()`、`fallback_raw()` | capability-engine |
| persistence-store | 历史、快照、收藏、设置、本地缓存 | repository API | SQLite |

## 接口契约

### renderer-shell → electron-main

```text
device.list(): Promise<DeviceSummary[]>
device.probe(deviceId): Promise<DeviceCapabilityReport>
command.search(keyword, filters): Promise<CommandSummary[]>
command.run(payload): Promise<CommandExecutionResult>
result.export(payload): Promise<ExportResult>
history.list(filters): Promise<ExecutionHistoryItem[]>
```

### electron-main → python-backend

```text
python backend cli
  probe --device <serial>
  run --device <serial> --command-id <catalogId> [--raw "adb shell ..."]
  parse --command-id <catalogId> --input-file <path>
  export --result-id <id> --format <markdown|json|text>
```

## 数据模型

| 实体 | 属性 | 关系 | 说明 |
|------|------|------|------|
| Device | serial、model、brand、androidVersion、transport、state | 1:N CapabilitySnapshot、1:N ExecutionRecord | 当前接入设备 |
| CommandMeta | id、category、syntax、riskLevel、tags、fallbacks | 1:N ExecutionRecord | 全量 adb 命令目录与元数据 |
| CapabilitySnapshot | deviceSerial、commandId、supportLevel、reason、checkedAt | N:1 Device / N:1 CommandMeta | 设备与命令的支持度快照 |
| ExecutionRecord | id、deviceSerial、commandId、rawCommand、status、durationMs、summary | N:1 Device / N:1 CommandMeta | 历史执行记录 |
| ResultSnapshot | recordId、rawText、structuredJson、viewPreset | 1:1 ExecutionRecord | 用于离线回看和导出 |
| FavoriteCommand | commandId、pinOrder、scope | N:1 CommandMeta | 收藏与快捷入口 |

## 风险登记册

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| 全量 adb 命令范围过大导致信息架构失控 | 高 | 高 | 采用分类目录 + 搜索 + 收藏 + 原始命令兜底，避免全量功能一次性显式铺开 |
| 不同 ROM/Android 版本命令差异大 | 高 | 高 | 建立 capability 探测、适配元数据和替代链路；失败信息结构化 |
| dumpsys 等结果过大造成渲染卡顿 | 中 | 高 | 使用虚拟滚动、延迟解析、结果分段和原文兜底 |
| Electron 与 Python 进程通信复杂 | 中 | 中 | 使用白名单 IPC + 明确 CLI 契约 + 契约测试 |
| 三平台打包差异影响交付 | 中 | 高 | 提前规划 Electron Builder 配置、平台能力矩阵和后续部署验证 |

## 里程碑

| 里程碑 | 交付物 | 预计完成 | 状态 |
|--------|--------|---------|------|
| M1: 架构与原型冻结 | spec、plan、principles、ADR、原型 | 需求与原型阶段后 | 进行中 |
| M2: 核心工作台可运行 | 设备管理、命令目录、基础执行链路 | 实现阶段中期 | 未开始 |
| M3: 结果展示增强完成 | dumpsys/logcat 结构化展示、导出、历史 | 实现阶段后期 | 未开始 |
| M4: 跨平台交付 | 测试报告、打包产物、发布清单 | 部署阶段 | 未开始 |

## 技术调研摘要

- 依据跨平台桌面端默认选型规则，本项目优先采用 Electron。
- 未采用 Qt：虽然原生桌面能力强，但默认规则不推荐作为跨平台桌面新项目的首选，且复杂文本展示与原型复用成本更高。
- 未采用 Tauri：包体更小，但“Electron + Web 前端 + Python 后端”组合在复杂工作台、成熟生态和后续插件化上更稳妥。
- Python 后端负责命令执行、适配和解析，是为了把系统命令与 UI 隔离，并复用成熟的文本处理能力。

## 实施计划

| 阶段 | 任务 | 依赖 | 预估工时 |
|------|------|------|---------|
| Phase 1 | 初始化 Electron + React + Python 项目骨架 | 无 | 4-6h |
| Phase 2 | 搭建设备管理、命令目录、IPC 契约 | Phase 1 | 6-10h |
| Phase 3 | 实现 capability 探测与原始命令模式 | Phase 2 | 6-10h |
| Phase 4 | 完成查看型结果结构化展示与导出 | Phase 3 | 8-12h |
| Phase 5 | 测试、打包、交付 | Phase 4 | 6-10h |

## 快速启动

```bash
# 规划中的开发工作流
# 1. 初始化 Electron + React + TypeScript 工程
# 2. 初始化 Python backend 与依赖管理
# 3. 建立 IPC 契约与本地 CLI 协议
# 4. 启动桌面壳 + renderer + backend 开发态联调
```