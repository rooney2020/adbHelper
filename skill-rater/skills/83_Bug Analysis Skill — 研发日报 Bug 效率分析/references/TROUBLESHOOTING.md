# 故障排查 FAQ

| 现象 | 原因 | 解决方法 |
|------|------|---------|
| 飞书数据 0 条 | UAT 过期 | 运行 `fetch_feishu.py`，脚本会自动尝试 API 刷新；若仍失败按提示完成浏览器 OAuth |
| 上周效率数据全部为 0 或空 | 飞书数据未覆盖上周日期范围 | 运行 `fetch_feishu.py --full` 强制全量拉取 |
| 只有空报告，无 Jira 数据 | `jira_resolved.json` 不存在 | 先运行 `fetch_jira.py` |
| 产出类型全为原始值（未映射） | `TYPE_MAP` 的 key 与实际值不匹配 | 运行 [MIGRATION.md](MIGRATION.md) 第四步的诊断代码 |
| Bug ID 统计数量极少 | 关联 ID 字段名不同 | 检查 `shared_feishu.py → get_record_bug_ids` 中的字段名 |
| `ModuleNotFoundError: pandas` | 用了系统 Python 而非 venv | 使用 `.\venv\Scripts\python.exe` |
| `node` 命令未找到 | Node.js 未安装 | 安装 Node.js 后重试 |
| Jira 连接失败 | base_url 错误或网络问题 | 检查 `config.json` 中 `jira.base_url`（含 https://） |
| 内部 Jira 认证失败 (401/403) | 密码错误或 CAPTCHA 触发 | 检查 `jira.username/password`；或浏览器 Cookie 粘贴到 `cookie.txt` |
| Web 仪表盘启动失败 | 端口 8888 被占用 | `web.bat` 会自动 kill；或修改 `config.json → web.port` |
| 客户侧数据未更新 + "Cookie 已过期" | `customer_cookie.txt` 过期 | 浏览器登录客户 Jira → F12 → Network → 复制 Cookie → 粘贴到 `customer_cookie.txt` |
| Web 仪表盘弹出"认证失败"对话框 | 客户侧 Cookie 过期 | 按对话框提示更新 Cookie；脚本会自动打开浏览器登录页 |
| 客户侧数据获取超时 | 网络不稳定或数据量大 | 脚本自动重试 5 次；如持续失败检查网络 |
| "数据更新完成（客户侧认证失败）" | 内部 OK 但客户侧失败 | 内部数据已更新；按提示更新客户 Cookie 后重新点「更新Jira」 |
| 客户侧 Bug 数据异常（数量为 0 或明显偏少） | `include_projects` 填了不存在的项目 Key，或 Key 大小写错误 | 检查 `config.json → customer_jira.include_projects`；将其改为 `[]` 表示不限项目，或用 `/config` 页面查看当前值；清空后点保存系统会自动重新抓取 |
| 客户侧 Bug 数据数量异常增多 | `exclude_projects` 未正确生效，或 `include_projects` 被清空导致全量拉取 | 确认两个字段的优先级：`include_projects` 非空时 `exclude_projects` 被忽略；仅 `exclude_projects` 非空时才生效 |
| 修改 include/exclude_projects 后数据未更新 | 保存配置后后台刷新尚未完成 | 在 `/config` 页面保存后会看到"已自动触发数据刷新"提示；标签事件全量抓取约需 9 分钟，请耐心等待进度完成后再刷新页面 |
| 数据文件损坏（空/截断） | 写入中途脚本崩溃 | 已通过 `safe_io.py` 原子写入防止；如仍出现请删除损坏文件并重新获取 |
| 预计清零日期未显示 | 净消解速率 ≤ 0 | 需提高解决速率或减少新增；当净速率 > 0 即会显示 |
| 页面显示"数据更新完成（⚠...）" | 部分数据源获取异常 | 页面会显示具体哪些环节失败；已成功的数据正常展示，失败部分使用缓存 |
| 仪表盘月度图缺月份 | Jira 事件被裁剪 | 飞书工时起始日决定有效周期；如需扩展，确保飞书有更早的工时记录 |
| 排除人员未生效 | 名称中可能有中英文/大小写差异 | `name_keywords` 区分大小写；`email_prefixes` 自动转小写 |

## 常用诊断命令

### 检查飞书数据范围

```powershell
.\venv\Scripts\python.exe -c "import json,glob; from datetime import datetime; ds=[]; [ds.append(rec['fields'].get('投入日期/Date',0)) for fp in glob.glob('data_page*.json') for rec in json.load(open(fp,encoding='utf-8'))['items'] if rec['fields'].get('投入日期/Date')]; print('range:',datetime.fromtimestamp(min(ds)/1000),'~',datetime.fromtimestamp(max(ds)/1000),'count:',len(ds))"
```

### 检查 Jira 事件数量

```powershell
.\venv\Scripts\python.exe -c "import json; d=json.load(open('jira_resolved.json',encoding='utf-8')); print('resolved:',len(d.get('resolved_events',[])),'assignee:',len(d.get('assignee_events',[])),'comment:',len(d.get('comment_events',[])))"
```

### 检查端口占用

```powershell
netstat -ano | findstr :8888
```

### 强制清除缓存

启动 `web_server.py` 后访问 `http://localhost:8888/api/refresh`。

## 日志位置

- `web_server.log` —— Web 仪表盘运行日志
- `startup.log` / `startup_err.log` —— 启动日志
- 各 `fetch_*.py` 脚本通过 logging 输出到控制台
