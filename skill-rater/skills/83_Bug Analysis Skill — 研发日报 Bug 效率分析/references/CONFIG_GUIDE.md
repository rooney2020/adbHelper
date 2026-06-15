# config.json 完整字段说明

工程根目录复制 `config.json.example` 为 `config.json`，按照下表填写。

## 完整模板

```json
{
  "project": {
    "name": "YourProject",
    "display_name": "YourProject Bug 效率分析"
  },
  "jira": {
    "base_url": "https://your-jira-domain.com",
    "username": "your.name",
    "password": "your_password",
    "filter_id": "12345",
    "resolved_status": ["Resolved", "Done"],
    "date_range_days": 180,
    "overview_jql": "type = Bug AND ...",
    "overview_fields": {
      "vf_department": "customfield_XXXXX",
      "severity_field_1": "customfield_XXXXX"
    }
  },
  "feishu": {
    "app_token": "YOUR_BITABLE_APP_TOKEN",
    "table_id": "tblYOUR_TABLE_ID",
    "project_filter": "your_project_name",
    "app_id": "cli_your_app_id",
    "app_secret": "your_app_secret",
    "refresh_token": "ur-your_refresh_token"
  },
  "customer_jira": {
    "base_url": "",
    "jql": "issuetype = Bug AND labels = YOUR_LABEL",
    "label": "YOUR_LABEL",
    "include_projects": [],
    "exclude_projects": [],
    "custom_fields": {
      "severity": "customfield_XXXXX"
    }
  },
  "exclusions": {
    "email_prefixes": ["excluded.person1", "excluded.person2"],
    "analysis_excluded_emails": ["someone@company.com"],
    "name_keywords": ["ContractorGroupName"]
  },
  "web": { "port": 8888 },
  "output": { "dir": "C:\\your\\report\\output\\path" }
}
```

## 字段详解

| 字段 | 必填 | 说明 | 获取方式 |
|------|------|------|---------|
| `project.name` | ✅ | 项目品牌名（Web 页面标题、导航栏） | 自定义 |
| `project.display_name` | ✅ | 项目完整显示名 | 自定义 |
| `jira.base_url` | ✅ | Jira 服务器地址 | 浏览器地址栏取域名（含 https://） |
| `jira.username` | ✅ | Jira 登录用户名 | 通常为邮箱前缀 |
| `jira.password` | ⭕ | Jira 密码 | 留空则运行时手动粘贴 Cookie |
| `jira.filter_id` | ✅ | 筛选器 ID | Jira → Issues → Search → 保存筛选器 → URL 中 `filter=` 后的数字 |
| `jira.resolved_status` | ✅ | "已解决"状态名列表 | 根据 Jira 工作流确认。**不要加 `Closed`**，代码已硬排除 |
| `jira.date_range_days` | ⭕ | 默认拉取天数 | 默认 180 |
| `jira.overview_jql` | ✅ | Bug 分布看板的 JQL | 按需调整排除条件（经办人、部门、状态等） |
| `jira.overview_fields.vf_department` | ✅ | 部门字段 ID | Jira 管理 → 自定义字段 → 查看字段 ID |
| `jira.overview_fields.severity_field_1` | ✅ | 严重等级字段 ID | 同上 |
| `feishu.app_token` | ✅ | 多维表格 Token | URL 中 `/base/` 后的字符串 |
| `feishu.table_id` | ✅ | 表格 ID | URL 中 `?table=` 后的字符串 |
| `feishu.project_filter` | ✅ | 项目名筛选关键字 | 多维表格 `Project` 字段中使用的值 |
| `feishu.app_id` | ✅ | 飞书应用 App ID | `~/.cursor/mcp.json` 或 `feishu_data_sync/config.py` |
| `feishu.app_secret` | ✅ | 飞书应用 App Secret | 同上 |
| `feishu.refresh_token` | ✅ | 用户刷新令牌 | `feishu_data_sync/config.py`（运行 `get_uat.js` 后自动更新） |
| `customer_jira.base_url` | ⭕ | 客户 Jira 地址 | 留空表示不启用客户侧功能 |
| `customer_jira.jql` | ⭕ | 客户侧 Bug 的 JQL 基础查询 | 通常按 label 筛选；`include_projects` 优先级更高 |
| `customer_jira.label` | ⭕ | 标签变更事件追踪的目标标签 | 客户侧 Bug 使用的标签名 |
| `customer_jira.include_projects` | ⭕ | **白名单**：只拉取这些项目 Key 的 Bug | 填 Jira 项目 Key（如 `["PROJ", "INFRA"]`）；空数组表示不限项目 |
| `customer_jira.exclude_projects` | ⭕ | **黑名单**：排除这些项目 Key 的 Bug | 当 `include_projects` 为空时生效；不能与白名单同时使用 |
| `customer_jira.custom_fields` | ⭕ | 客户侧自定义字段映射 | 同 `overview_fields` |
| `exclusions.email_prefixes` | ⭕ | 全局排除的邮箱前缀 | 邮箱 `@` 前的部分，小写 |
| `exclusions.analysis_excluded_emails` | ⭕ | Bug 分析维度专项排除 | 完整邮箱地址 |
| `exclusions.name_keywords` | ⭕ | 排除的名称关键字 | Jira 显示名中包含该关键字即排除 |
| `web.port` | ⭕ | Web 仪表盘监听端口 | 默认 8888 |
| `output.dir` | ✅ | 报告输出目录 | 本地任意路径（Windows 使用双反斜杠） |

## 常见配置场景

### 场景 1：仅启用内部 Jira（不启用客户侧）

将 `customer_jira.base_url` 设为空字符串 `""` 即可。其他客户侧字段无须填。

### 场景 2：客户侧 Jira 使用 SSO/2FA（无法用密码）

不要填 `customer_jira` 的 `username/password`；改为：
1. 浏览器登录客户 Jira
2. F12 → Network → 复制 Cookie 值
3. 粘贴到工程根目录的 `customer_cookie.txt`

`shared_customer_auth.py` 会优先使用 Cookie 文件认证。

### 场景 3：本地账号触发了 CAPTCHA

将 `jira.password` 留空，通过浏览器登录后将 Cookie 粘贴到 `cookie.txt`。

### 场景 4：自定义排除人员

修改 `exclusions`：
```json
"exclusions": {
  "email_prefixes": ["zhangsan", "lisi"],
  "analysis_excluded_emails": ["wangwu@company.com"],
  "name_keywords": ["VF-Contractors"]
}
```

任一规则命中即被排除。`analysis_excluded_emails` 仅在 Bug 分析维度生效。

### 场景 5：按项目白名单/黑名单过滤客户侧 Bug

客户侧 Jira 往往有大量项目，有时只需统计特定项目（白名单），或排除噪音项目（黑名单）。

**白名单**（只统计指定项目）：
```json
"customer_jira": {
  "include_projects": ["PROJ_A", "PROJ_B"]
}
```

**黑名单**（排除指定项目）：
```json
"customer_jira": {
  "exclude_projects": ["TEST", "SANDBOX"]
}
```

优先级规则：
1. `include_projects` **非空** → 只拉白名单项目，忽略 `exclude_projects`
2. `include_projects` **为空** + `exclude_projects` **非空** → 拉全量后排除黑名单项目
3. 两者均为空 → 全量拉取（由 `jql` 字段决定范围）

修改后**保存配置**时，系统会自动检测这两个字段是否变化，若有变化则立即触发后台数据刷新（等同于手动点击「更新 Jira」），无需手动操作。

## 测试认证

修改任意 Jira / 飞书凭据后，无需先保存，可直接在 `/config` 页面对应卡片右上角点击「🔌 测试连接」：

- **内部 Jira / 客户侧 Jira**：调用 `GET {base_url}/rest/api/2/myself`，返回 `displayName` 即通过。
- **飞书**：先用 `app_id + app_secret` 换 `app_access_token`；若同时填了 `refresh_token` 会再验证一次 OIDC 刷新。

底层 API：`POST /api/config/test-connection`，请求体 `{service: 'jira'|'feishu'|'customer_jira', config: {...}}`。表单字段缺失时会回退到磁盘 `config.json` 现有值，便于只修改某一项后单独验证。

## 获取 Jira 自定义字段 ID

1. Jira 管理员界面 → Custom Fields
2. 点击字段名进入详情
3. URL 中的 `customFieldId=12345` 即为 ID
4. 配置中填 `customfield_12345`
