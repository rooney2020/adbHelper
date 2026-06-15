---
name: diff-impact-analysis
description: "提交前防御性 diff 审查：分析 git diff 发现回归风险(二次不具合)、同类隐患(類似不具合)、安全漏洞、代码质量问题及受影响测试。触发词：diff分析/回归分析/二次不具合/類似不具合/提交前检查/code review/安全扫描/帮我看看改动。不触发：纯文档修改、merge commit无代码改动、单行代码含义提问。标准模式=功能+回归+同类；完整模式额外含安全+质量+测试影响。"
---

# Diff Impact Analysis

提交前的防御性代码审查。通过 git diff 获取变更，以资深 QA 视角系统性发现回归风险和代码库同类隐患。

## 目录结构

```
diff-impact-analysis/
├── SKILL.md                    ← 核心流程与思维框架
├── scripts/
│   └── generate_report.py      ← JSON → HTML 报告生成
├── assets/
│   ├── report-template.html    ← HTML 模板（备用）
│   ├── report-scripts.js       ← 报告前端交互逻辑
│   ├── report-styles.css       ← 报告样式
│   └── report_server.py        ← 本地交互服务器
└── references/
    ├── security-checklist.md   ← 完整模式：安全漏洞清单
    ├── quality-checklist.md    ← 完整模式：代码质量清单
    ├── android-checklist.md    ← Android 项目特化检查（自动检测）
    ├── interaction-flow.md     ← 交互闭环详细流程
    └── test-impact-strategy.md ← 测试搜索策略（复杂项目按需加载）
```

---

## Quick Reference

| 用户说了什么 | 执行模式 | 输出 |
|------------|----------|------|
| `帮我看看改动` / `回归分析` / `修改影响` | 标准 | ①功能 ②回归 ③同类 |
| `安全审计` / `code review` / `全面审查` | 完整 | ①功能 ②安全 ③质量 ④回归 ⑤同类 |
| `修复XX问题` / 提交 fix-selections | 修正循环 | 修代码 → 重新分析 |
| `分析所有待提交` / `gerrit 提交前检查` | 批量 | 分析 origin/main..HEAD 全部变更 |

完整模式追加读取 `references/security-checklist.md` 和 `references/quality-checklist.md`。
Android 项目自动追加 `references/android-checklist.md`（检测到 build.gradle 含 android plugin 或存在 AndroidManifest.xml 时）。

---

## 回归分析思维模型

每个改动点，问三个问题：

1. **谁调用了我？**（向上追溯）— 用 `vscode_listCodeUsages` 追踪所有调用方，判断它们是否仍能正确工作
2. **我依赖了谁的行为？**（向下追溯）— 被调用方的前置条件/不变量是否被打破
3. **有什么隐式契约被打破了？**（不变量分析）— 并发假设、null 约定、调用时序、资源所有权

这三个问题比逐条对照清单更有效，因为回归的本质是"改动破坏了未被显式声明的依赖关系"。

### 回归分析维度

- **接口契约** — 签名/返回值/异常变更，调用方是否适配
- **状态与生命周期** — 状态变量修改，状态机转换是否完整
- **并发安全** — 共享数据修改，锁策略一致性，原子性假设
- **边界条件** — null/空集合/极值新旧代码是否一致覆盖
- **资源管理** — 新增获取是否有对应释放，异常路径是否泄漏
- **配置依赖** — 读同一配置的其他代码是否受影响

---

## 执行流程

### Step 0: 确定分析范围

根据用户意图选择 diff 来源：

| 场景 | 命令 | 说明 |
|------|------|------|
| 默认（工作区改动） | `git diff` | 未暂存的修改 |
| 已暂存 | `git diff --staged` | 即将提交的内容 |
| 指定提交 | `git show <commit>` | 单个提交 |
| **批量/Gerrit 提交前** | `git diff origin/main...HEAD` | 本地所有待提交的变更（多 commit 合并 diff） |

**批量模式触发条件**：
- 用户说"分析所有待提交"/"gerrit 提交前检查"/"看看我这几天的改动"
- 或显式指定 `origin/main..HEAD` 范围

**批量模式额外步骤**：
```bash
# 先列出涉及的 commit，了解改动脉络
git log --oneline origin/main..HEAD

# 再获取合并后的总 diff（最终效果）
git diff origin/main...HEAD
```

分析时以**总 diff 效果**为主，commit 列表仅作为理解改动意图的辅助。

### Step 1: 获取 diff 与上下文

1. 按 Step 0 确定的方式获取 diff
2. 对每个变更文件，读取修改点前后各 50 行（大文件）或完整文件（<500行）
3. 确认文件职责、所属模块、调用关系
4. 完整模式追加攻击面映射（详见 `references/security-checklist.md` 第一节）
5. Android 项目追加读取 `references/android-checklist.md`

**加载控制**：
- 标准模式：Do NOT Load `security-checklist.md`、`quality-checklist.md`
- 完整模式：MANDATORY Load `security-checklist.md` + `quality-checklist.md`
- Android 项目：自动追加 `android-checklist.md`（检测到 android plugin 时）
- 交互闭环：仅在生成报告阶段 Load `interaction-flow.md`

### Step 2: 分析并产出报告

// CRITICAL: 对每个改动文件必须执行"三个问题"追溯（谁调用了我/我依赖了谁/隐式契约），不能仅凭 diff 文本判断。

**输出规模自适应**：
- 1-3 文件变更：合并①④⑤为一段叙述式分析，省略章节标题
- 4-10 文件：标准分章节模板
- >10 文件：按模块分组，每组内用标准模板

按下方模板生成中文报告。标准模式跳过 ②③。

### ① 修改内容与实现功能

| # | 文件 | 修改概要 | 实现的功能 |
|---|------|----------|-----------|

### ② 安全漏洞分析（完整模式）

读取 `references/security-checklist.md`，按清单逐项检查。验证后确认无问题的项不输出。

### ③ 代码质量问题（完整模式）

读取 `references/quality-checklist.md`，按维度检查。

### ④ 二次不具合分析（回归风险）

用"三个问题"思维模型逐条分析改动可能破坏的已有功能。

### ⑤ 類似不具合分析（同类隐患）

搜索代码库中相同模式/相同根因的代码（grep/semantic_search）。
- 资源管理 — 新增获取是否有对应释放
- 配置依赖 — 其他读取同一配置的代码是否受影响

只列有实际可能性的风险项。确认无风险的角度不列。

### ⑥ 受影响测试用例（Test Impact）

基于 diff 中变更的类/方法，识别项目中**已有的测试用例**中哪些可能受影响。

搜索优先级：命名约定(FooTest) → 符号引用(vscode_listCodeUsages) → import搜索 → 间接依赖递归。
无测试覆盖时标注 "⚠ 无已有测试覆盖" + 人工测试手顺(manual_steps)。

详细搜索策略见 [test-impact-strategy.md](references/test-impact-strategy.md)（项目测试结构复杂时加载）。

---

## 分析原则与禁止项

**原则**：宁多勿漏 | 具体优先 | 附带验证 | 标注置信 | 不编造  
**优先级**：安全 > Bug > 质量 > 风格

// CRITICAL: 以下为硬性禁止项

- NEVER 把理论风险标高严重度 — 无法实际触发的最高标 Low
- NEVER 把代码风格混入回归分析 — 放质量章节
- NEVER 列语法相似但语义无关的同类隐患
- NEVER 生成无法验证的风险项 — 写不出验证方式就不够具体
- NEVER 因 diff 大就跳过同类隐患搜索
- NEVER 仅看 diff 行就下结论 — 必须读函数级上下文+调用方，孤立 diff 行信息量不足
- NEVER 对纯位置移动(代码搬迁无语义变化)报告回归 — 先确认行为是否等价

❌ 错误：`严重度: HIGH — 路径遍历可能导致任意文件读取 / 验证: 需要进一步确认`  
✅ 正确：`严重度: LOW — 路径遍历（理论风险，调用方硬编码路径）/ 验证: grep 所有调用方确认参数来源`

## 特殊场景与边界处理

- **纯重构**：重点关注行为等价性，用"谁调用了我"思维追溯
- **新增文件**：检查是否遗漏注册/配置；新代码是否引入已知反模式
- **删除代码**：`vscode_listCodeUsages` 搜被删符号的所有引用
- **跨模块**：逐模块分析后补充模块间交互风险

| 边界场景 | 行为 |
|----------|------|
| `git diff` 为空 | 告知用户"无待分析变更"，停止 |
| 变更文件 >30 个 | 优先分析改动最大的 10 个文件，其余列为"未深入分析" |
| 二进制文件 (.so/.aar/.jar) | 跳过内容分析，仅检查版本/路径变更意图 |
| 生成代码 (R.java/BuildConfig/databinding) | 跳过，不分析自动生成文件 |

---

## HTML 交互报告

分析完成后生成交互式 HTML 报告，通过本地服务器与用户形成修正闭环。

```powershell
python "{baseDir}/scripts/generate_report.py" "<analysis.json>" "<output_dir>"
python "{baseDir}/assets/report_server.py" "<报告路径>" "<输出目录>"
```

analysis.json 结构详见 `scripts/generate_report.py` 文件头注释。
完整交互流程详见 [interaction-flow.md](references/interaction-flow.md)。

---

## 工具选择

| 工具 | 用途 |
|------|------|
| `git diff` / `git show` | 获取变更 |
| `grep_search` | 搜相似模式、同名方法 |
| `semantic_search` | 语义关联查找 |
| `vscode_listCodeUsages` | 追踪符号引用（回归分析核心） |
| `read_file` | 上下文理解 |
| `create_file` | 写 analysis.json 和报告 |
| `run_in_terminal` | 调用生成脚本、启动服务器 |
