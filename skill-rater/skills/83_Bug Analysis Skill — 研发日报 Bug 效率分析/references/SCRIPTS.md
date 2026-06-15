# 脚本速查表

所有脚本均在工程根目录 `c:\Users\tsdl\bug_analysis_project` 下执行，使用 `.\venv\Scripts\python.exe`。

## 数据拉取脚本

| 脚本 | 作用 | 输入 | 输出 | 增量支持 |
|------|------|------|------|---------|
| `fetch_feishu.py` | 飞书 Bitable 研发日报抓取 | 飞书 API | `data_page*.json` | 30 分钟新鲜度跳过；`--full` 强制全量 |
| `fetch_jira.py` | Jira 效率事件抓取（resolved/assignee/comments） | Jira REST | `jira_resolved.json` | 增量基于 `fetched_at - 2 天`；`--full` 强制全量 |
| `fetch_jira_overview.py` | Jira 全量 Bug 快照（用于分布看板） | Jira REST | `bugs_data.json` | 全量 |
| `fetch_customer_bugs.py` | 客户侧 Bug 快照 | 客户 Jira REST | `customer_bugs_data.json` | 全量 |
| `fetch_customer_events.py` | 客户侧三类事件抓取 | 客户 Jira REST | `customer_jira_resolved.json` | 增量 |
| `fetch_customer_label_events.py` | 客户侧标签变更事件 | 客户 Jira REST | `customer_label_events.json` | 增量 |

## 看板与仪表盘生成

| 脚本 | 作用 | 输入 | 输出 |
|------|------|------|------|
| `dashboard_overview.py` | 生成 Bug 分布看板（Plotly 静态 HTML） | `bugs_data.json` | `templates/dashboard_overview.html` |
| `dashboard_customer.py` | 生成客户侧 Bug 看板 | `customer_bugs_data.json` 等 | `templates/dashboard_customer.html` |
| `web_server.py` | Flask 仪表盘服务（端口 8888） | 上述全部 JSON / HTML | HTTP 服务，三个页面 |

## 共享/辅助模块（不直接执行）

| 模块 | 作用 |
|------|------|
| `shared_config.py` | 配置加载、排除规则、TYPE_MAP、FIX_TYPES/AN_TYPES、日志 |
| `shared_feishu.py` | 飞书字段解析、DataFrame 构建 |
| `shared_jira.py` | Jira 事件加载与合并、日期对齐 |
| `shared_analyzer.py` | 三条件分析人员识别 |
| `shared_customer_auth.py` | 客户侧 Jira 三重回退认证（Cookie → Bearer → Basic）；失败抛 `AuthError`，退出码 77 |
| `safe_io.py` | 原子写入（先写 .tmp 再重命名） |
| `dashboard_i18n.py` | 看板中英文切换 CSS/JS |

## 入口脚本

| 文件 | 作用 |
|------|------|
| `run.bat` | 一键拉所有数据 + 生成两个看板 + 启动 Web 仪表盘 |
| `web.bat` | 一键启动 Web 仪表盘（自动 kill 占用端口） |
| `package.bat` | （可选）打包发布 |
| `start_openclaw.bat` | （可选）OpenClaw 启动器 |

## 推荐执行顺序

```
fetch_feishu.py
fetch_jira.py            ─┐
fetch_jira_overview.py    ├─ 可并行
fetch_customer_bugs.py    │
fetch_customer_events.py  │
fetch_customer_label_events.py ─┘

→ dashboard_overview.py
→ dashboard_customer.py
→ web_server.py（持续运行）
```

## Web 仪表盘 API

| 路由 | 方法 | 用途 |
|------|------|------|
| `/` | GET | Bug 效率分析（ECharts） |
| `/bug-overview` | GET | Bug 分布看板（Plotly） |
| `/customer-bugs` | GET | 客户侧 Bug 看板（Plotly） |
| `/config` | GET | 配置中心（在线编辑 `config.json`，保存前自动备份） |
| `/api/data` | GET | 仪表盘 JSON 数据（缓存） |
| `/api/refresh` | GET | 清缓存（仅重算，不重新抓取数据） |
| `/api/fetch?source=feishu\|jira\|all` | POST | 触发后台抓取 |
| `/api/fetch-status` | GET | 查询抓取进度（step / progress / ok / error） |
| `/api/config` | GET/POST | 读取/保存 config.json；POST 保存时若客户侧项目过滤配置变化则自动触发 Jira 数据刷新 |
| `/api/config/test-connection` | POST | 测试 Jira / 飞书 / 客户侧 Jira 认证连通性 |
| `/api/export-customer-bugs` | GET | 导出客户侧 Bug 为 Excel（分析/修改/未关闭 三个 Sheet） |

## 配置变更自动刷新机制

`POST /api/config` 保存配置时会比较新旧配置中以下三个字段：

```
customer_jira.include_projects
customer_jira.exclude_projects
customer_jira.jql
```

若有任何变化且无后台抓取任务正在运行，则自动启动后台线程执行完整 Jira 数据刷新链路（等同于手动点击「更新 Jira」按钮）。响应中 `auto_refresh: true` 表示已触发。
