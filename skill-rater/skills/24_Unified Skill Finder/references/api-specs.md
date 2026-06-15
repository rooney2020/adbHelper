# API 规格详细参考

搜索时 **MANDATORY — 加载此文件** 获取具体请求/响应格式。

---

## 1. skillsmp.com REST API

### 搜索

```
GET https://skillsmp.com/api/v1/skills/search
```

| 参数 | 类型 | 必须 | 说明 |
|------|------|------|------|
| q | string | ✓ | 搜索关键词（英文） |
| sortBy | string | - | `stars`(默认) / `updated` / `name` |
| limit | int | - | 1-20，默认 10 |
| category | string | - | 分类 slug（如 `development`） |
| occupation | string | - | 职业 slug（如 `backend-developer`） |

**响应示例**:
```json
{
  "total": 1542,
  "skills": [
    {
      "name": "code-review",
      "author": "anthropics",
      "description": "Perform thorough code reviews...",
      "stars": 125000,
      "githubUrl": "https://github.com/anthropics/skills/tree/main/skills/code-review",
      "category": "development",
      "updatedAt": "2025-06-01"
    }
  ]
}
```

**已知坑**:
- `q` 为空返回热门列表而非报错
- `stars` 排序有缓存延迟（约 6 小时）
- `category` 大小写敏感，必须用 slug 形式
- 匿名限额 50 次/天按 IP 计，VPN 切换可重置

---

## 2. skills.sh REST API (Vercel)

### 搜索

```
GET https://skills.sh/api/skills
```

| 参数 | 类型 | 必须 | 说明 |
|------|------|------|------|
| q | string | ✓ | 关键词 |
| limit | int | - | 1-20，默认 10 |
| sort | string | - | `installs` / `stars` / `security` |
| audit | string | - | `passed` / `failed` / `all` |

**响应示例**:
```json
{
  "results": [
    {
      "name": "systematic-debugging",
      "owner": "obra",
      "repo": "superpowers",
      "path": "skills/systematic-debugging",
      "stars": 128700,
      "installs": 45000,
      "securityAudit": "passed",
      "auditDate": "2025-05-15"
    }
  ]
}
```

**已知坑**:
- `security` 排序优先展示审计通过的，可能遗漏高质量但未审计的 skill
- 安装数 `installs` 只计 CLI 安装，手动复制不算
- 部分 monorepo skill 的 `path` 字段可能为空

### CLI 安装
```bash
npx skills add <owner>/<repo>           # 安装整个仓库
npx skills add <owner>/<repo>#<path>    # 安装指定路径（monorepo）
```

---

## 3. claude-plugins.dev REST API

### 搜索

```
GET https://claude-plugins.dev/api/skills
```

| 参数 | 类型 | 必须 | 说明 |
|------|------|------|------|
| q | string | ✓ | 关键词 |
| page | int | - | 分页，从 0 开始 |
| per_page | int | - | 每页条数，默认 20 |

**响应示例**:
```json
{
  "total": 38300,
  "plugins": [
    {
      "name": "frontend-design",
      "namespace": "anthropics/skills",
      "description": "Create distinctive, production-grade frontend...",
      "stars": 125000,
      "installs": 12000,
      "lastUpdated": "2025-06-10"
    }
  ]
}
```

**已知坑**:
- 字段名是 `plugins` 不是 `skills`（历史原因）
- `namespace` 格式为 `owner/repo`，可能含子路径
- 无排序参数，默认按相关性排

### CLI 安装
```bash
npx claude-plugins install <namespace>
```

---

## 4. skillhub.club 网页搜索

### URL 模式
```
https://skillhub.club/skills?search=<keywords>&category=<slug>&rating=<grade>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| search | string | 支持语义搜索（中英文均可） |
| category | string | `development` / `frontend` / `backend` / `data` / `ai-ml` / `productivity` / `writing` |
| rating | string | `S` / `A` / `B` |

**AI 评分体系** (5 维度):
- 实用性 (Utility)
- 清晰度 (Clarity)
- 自动化程度 (Automation)
- 质量 (Quality)
- 影响力 (Impact)

S 级 = 9.0+，A 级 = 8.0+，B 级 = 7.0+

**已知坑**:
- 语义搜索偶尔返回意想不到的结果（太智能）
- 评分可能因 AI 模型更新而波动
- `npx @skill-hub/cli install <name>` — name 取页面 URL 最后一段

### CLI 安装
```bash
npx @skill-hub/cli install <skill-slug>
npx @skill-hub/cli search "<keywords>"
```

---

## 5. skills.homes 网页搜索

### URL 模式
```
https://skills.homes/en/search?q=<keywords>&category=<slug>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| q | string | 关键词 |
| category | string | 63 个分类 slug |

**主要分类** (按规模):
- productivity-tools (13,973)
- llm-ai (4,725)
- debugging (4,271)
- automation-tools (4,208)
- testing (4,139)
- architecture-patterns (4,113)

**已知坑**:
- 排行榜数据来源主要是 OpenClaw 生态，stars 数反映的是母仓库
- 多语言切换用 URL 前缀: `/zh-CN/`, `/en/`, `/ja/` 等
- 安装命令 `skills install <id>` 需要先 npm 装 skills CLI

### CLI 安装
```bash
skills install <skill-id>
skills use <skill-name>
```

---

## 6. ComposioHQ/awesome-claude-skills (GitHub)

### 结构
```
awesome-claude-skills/
├── README.md          ← 完整分类索引（ctrl+F 搜索）
├── connect-apps/      ← 500+ SaaS 连接器
├── composio-skills/   ← 78 个 SaaS 自动化 skill
├── skill-creator/     ← 创建 skill 的模板
└── [其他独立 skill]/
```

**搜索方式**: 
1. 优先用 GitHub 搜索: `repo:ComposioHQ/awesome-claude-skills <keywords>`
2. 或直接在 README.md 中 Ctrl+F

**已知坑**:
- README 分类有滞后，新 PR 合并后不一定立即更新
- composio-skills/ 需要 Composio API key 才能运行
- 某些 skill 链接指向外部仓库，可能已删除或改名

### 安装方式
```bash
# 方式1: 克隆整个仓库
git clone https://github.com/ComposioHQ/awesome-claude-skills.git
cp -r awesome-claude-skills/<skill-name> ~/.copilot/skills/

# 方式2: Claude Code 原生
claude --plugin-dir ./connect-apps-plugin

# 方式3: 单独复制 SKILL.md
curl -sL https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/<skill>/SKILL.md > ~/.copilot/skills/<skill>/SKILL.md
```

---

## 跨平台去重规则

同一个 skill 在多个平台可能有不同表现形式：

| 判定条件 | 置信度 |
|---------|--------|
| GitHub URL 完全相同 | 100% 同一 skill |
| author + name 相同 | 95% 同一 skill |
| name 相同但 author 不同 | 可能是 fork，需检查 |
| description 高度相似 | 可能是复制品，标注"疑似重复" |

**去重优先级**: 保留来源最多 / 评分最高 / 更新最近的版本。
