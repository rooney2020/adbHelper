# bug-analysis Skill

把 `bug_analysis_project` 工程封装为可被 Claude / AI 助手按需调用的 **Skill**。

## 目录结构

```
.claude/skills/bug-analysis/
├── SKILL.md                  ← Skill 入口（含 YAML frontmatter）
├── README.md                 ← 本文件
├── references/               ← 详细参考文档（按需加载）
│   ├── SCRIPTS.md            ← 所有脚本速查
│   ├── CONFIG_GUIDE.md       ← config.json 字段详解
│   ├── ANALYSIS_LOGIC.md     ← Bug 解决/分析算法
│   ├── DATA_FLOW.md          ← 数据流图
│   ├── MIGRATION.md          ← 迁移到新项目
│   └── TROUBLESHOOTING.md    ← FAQ
└── scripts/                  ← 辅助 PowerShell 脚本
    ├── check_env.ps1         ← 环境检查
    ├── setup_env.ps1         ← 一键创建 venv + 装依赖
    └── run_full_pipeline.ps1 ← 一键全流程
```

## 工作机制

- **SKILL.md** 是入口。它的 YAML frontmatter 中的 `name` 和 `description` 会被 AI 助手用来匹配用户请求。
- **references/** 中的 markdown 是按需加载的辅助资料，AI 在需要时会读取相关文件。
- **scripts/** 是可直接执行的 PowerShell 脚本，封装常用流程。

## 触发关键词（description 摘要）

- 生成 Bug 报告 / 分析 Bug 效率
- 启动 Bug 仪表盘 / 打开看板
- 更新 Jira / 飞书数据
- 迁移 Bug 分析工具到新项目

## 在 Cline 中使用

如果你使用 Cline、Claude Code 或类似工具识别 Skills，会自动识别此目录。

手动触发：
```
请使用 bug-analysis Skill 帮我生成本周的 Bug 效率报告
```

## 在其它环境中使用

也可以把整个 `.claude/skills/bug-analysis/` 目录复制到 Claude 项目的 Skills 目录，或当作普通文档让 AI 阅读。

## 如何更新此 Skill

工程代码或逻辑发生变化时：

1. 更新 `SKILL.md` 中的工作流和速查表
2. 更新 `references/` 中相关章节
3. 如新增脚本，在 `scripts/` 添加并在 `SKILL.md` 引用
4. 在 `references/SCRIPTS.md` 加上脚本说明

## 与工程根目录文档的关系

| 文档 | 位置 | 用途 |
|------|------|------|
| `README.md` | 工程根目录 | 完整工程说明（人类阅读） |
| `ARCHITECTURE.md` | 工程根目录 | 内部 vs 客户侧架构差异 |
| `DESIGN.md` | 工程根目录 | 设计决策 |
| `SKILL.md` | 本目录 | 给 AI 助手的能力索引 |
| `references/*.md` | 本目录 | 给 AI 助手按需加载的细节 |

Skill 文档**不重复**工程根目录文档的全部内容，而是聚焦"如何使用工具"的视角，并通过链接指向工程根目录的权威文档。
