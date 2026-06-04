# Dumpsys 模块参数定义与 UX 设计

> 版本：2026-06-03（v2 — 参数全部独立列出，不合并）
> 目标：每个模块的**每一个参数**都单独列出，不允许用 extra 掩盖多参数

---

## 目录

1. [参数类型与 UX 原则](#参数类型与-ux-原则)
2. [模块逐项分析](#模块逐项分析)
3. [构建规则](#构建规则)

---

## 参数类型与 UX 原则

### 四种基本类型

| 参数类型 | 渲染方式 | 适用于 |
|---|---|---|
| `select` | `<select>` 下拉框 | 子命令、固定值列表（`top`、`packages`、`--history` 等） |
| `flag` | `<input type="checkbox">` 复选框 | 无参数的开关（`--physical`、`--full`、`--csv` 等） |
| `package-picker` | `<input>` + 按钮弹窗选择器 | 包名输入 |
| `text` | `<input type="text">` 输入框 | 自由文本（key=`extra` 时放在命令尾部兜底） |

### 红线

- **禁止**将多个参数合并到同一个 extra 框里
- 每个参数都必须有独立的 key、label、渲染控件

---

## 模块逐项分析

### 1. `package`

**命令格式：**
```
dumpsys package [<subcmd> [<subcmd-arg>...]] [<pkg>] [<extra>...]
```

**参数（全部独立列出）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 子命令 | `select` | `subcmd` | 见下方选项表 |
| 2 | 目标包名 | `package-picker` | `package` | 可选，省略时只看子命令 |
| 3 | 列出文件路径 | `flag` | `packages_f` | `-f`，仅 `packages` 子命令时有效 |
| 4 | 包含未安装 | `flag` | `packages_u` | `-u` |
| 5 | 仅显示禁用 | `flag` | `packages_d` | `-d` |
| 6 | 仅显示启用 | `flag` | `packages_e` | `-e` |
| 7 | 仅系统包 | `flag` | `packages_s` | `-s` |
| 8 | 仅三方包 | `flag` | `packages_3` | `-3` |
| 9 | 仅 APEX 包 | `flag` | `packages_apex` | `--apex-only` |
| 10 | Checkin 格式 | `flag` | `packages_checkin` | `--checkin` |
| 11 | 显示安装源 | `flag` | `packages_show` | `--show-location` |
| 12 | 额外参数 | `text` | `extra` | 放置未列出的 flag |

**select 选项：**

| value | label | 说明 |
|---|---|---|
| `（空）` | 默认（包信息） | 只 dump 包信息 |
| `packages` | 列出所有包（packages） | 配合上述 flag |
| `packages -f` | 包 + 文件路径（packages -f） | 便捷选项，等价于 `packages` + `-f` |
| `features` | 功能特性（features） | — |
| `providers` | ContentProvider（providers） | — |
| `services` | 系统 Service（services） | — |
| `shared-libraries` | 共享库（shared-libraries） | — |

> ⚠️ 上表中的 flag 物理上总是出现在命令中；但它们仅在 `packages` 子命令下才有意义。当前 UI 无法条件性显示/隐藏参数，使用者需自行注意。

---

### 2. `meminfo`

**命令格式：**
```
dumpsys meminfo [<pkg>] [-a] [--oom] [-s] [-d] [--local] [--package] [--unreachable] [--debug]
```

**参数（全部独立列出）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 包名 | `package-picker` | `package` | 最常用，位置参数 |
| 2 | 详细信息 | `flag` | `a` | `-a`，展开所有类别 |
| 3 | OOM 调节 | `flag` | `oom` | `--oom`，显示 OOM 调整值 |
| 4 | 系统内存统计 | `flag` | `s` | `-s`，系统级汇总 |
| 5 | 设备详情 | `flag` | `d` | `-d`，设备级详情 |
| 6 | 本地进程 | `flag` | `local` | `--local` |
| 7 | 整体包 | `flag` | `pkg` | `--package` |
| 8 | 不可达内存 | `flag` | `unreachable` | `--unreachable` |
| 9 | 调试信息 | `flag` | `debug` | `--debug` |
| 10 | 额外参数 | `text` | `extra` | 兜底 |

---

### 3. `gfxinfo`

**命令格式：**
```
dumpsys gfxinfo [<pkg>] [framestats|reset] [-a]
```

**参数（全部独立列出）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 子命令 | `select` | `subcmd` | 见下方选项表 |
| 2 | 包名 | `package-picker` | `package` | 位置参数 |
| 3 | 所有进程 | `flag` | `a` | `-a` |
| 4 | 额外参数 | `text` | `extra` | 兜底 |

**select 选项：**

| value | label |
|---|---|
| `（空）` | 默认详情 |
| `framestats` | 帧统计（framestats） |
| `reset` | 重置统计（reset） |

---

### 4. `procstats`

**命令格式：**
```
dumpsys procstats [--pkg <pkg>] [--hours 3] [--days 7] [--csv] [--full-details] [--checkin] [--history] [--help] [--compact]
```

**参数（全部独立列出，共 9 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 包名 | `package-picker` | `package` | `--pkg <pkg>` |
| 2 | 统计小时数 | `text` | `hours` | `--hours <N>`，省略不限 |
| 3 | 统计天数 | `text` | `days` | `--days <N>`，省略不限 |
| 4 | CSV 格式 | `flag` | `csv` | `--csv` |
| 5 | 完整详情 | `flag` | `fullDetails` | `--full-details` |
| 6 | 历史数据 | `flag` | `history` | `--history` |
| 7 | 紧凑模式 | `flag` | `compact` | `--compact` |
| 8 | Checkin 格式 | `flag` | `checkin` | `--checkin` |
| 9 | 额外参数 | `text` | `extra` | 兜底 |

---

### 5. `batterystats`

**命令格式：**
```
dumpsys batterystats [--pkg <pkg>] [--charged] [--reset] [--history] [--daily] [--weekly] [--monthly] [--full] [--checkin] [-c] [--settings] [--write]
```

**参数（全部独立列出，共 12 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 包名 | `package-picker` | `package` | `--pkg <pkg>` |
| 2 | 已充电统计 | `flag` | `charged` | `--charged` |
| 3 | 重置统计 | `flag` | `reset` | `--reset` |
| 4 | 历史记录 | `flag` | `history` | `--history` |
| 5 | 每日统计 | `flag` | `daily` | `--daily` |
| 6 | 每周统计 | `flag` | `weekly` | `--weekly` |
| 7 | 每月统计 | `flag` | `monthly` | `--monthly` |
| 8 | 完整报告 | `flag` | `full` | `--full` |
| 9 | Checkin 格式 | `flag` | `checkin` | `--checkin` |
| 10 | 紧凑格式 | `flag` | `c` | `-c` |
| 11 | 同时输出设置 | `flag` | `settings` | `--settings` |
| 12 | 额外参数 | `text` | `extra` | 兜底（`--write` 等） |

---

### 6. `netstats`

**命令格式：**
```
dumpsys netstats [--uid <uid>] [--tag] [--poll] [--full] [--history] [--csv] [--help]
```

**参数（全部独立列出，共 6 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | UID | `text` | `uid` | `--uid <uid>`，按 UID 过滤 |
| 2 | 实时统计 | `flag` | `poll` | `--poll` |
| 3 | 完整报告 | `flag` | `full` | `--full` |
| 4 | 历史数据 | `flag` | `history` | `--history` |
| 5 | CSV 格式 | `flag` | `csv` | `--csv` |
| 6 | 额外参数 | `text` | `extra` | 兜底（`--tag` 等） |

---

### 7. `diskstats`

**命令格式：**
```
dumpsys diskstats [--hourly] [--daily] [--monthly] [--checkin]
```

**参数（全部独立列出，共 5 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 逐小时 | `flag` | `hourly` | `--hourly` |
| 2 | 逐日 | `flag` | `daily` | `--daily` |
| 3 | 逐月 | `flag` | `monthly` | `--monthly` |
| 4 | Checkin 格式 | `flag` | `checkin` | `--checkin` |
| 5 | 额外参数 | `text` | `extra` | 兜底 |

---

### 8. `activity`

**命令格式：**
```
dumpsys activity [top|activities|services|providers|broadcasts|o|intent|process|disk-usage]
dumpsys activity p <package>
dumpsys activity resolver <intent>
dumpsys activity intent-options <intent>
```

**参数（全部独立列出，共 4 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 子命令 | `select` | `subcmd` | 见下方选项表 |
| 2 | 包名（`p`） | `text` | `pkgArg` | `p <package>`，选 `p` 子命令时填充 |
| 3 | Intent（`resolver`/`intent-options`） | `text` | `intentArg` | `resolver <intent>` 或 `intent-options <intent>` |
| 4 | 额外参数 | `text` | `extra` | 兜底 |

> ⚠️ `pkgArg` 和 `intentArg` 在当前 UI 中无法条件显示，它们总是可见。用户在使用时按需填写其中一个即可。如果 `subcmd` 不是 `p`/`resolver`/`intent-options`，这两个参数应留空。

**select 选项：**

| value | label |
|---|---|
| `（空）` | 全部转储 |
| `top` | 当前 Activity（top） |
| `activities` | Activity 栈（activities） |
| `services` | 已注册 Service（services） |
| `providers` | ContentProvider（providers） |
| `broadcasts` | 已注册广播（broadcasts） |
| `o` | 概览（o） |
| `intent` | Intent 解析器（intent） |
| `process` | 进程（process） |
| `disk-usage` | 磁盘用量（disk-usage） |
| `p` | 包信息（p） |
| `resolver` | Intent 解析（resolver） |
| `intent-options` | Intent 选项（intent-options） |

---

### 9. `window`

**命令格式：**
```
dumpsys window [policy|animator|displays|tokens|windows] [<display>]
```

**参数（全部独立列出，共 3 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 子命令 | `select` | `subcmd` | 见下方选项表 |
| 2 | 显示 ID | `text` | `display` | 显示编号，如 `0`（默认） |
| 3 | 额外参数 | `text` | `extra` | 兜底 |

**select 选项：**

| value | label |
|---|---|
| `（空）` | 默认全部 |
| `policy` | 窗口策略（policy） |
| `animator` | 窗口动画（animator） |
| `displays` | 显示信息（displays） |
| `tokens` | Token 列表（tokens） |
| `windows` | 窗口列表（windows） |

---

### 10. `display`

**命令格式：**
```
dumpsys display [<display-id>] [--physical]
```

**参数（全部独立列出，共 3 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 显示 ID | `text` | `display` | 显示编号，如 `0`（默认） |
| 2 | 物理信息 | `flag` | `physical` | `--physical` |
| 3 | 额外参数 | `text` | `extra` | 兜底 |

---

### 11. `notification`

**命令格式：**
```
dumpsys notification [list|history] [<pkg>]
```

**参数（全部独立列出，共 3 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 子命令 | `select` | `subcmd` | 见下方选项表 |
| 2 | 包名（可选） | `package-picker` | `package` | 按包名过滤通知 |
| 3 | 额外参数 | `text` | `extra` | 兜底 |

**select 选项：**

| value | label |
|---|---|
| `（空）` | 默认全部 |
| `list` | 通知列表（list） |
| `history` | 历史记录（history） |

---

### 12. 纯 text 兜底模块

**alarm / cpuinfo / input / location / power / wifi**

这些模块在标准 Android 上通常只有 `--help` 或不带参数，仅含一个 text extra：

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 额外参数 | `text` | `extra` | 兜底 |

---

### 13. `usb`

**命令格式：**
```
dumpsys usb [--dump] [--help]
```

**参数（全部独立列出，共 3 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | Dump 详情 | `flag` | `dump` | `--dump` |
| 2 | 帮助 | `flag` | `help` | `--help` |
| 3 | 额外参数 | `text` | `extra` | 兜底 |

---

### 14. `SurfaceFlinger`

**命令格式：**
```
dumpsys SurfaceFlinger [--help] [--list] [--latency <N>] [--display-id <ID>]
```

**参数（全部独立列出，共 4 个）：**

| # | 参数 | 类型 | key | 说明 |
|---|---|---|---|---|
| 1 | 子命令 | `select` | `subcmd` | 见下方选项表 |
| 2 | Latency 帧号 | `text` | `latency` | `--latency <N>` |
| 3 | Display ID | `text` | `display` | `--display-id <ID>` |
| 4 | 额外参数 | `text` | `extra` | 兜底 |

**select 选项：**

| value | label |
|---|---|
| `（空）` | 默认全部 |
| `--help` | 帮助（--help） |
| `--list` | 图层列表（--list） |

---

## 构建规则

`buildDumpsysCommand` 按 params 数组顺序遍历：

```
for each param:
  if kind == "flag":             → push flagValue
  if kind == "select":           → push value（空值跳过）
  if kind == "package-picker":   → push value（有 prefix 则先推 prefix）
  if kind == "text" && key != "extra": → push value（有 prefix 则先推 prefix）
  if kind == "text" && key == "extra": → 始终推到末尾
```

命令格式：`dumpsys <moduleName> [<select>] [<prefix> <text>] [<flags>...] [<extra>]`

> ⚠️ flags 在 extra 之前插入，因为 `dumpsys` 对 flag 位置不敏感。
> `pkgArg` / `intentArg` 这类条件参数目前总是可见；如需条件隐藏，需要增加 `dependsOn?: { param: string; values: string[] }` 支持（未来改进）。
