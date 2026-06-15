# 迁移到新项目

90% 的迁移工作只需修改 `config.json`。

## 第一步：复制工程

```powershell
# 假设新项目放在 D:\new_bug_analysis
Copy-Item -Recurse c:\Users\tsdl\bug_analysis_project D:\new_bug_analysis
cd D:\new_bug_analysis

# 清理运行时数据
Remove-Item data_page*.json, jira_resolved.json, customer_*.json, bugs_data.json -ErrorAction SilentlyContinue
Remove-Item -Recurse venv -ErrorAction SilentlyContinue
```

## 第二步：环境搭建

```powershell
py -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

## 第三步：修改 config.json（核心）

参考 [CONFIG_GUIDE.md](CONFIG_GUIDE.md)。最关键的字段：

```json
{
  "project": { "name": "新项目名", "display_name": "新项目 Bug 效率分析" },
  "jira": {
    "base_url": "https://new-jira.com",
    "username": "...", "password": "...",
    "filter_id": "新筛选器ID",
    "resolved_status": ["Resolved", "Done"],
    "overview_jql": "type = Bug AND ...",
    "overview_fields": {
      "vf_department": "customfield_XXXXX",
      "severity_field_1": "customfield_XXXXX"
    }
  },
  "feishu": {
    "app_token": "...", "table_id": "...",
    "project_filter": "新项目名"
  },
  "exclusions": { "email_prefixes": [], "analysis_excluded_emails": [], "name_keywords": [] },
  "output": { "dir": "D:\\新输出目录" }
}
```

## 第四步：确认飞书字段名（如有差异）

如果新多维表格字段名不同，需修改：

1. **`fetch_feishu.py`** 的 `FIELD_NAMES` 列表
2. **`shared_feishu.py`** 中字段解析函数引用的字段名
3. **`shared_config.py`** 中的 `TYPE_MAP`（产出类型映射）

诊断 TYPE_MAP 实际值的脚本（先拉一次飞书再跑）：

```python
import json, glob
from collections import Counter
all_types = Counter()
for fp in glob.glob('data_page*.json'):
    with open(fp, encoding='utf-8') as f:
        for rec in json.load(f)['items']:
            v = rec['fields'].get('产出类型')
            if v and isinstance(v, dict):
                text = ''.join(p.get('text','') for p in v.get('value',[]))
                all_types[text] += 1
print(all_types.most_common(20))
```

## 第五步：确认 Bug ID 格式（如有差异）

当前正则匹配 `BBV-8925`、`AACP-1234` 等。如果新项目 Bug ID 不同，修改 `shared_config.py → BUG_ID_PATTERN`。

```python
BUG_ID_PATTERN = re.compile(r'\b[A-Z][A-Z0-9]{1,15}-\d+\b')
```

## 第六步：执行测试

```powershell
.\venv\Scripts\python.exe fetch_feishu.py
.\venv\Scripts\python.exe fetch_jira.py
.\venv\Scripts\python.exe dashboard_overview.py
.\venv\Scripts\python.exe web_server.py
```

## 验收清单

- [ ] `data_page*.json` 已生成且 `items` 非空
- [ ] `jira_resolved.json` 包含 `resolved_events`、`assignee_events`、`comment_events`
- [ ] Web 仪表盘三个页面打开正常
- [ ] KPI 数值合理（不全为 0）
- [ ] 月度趋势图覆盖飞书工时全周期

## 给 AI 助手的迁移指令模板

```
我有一套研发日报 Bug 效率分析工具（包含 SKILL.md 和完整源代码），
请帮我将它迁移到新项目，具体信息如下：

【飞书数据源】
- 多维表格 URL：[完整 URL]
- 项目名称（Project 字段筛选值）：[你的项目名]
- 工时字段名：[默认"工时(H)/Effort(H)"]
- 产出类型字段名：[默认"产出类型"]

【Jira 信息】
- Jira 地址：[https://new-jira.com]
- Filter ID：[ID]
- 已解决状态：[Resolved / Done]

【输出目录】
[本地路径]

【排除人员】
- 邮箱前缀：[或留空]

请按照 references/MIGRATION.md 操作。
```
