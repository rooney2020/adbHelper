---
name: unified-skill-finder
description: "跨 6 大平台统一搜索 Agent Skills（skillsmp.com 152万/skills.sh 41万/skills.homes 13万/skillhub.club 8万/claude-plugins.dev 3万/ComposioHQ 精选），聚合去重返回最优结果。触发词：找 skill、搜索 skill、安装 skill、skill 市场、推荐 skill、有没有做 xxx 的 skill、find skill、search skill、install skill。Use when: user asks to find/search/install any skill, mentions skill marketplace, or says '找个能做 xxx 的 skill'. Do NOT use for general coding questions or tasks you can already handle confidently."
---

# Unified Skill Finder

跨 6 大 Agent Skills 市场统一搜索，一次查询覆盖 200 万+ 开源技能。

## Quick Reference

| 任务 | 跳转 |
|------|------|
| 快速搜索 | → [核心流程](#核心流程) |
| 选平台 | → [平台决策树](#平台决策树) |
| 安装 skill | → [Phase 5: 安装](#phase-5-安装) |
| API 出错 | → [降级策略](#降级与错误处理) |

---

## 搜索前思考框架

在执行搜索前，30 秒内回答以下问题（决定查哪些平台 → 见[平台决策树](#平台决策树)）：

1. **用户要几个？** "推荐一个" → 质量平台(skillhub+ComposioHQ)；"看看有哪些" → 规模平台(skillsmp+skills.sh)
2. **安全敏感？** skill 接触文件/网络/凭证 → **必须**包含 skills.sh（唯一有审计）
3. **什么领域？** SaaS(Gmail/Slack/Jira) → 直查 ComposioHQ；其他 → 通用搜索
4. **关键词够精确？** 判断方法：如果关键词在英文词典中有 3+ 种含义（如 "test"）→ 加限定词（"unit test framework"）

---

## 核心流程

### Phase 1: 提取搜索关键词

中文转英文（**Why**: 6 平台索引均以英文为主）。关键词精度规则：
- 模糊词加限定词："测试" → `unit test framework`（而非 `test`）
- SaaS 加产品名："发邮件" → `gmail email automation`
- 创意类加具体动作："精美前端" → `frontend design ui`

### Phase 2: 并行搜索（优先 REST API 平台）

**CRITICAL**: 至少查询 2 个平台才能提供可靠推荐。单平台结果可能有偏差。

**MANDATORY — 加载** [`api-specs.md`](references/api-specs.md) 当：首次使用本 skill、遇到未知响应格式、或需要查阅已知坑。  
**Do NOT Load** 当：已熟悉 6 平台 API 结构、仅用上方速查表即可完成搜索、或纯网页拓取不涉及 API。

快速 API 速查：

| 平台 | 端点 | 核心参数 |
|------|------|---------|
| skillsmp.com | `GET /api/v1/skills/search` | `q`, `sortBy=stars`, `limit=5` |
| skills.sh | `GET /api/skills` | `q`, `limit=5`, `audit=passed` |
| claude-plugins.dev | `GET /api/skills` | `q` |
| skillhub.club | 网页 `/skills?search=` | `search`, `rating=S` |
| skills.homes | 网页 `/en/search?q=` | `q`, `category` |
| ComposioHQ | GitHub 搜索 | `repo:ComposioHQ/awesome-claude-skills <keywords>` |

### Phase 3: 聚合与去重

1. **合并** — 所有平台结果放入统一列表
2. **去重** — 按 GitHub URL 或 author+name 去重
3. **综合评分** — `stars×0.4 + 来源数×0.3 + 相关性×0.3`
   - 多平台收录 → 交叉验证加分（**Why**: 独立来源一致推荐说明质量可靠）
   - 知名作者（anthropics、obra、openclaw）→ 加分
4. **取前 5 条**（**NEVER** 展示超过 8 条）

**⛳ 检查点** — 展示前验证结果质量：
- [ ] 前 3 条结果与用户需求语义匹配？（不匹配 → 换关键词重搜）
- [ ] 有至少 1 条来自 2+ 平台？（全无 → 结果可信度低，标注"未交叉验证"）
- [ ] 最高 stars 的结果 updatedAt 在 6 个月内？（超期 → 标注"可能已停维"）

**⚓ Phase 3→Phase 4 质检门**: 检查点未全通过时 **禁止进入 Phase 4**。先修复（换关键词/加平台）再继续。

### Phase 4: 展示结果

```markdown
| # | 名称 | 作者 | Stars | 来源 | 说明 |
|---|------|------|-------|------|------|
| 1 | xxx | yyy | 100k | SkillsMP+Skills.sh ✓审计 | 描述 |
| 2 | zzz | www | 50k | SkillHub (S级) | 描述 |
```

标注规范：
- 多平台 → `+` 连接
- SkillHub AI 评分 → `(S级)` `(A级)`
- Skills.sh 安全审计通过 → `✓审计`

### Phase 5: 安装

| 来源 | 安装方式 |
|------|---------|
| skillsmp.com | `npx skills add <author>/<repo>` |
| skills.sh | `npx skills add <owner/repo>` |
| claude-plugins.dev | `npx claude-plugins install <namespace>` |
| skillhub.club | `npx @skill-hub/cli install <name>` |
| skills.homes | `skills install <skill-id>` |
| ComposioHQ | 克隆对应目录到 `~/.copilot/skills/` |

> **CRITICAL — 安全门控**: 安装前 **必须** 使用 skill-vetter 进行安全审查。
> - BLOCKED → 禁止安装，告知用户风险
> - REVIEW → 展示风险详情，等待用户决定
> - SAFE → 仍需用户确认后才执行安装

**安装验证**: 安装后执行 `ls ~/.copilot/skills/<name>/SKILL.md`（或 Windows: `Test-Path`）确认文件存在，再在新对话中用触发词测试 skill 是否正确加载。

---

## 平台决策树

搜索前根据用户意图选择平台组合：

```
用户需求
├─ "最好的/推荐一个"
│   → skillhub.club (AI评分筛S级) + ComposioHQ (精选)
│   Why: 质量优先，AI 评分 + 社区精选双保险
├─ "有哪些选择/全面搜"
│   → skillsmp.com (152万全覆盖) + skills.sh (41万)
│   Why: 规模优先，不遗漏小众选项
├─ "安全的/生产环境用"
│   → skills.sh (有审计) → 交叉验证 skillhub.club 评分
│   Why: 安全审计是唯一客观安全指标
├─ "SaaS自动化 (Gmail/Slack/Jira...)"
│   → ComposioHQ 直达（跳过通用搜索）
│   Why: 78个专精skill，通用平台搜SaaS效率低10倍
├─ "中文的/国内用"
│   → skillhub.club + skills.homes
│   Why: 唯二支持中文语义搜索的平台
└─ 不确定/通用
    → skillsmp.com + skillhub.club (规模+质量双保险)
```

---

## NEVER 列表

- **NEVER** 基于单一来源或单一指标推荐 — 至少 2 平台 + 2 维度（如 stars+评分）交叉验证
- **NEVER** 展示超过 8 条结果 — 造成决策瘫痪，5 条最佳
- **NEVER** 跳过安全审查直接安装 — 即使 stars 很高，skill 可能含恶意指令
- **NEVER** 在 API 配额耗尽时报错放弃 — 必须降级到其他平台
- **NEVER** 对 SaaS 类需求搜通用平台 — 直查 ComposioHQ 效率高 10 倍
- **NEVER** 把网页搜索结果当作结构化 API 同等可靠 — 网页抓取可能遗漏结果
- **NEVER** 编造虚假 skill 名称或链接 — 搜索结果为 0 时诚实告知

---

## 专家经验：平台特有坑

> 这些是反复踩坑后总结的非显而易见知识。

| 坑 | 表现 | 正确处理 |
|----|------|---------|
| skillsmp.com 星标缓存 | 新 skill 的 stars 显示 0 约 6 小时 | 同时看 updatedAt 判断是否是新发布的优质 skill |
| skills.sh monorepo | 同一个仓库出现多条结果 | 按 path 字段区分是不同 skill，不要误去重 |
| skillhub.club 语义搜索 | "test" 返回 "protest" 等无关结果 | 用更精确的词如 "unit test framework" |
| skills.homes 母仓库 stars | OpenClaw 生态 skill 共享母仓库 354k stars | 不代表单个 skill 质量，需看描述和分类匹配度 |
| ComposioHQ composio-skills/ | 需要 Composio API key 才能运行 | 安装前告知用户需注册 composio.dev 获取免费 key |
| claude-plugins.dev 字段名 | 响应 JSON 用 `plugins` 而非 `skills` | 历史遗留，按 `plugins` 数组取数据 |

**搜索策略专家经验**：同一需求用不同粒度关键词在不同平台效果差异巨大。精确词（`android unit test mockk`）在 skillsmp 的关键词索引中表现优异，但在 skillhub 的语义搜索中可能过于狭窄导致 0 结果。反之，模糊词（`testing`）在语义搜索中得到广泛结果，但在关键词索引中噪音过高。**最佳策略**：对 REST API 平台用精确词，对网页语义搜索平台用稍宽泛的词。

---

## 质量信号速判

| 置信度 | 条件（命中即判） | 行动 |
|--------|-----------------|------|
| **高置信** | 多平台收录 + AI评分≥A；或官方出品(anthropics/obra)；或 skills.sh ✓审计+近3月更新 | 直接推荐 |
| **中置信** | 仅1平台但 stars>50k+installs>10k；或 SkillHub B级+描述精准匹配 | 推荐但标注"未交叉验证" |
| **低置信** | 仅 stars 高（可能 monorepo 共享）；仅1平台+stars<100 | 标注风险，建议用户自行确认 |
| **红旗** | updatedAt>12月；作者仅1个skill+无README；外部链接404 | 建议跳过或额外审查 |

---

## 降级与错误处理

| 故障 | 处理方式 |
|------|---------|
| skillsmp.com API 429 (超额) | 降级到 skills.sh + claude-plugins.dev |
| skills.sh 超时 | 跳过，用 skillsmp + skillhub 替代 |
| 网页抓取失败 | 直接提供搜索链接让用户手动浏览 |
| 全部 API 失败 | 提供 6 平台搜索链接 + 建议关键词 |
| 结果为 0 | 放宽关键词（拆分/同义词）重试一次 → 仍为 0 则诚实告知 |

---

## 示例

```
用户: "找个代码审查的 skill"
关键词: code review

聚合结果:
| # | 名称 | 作者 | Stars | 来源 | 说明 |
|---|------|------|-------|------|------|
| 1 | code-review | anthropics | 125k | SkillsMP+Skills.sh+Plugins ✓审计 | PR 自动审查 |
| 2 | find-bugs | anthropics | 125k | SkillsMP+SkillHub(B级) | 分支变更安全审查 |
| 3 | autoreview | openclaw | 374k | SkillsMP | 自动化审查 |

推荐: "#1 Anthropic 官方出品，三平台收录且通过安全审计，推荐优先安装。"
```
