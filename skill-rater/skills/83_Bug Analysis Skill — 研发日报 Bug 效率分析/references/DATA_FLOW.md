# 数据流图

## 整体架构

```
┌──────────────────┐                    ┌──────────────────────────────────────────┐
│  飞书多维表格      │                    │              Jira                        │
│  (研发日报)        │                    │           (Bug Tracker)                  │
└────────┬─────────┘                    └────────┬──────────┬──────────┬────────────┘
         │ fetch_feishu.py                       │          │          │
         │ Bitable search API                    │          │          │ fetch_customer_bugs.py
         ▼                                       │          │          │ JQL: customer_jira.jql
   data_page*.json                               │          │          ▼
   (飞书记录，分页存储)                            │          │   customer_bugs_data.json
         │                                       │          │   (客户侧Bug快照)
         │                    fetch_jira.py       │          │          │
         │                    REST /search        │          │          ├── dashboard_customer.py
         │                    + /changelog        │          │          │       ↓
         │                                       ▼          │          │   dashboard_customer.html
         │                              jira_resolved.json  │          │
         │                              (三类事件)           │          │ fetch_customer_events.py
         │                                       │          │          │ REST /search + /changelog
         │                                       │          │          ▼
         │                                       │          │   customer_jira_resolved.json
         │                                       │          │   (客户侧三类事件)
         │                                       │          │
         │                                       │  fetch_jira_overview.py
         │                                       │          │ REST /search (基础字段)
         │                                       │          ▼
         │                                       │    bugs_data.json
         │                                       │    (全量Bug快照)
         │                                       │          │
         │                                       │          │ dashboard_overview.py
         │                                       │          ▼
         │                                       │   dashboard_overview.html
         │                                       │   (Bug分布看板)
         └────────────────┬──────────────────────┘          │
                          │            ↑                    │
                          │                                 │
                          │ web_server.py                   │
                          │ 合并内部+客户事件←───────────┘
                          │
                          │ jira_resolved.json + customer_jira_resolved.json
              ┌───────────┴──────────────────────────────┐
              │   Web 效率仪表盘 (:8888/)                  │
              │   Web Bug分布看板 (:8888/bug-overview)      │
              │   Web 客户侧Bug (:8888/customer-bugs)      │
              └────────────────────────────────────────────┘
```

## 文件清单

### 输入（数据源）

| 数据源 | 协议 | 认证 |
|-------|------|------|
| 飞书 Bitable | REST API | UAT（OAuth refresh token） |
| 内部 Jira | REST API | Basic Auth / Cookie |
| 客户 Jira | REST API | Cookie / Bearer / Basic（三重回退） |

### 中间产物（JSON 缓存，根目录）

| 文件 | 内容 | 大小级别 |
|------|------|---------|
| `data_page*.json` | 飞书原始记录（分页） | ~1-10 MB / 页 |
| `jira_resolved.json` | 内部 Jira 三类事件 | ~5-50 MB |
| `bugs_data.json` | Jira 全量 Bug 快照 | ~5-30 MB |
| `customer_bugs_data.json` | 客户 Jira 全量 Bug | ~1-10 MB |
| `customer_jira_resolved.json` | 客户 Jira 三类事件 | ~1-20 MB |
| `customer_label_events.json` | 客户标签变更事件 | ~1 MB |
| `pn_email_mapping.json` | VFVN-PN 邮箱映射 | <1 MB |

### 输出（最终交付）

| 文件 | 类型 | 位置 |
|------|------|------|
| `dashboard.html` | HTML | `templates/`（手动编辑） |
| `dashboard_overview.html` | HTML | `templates/`（自动生成） |
| `dashboard_customer.html` | HTML | `templates/`（自动生成） |

## 数据同步触发链

Web 仪表盘"更新 Jira"按钮触发 7 个脚本（按顺序）：

```
fetch_jira.py
  → fetch_jira_overview.py
  → dashboard_overview.py
  ↓
fetch_customer_bugs.py
  → fetch_customer_events.py    ┐
  → fetch_customer_label_events.py ├ 3 并发执行
  → dashboard_customer.py        ┘
```

各脚本均为增量获取（`fetch_customer_bugs.py` 除外，始终全量）。任一脚本失败不会阻断其他脚本，确保独立性。

## 内部 vs 客户侧的处理差异

| 维度 | 内部 Jira | 客户侧 Jira |
|------|----------|------------|
| 数据范围 | 由 `filter_id` 决定 | 由 `customer_jira.jql` + `include_projects` / `exclude_projects` 共同决定 |
| 增量机制 | `updated >= fetched_at-2d` | `updated >= fetched_at-2d` |
| 创建定义 | Bug 创建时间 | `customer_jira.label` 标签**添加**事件 |
| 解决定义 | 状态切换到 `resolved_status` | 标签**删除**（分析）+ 状态 Resolved（实际修改） |
| 用于效率仪表盘 | ✅ | ✅（合并到统一事件流） |
| 用于客户侧看板 | ❌ | ✅ |

## 客户侧项目过滤逻辑

三个客户侧抓取脚本（`fetch_customer_bugs.py` / `fetch_customer_events.py` / `fetch_customer_label_events.py`）均从 `config.json` 读取以下字段动态构建 JQL 的 `project` 过滤子句：

```
include_projects 非空  →  AND project in (P1, P2, ...)
include_projects 为空 + exclude_projects 非空  →  AND project not in (P1, P2, ...)
两者均为空  →  不追加项目过滤（全量，由基础 jql 决定范围）
```

## 配置变更触发刷新链路

```
用户在 /config 页面修改 include_projects / exclude_projects / jql
  → POST /api/config 保存
    → 比较新旧配置签名（tuple of sorted lists + jql）
    → 签名不一致且无后台任务运行中
      → threading.Thread → _run_fetch_bg('jira')
          fetch_jira.py
            → fetch_jira_overview.py
            → dashboard_overview.py
            → fetch_customer_bugs.py    ─┐
            → fetch_customer_events.py   ├ ThreadPoolExecutor 并发
            → fetch_customer_label_events.py ─┘
            → dashboard_customer.py
            → _get_cached()（刷新 /api/data 缓存）
  → 响应 {ok: true, auto_refresh: true, msg: "已自动触发数据刷新..."}
```

详细差异：[../../../ARCHITECTURE.md](../../../ARCHITECTURE.md)（工程根目录）。

## 缓存策略

| 层级 | TTL | 说明 |
|------|-----|------|
| Web 服务端缓存（`/api/data`） | 86400s (1天) | 仅同步完成后刷新 |
| 静默页面刷新 | 60s | 后台自动重读缓存 |
| 自动同步倒计时 | 30 分钟 | 触发完整数据拉取 |
| 飞书新鲜度检查 | 30 分钟 + 数据覆盖近 3 天 | 双条件满足才跳过 |
| Jira 增量基准 | `fetched_at - 2 天` | 安全边际 |
