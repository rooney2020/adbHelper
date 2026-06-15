---
name: bug-analysis
description: 研发日报 Bug 效率分析工具。从飞书多维表格（研发日报）和 Jira 抓取数据，分析 Bug 解决和 Bug 分析两个维度的工时投入与效率，输出 Web 仪表盘（含 Bug 效率分析、Bug 分布看板、客户侧 Bug 三个页面）。当用户要求"启动 Bug 仪表盘""分析 Bug 效率""更新 Jira/飞书数据""迁移 Bug 分析工具到新项目"等任务时使用此 Skill。
license: Internal
---

# Bug Analysis Skill — 研发日报 Bug 效率分析

## 概述

本 Skill 把 `bug_analysis_project` 工程封装为可复用能力。它从两个数据源抓取数据并生成报表与仪表盘：

- **飞书多维表格**（研发日报）—— 通过 Bitable Search API 抓取工时记录
- **Jira**（含内部 Jira 与客户侧 Jira）—— 通过 REST API 抓取 Bug、changelog、评论

输出：

Web 仪表盘（Flask，默认端口 8888，三个页面，支持中英文切换）：
- `/`            —— Bug 效率分析（ECharts）
- `/bug-overview` —— Bug 分布看板（Plotly）
- `/customer-bugs` —— 客户侧 Bug 看板（Plotly）
- `/config` —— 配置中心（在线编辑 `config.json`，便于迁移到新项目）

## 何时使用此 Skill

- 用户请求"启动仪表盘""开启 web 看板""打开 Bug Dashboard"
- 用户请求"更新飞书数据""更新 Jira 数据""刷新数据"
- 用户请求"把 Bug 分析工具迁移到新项目""适配到新的 Jira/飞书"
- 用户询问"Bug 效率怎么算""三条件分析人员是什么""资料流程"
- 用户请求"修改排除人员名单""修改端口""修改输出目录"

## 工程位置

工程根目录：`c:\Users\tsdl\bug_analysis_project`（即本 Skill 所在仓库根）。

所有脚本在该根目录执行，使用 `.\venv\Scripts\python.exe` 调用虚拟环境内的 Python。

## 核心工作流

### 工作流 A：首次环境搭建

1. 确认 Python 3.10+、Node.js 已安装
2. 在工程目录执行：
   ```powershell
   py -m venv venv
   .\venv\Scripts\python.exe -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
   ```
3. 复制 `config.json.example` 为 `config.json` 并按 [references/CONFIG_GUIDE.md](references/CONFIG_GUIDE.md) 填写

### 工作流 B：一键拉取数据 + 生成看板 + 启动 Web

直接运行：
```powershell
.\run.bat
```
或调用 [scripts/run_full_pipeline.ps1](scripts/run_full_pipeline.ps1)。

也可以手动按顺序执行（详见 [references/SCRIPTS.md](references/SCRIPTS.md)）：
```powershell
.\venv\Scripts\python.exe fetch_feishu.py
.\venv\Scripts\python.exe fetch_jira.py
.\venv\Scripts\python.exe fetch_jira_overview.py
.\venv\Scripts\python.exe fetch_customer_bugs.py
.\venv\Scripts\python.exe fetch_customer_events.py
.\venv\Scripts\python.exe fetch_customer_label_events.py
.\venv\Scripts\python.exe dashboard_overview.py
.\venv\Scripts\python.exe dashboard_customer.py
.\venv\Scripts\python.exe web_server.py
```

### 工作流 C：启动 Web 仪表盘

```powershell
.\web.bat
```
或：
```powershell
.\venv\Scripts\python.exe web_server.py
```
浏览器打开 `http://localhost:8888`（端口可在 `config.json → web.port` 修改）。

### 工作流 D：仅刷新数据后重新生成看板

仪表盘运行时，直接在页面上点击"更新飞书"或"更新Jira"按钮即可；亦可单独执行对应 `fetch_*.py` 脚本。

### 工作流 E：迁移到新项目

参考 [references/MIGRATION.md](references/MIGRATION.md)。90% 的适配工作只需修改 `config.json`。

## 关键计算逻辑（必读）

**Bug 解决维度**：
- 飞书 Bug 解决工时 = 产出类型 ∈ {`Bug解决(修正)`, `Bug验证`} 的工时
- Jira 解决 Bug 数 = `resolved_events` 中每次「非Resolved → Resolved」状态变更
- 关联方式：邮箱

**Bug 分析维度（三条件识别）**：

```
对每个 (person_email, bug_key)：
  ① 该人在 assignee_events 中变更过该 Bug 的 Assignee
  ② 该人在 comment_events 中评论过该 Bug
  ③ 该人未将该 Bug 切换到 Resolved
  三者同时满足 → 判定为该 Bug 的"分析人员"
```

- 飞书 Bug 分析工时 = 产出类型 = `Bug分析(解析)` 的工时
- Jira 分析 Bug 数 = 满足三条件的 (person, bug) 对中唯一 bug 数

详细说明：[references/ANALYSIS_LOGIC.md](references/ANALYSIS_LOGIC.md)。

## 共享模块清单

- `shared_config.py` —— 配置加载、排除规则、`TYPE_MAP`、`FIX_TYPES`/`AN_TYPES`、日志
- `shared_feishu.py` —— 飞书字段解析、DataFrame 构建
- `shared_jira.py` —— Jira 事件加载与合并（内部 + 客户侧）、日期对齐
- `shared_analyzer.py` —— 三条件分析人员识别
- `shared_customer_auth.py` —— 客户侧 Jira 三重回退认证
- `safe_io.py` —— 原子写入工具
- `dashboard_i18n.py` —— 看板中英文切换

## 配置文件 config.json 关键字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `project.name` / `display_name` | ✅ | 项目品牌名 |
| `jira.base_url` / `username` / `password` / `filter_id` | ✅ | 内部 Jira 访问 |
| `jira.resolved_status` | ✅ | 已解决状态名列表，**不要包含 `Closed`** |
| `jira.overview_jql` | ✅ | Bug 分布看板 JQL |
| `jira.overview_fields` | ✅ | 自定义字段映射 |
| `feishu.app_token` / `table_id` / `project_filter` | ✅ | 飞书 Bitable |
| `feishu.app_id` / `app_secret` / `refresh_token` | ✅ | 飞书认证 |
| `customer_jira.base_url` | ⭕ | 留空则不启用客户侧 |
| `customer_jira.jql` / `label` / `custom_fields` | ⭕ | 客户侧基础配置 |
| `customer_jira.include_projects` | ⭕ | 白名单：只拉指定项目 Key（空数组=不限）；保存配置时有变化会自动触发 Jira 数据刷新 |
| `customer_jira.exclude_projects` | ⭕ | 黑名单：排除指定项目 Key；`include_projects` 非空时此字段被忽略 |
| `exclusions.email_prefixes` / `analysis_excluded_emails` / `name_keywords` | ⭕ | 排除人员 |
| `web.port` | ⭕ | 默认 8888 |
| `output.dir` | ⭕ | （预留）输出目录，当前仅供未来抩展使用 |

完整字段说明 + 各字段获取方式：[references/CONFIG_GUIDE.md](references/CONFIG_GUIDE.md)

## 常见任务速查

| 用户需求 | 操作 |
|---------|------|
| 全量重抓飞书 | `python fetch_feishu.py --full` |
| 全量重抓 Jira | `python fetch_jira.py --full` |
| 刷新看板 HTML（数据已有） | `python dashboard_overview.py` / `python dashboard_customer.py` |
| 仅启动仪表盘 | `python web_server.py` 或 `web.bat` |
| 修改输出目录 | 改 `config.json → output.dir` |
| 修改端口 | 改 `config.json → web.port` |
| 添加排除人员 | 改 `config.json → exclusions.email_prefixes` 等 |
| 看 Bug 分布趋势 | 浏览器开 `/bug-overview` |
| 看客户侧 Bug | 浏览器开 `/customer-bugs` |
| 在线编辑配置 | 浏览器开 `/config`，修改后点击「保存」（自动备份原文件） |
| 测试 Jira/飞书认证 | 浏览器开 `/config`，在「内部 Jira / 飞书 / 客户侧 Jira」卡片右上角点击「🔌 测试连接」（无需先保存） |

## 故障排查

完整 FAQ：[references/TROUBLESHOOTING.md](references/TROUBLESHOOTING.md)

最常见的问题：
- **飞书 0 条** → UAT 过期，运行 `fetch_feishu.py`，会自动尝试 API 刷新
- **客户侧"认证失败"对话框** → 浏览器登录客户 Jira → 复制 Cookie 到 `customer_cookie.txt`
- **`ModuleNotFoundError: pandas`** → 用了系统 Python，应使用 `.\venv\Scripts\python.exe`
- **端口 8888 被占** → `web.bat` 会自动 kill；或修改 `config.json → web.port`

## 参考文档（references/）

- [SCRIPTS.md](references/SCRIPTS.md) —— 所有脚本的输入/输出/作用速查
- [CONFIG_GUIDE.md](references/CONFIG_GUIDE.md) —— config.json 完整字段说明
- [ANALYSIS_LOGIC.md](references/ANALYSIS_LOGIC.md) —— Bug 解决/分析维度的完整算法
- [MIGRATION.md](references/MIGRATION.md) —— 迁移到新项目的步骤
- [TROUBLESHOOTING.md](references/TROUBLESHOOTING.md) —— FAQ 与排错
- [DATA_FLOW.md](references/DATA_FLOW.md) —— 数据流图（飞书/Jira/客户Jira → JSON → Web 仪表盘 / HTML 看板）

## 辅助脚本（scripts/）

- [run_full_pipeline.ps1](scripts/run_full_pipeline.ps1) —— PowerShell 一键拉数据 + 生成报告 + 启动看板
- [check_env.ps1](scripts/check_env.ps1) —— 环境检查（Python/Node/venv/config.json）
- [setup_env.ps1](scripts/setup_env.ps1) —— 一键创建 venv 并安装依赖
