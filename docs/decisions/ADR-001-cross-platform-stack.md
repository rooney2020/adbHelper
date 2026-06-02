# ADR-001: 采用 Electron + React + Python 作为跨平台桌面技术栈

## 状态：已采纳

## 背景

项目目标是面向 Ubuntu、Windows、macOS 的 adb 桌面助手，且范围覆盖全部 adb 命令，同时要求对 dumpsys、logcat、am、cmd 等复杂文本结果做清晰、直观的展示。该目标意味着：

- 需要成熟的跨平台桌面外壳与打包生态
- 需要强大的文本结果渲染和信息架构能力
- 需要稳定的本地命令执行、适配与解析能力

## 选项

- A. Electron + React + Python 后端
- B. Tauri + Web 前端 + Rust/Python 后端
- C. Qt / PySide 桌面应用

## 决策

选择 A：Electron + React + Python 后端。

## 原因

1. Electron 是当前规则下的跨平台桌面默认优先方案，适合 Ubuntu、Windows、macOS 一致交付。
2. React 更适合构建“设备工作台 + 全量命令目录 + 大结果浏览器”这类复杂信息架构界面。
3. Python 适合封装 adb 调用、规则适配、文本解析和本地存储逻辑，并能与 UI 层清晰隔离。
4. 该组合有利于后续原型复用、IPC 契约测试和多平台打包。

## 未选方案原因

- Tauri：包体和资源占用更优，但当前需求重点不是极致轻量，而是复杂工作台、生态成熟度和开发效率。
- Qt / PySide：能做原生桌面，但默认规则不推荐作为新的跨平台桌面首选；复杂文本工作台和原型迭代成本更高。

## 后果

- 必须严格执行 `contextIsolation`、IPC 白名单和主进程/渲染进程职责分离。
- 需要维护 Node/Electron 与 Python 双运行时。
- 架构复杂度上升，但换来跨平台能力、界面灵活度和结果展示能力。