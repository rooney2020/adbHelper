---
name: advanced-log-analysis
description: >-
  Reconstructs timelines, infers root causes, retrieves similar historical cases,
  and drafts issue reports from automotive/voice-assistant logs (logcat, protobuf,
  trace, dialogue). Use when the user uploads or mentions logcat, protobuf dumps,
  systrace/perfetto, dialogue logs, NLU/ASR/TTS failures, wake word issues, or
  asks for log analysis, timeline reconstruction, root cause, or incident reports.
---

# 高级日志分析助手

车载与语音助手研发以日志驱动。本 skill 将「拼时间线 → 猜根因 → 找历史 case → 写报告」标准化。

## 环境与入口

| 项 | 约定 |
|----|------|
| Python | **3.10**（`python3.10` 或 `pyenv activate py310`） |
| 工作目录 | skill 根目录 `skills/advanced-log-analysis/` |
| 依赖 | `pip install -r requirements.txt`（在 py310 环境中） |

**日志文件约定**：现场日志多为 **`.log`**（如 `voice_20250520.log`、`logcat.log`）。默认用 `--log` 自动识别行格式；仅当明确为 Android logcat 或纯 dialogue 格式时再用 `--logcat` / `--dialogue`。

用户上传或指向的路径可能是任意目录；先确认文件类型再选解析参数。

## 标准工作流

按顺序执行，并在回复中显式标出当前阶段：

```
[ ] 1. 清点输入 → 2. 解析与时间线 → 3. 根因推断 → 4. 相似 case → 5. 问题报告
```

### 1. 清点输入

识别并分类每个文件：

| 类型 | 常见扩展名/特征 | 处理 |
|------|-----------------|------|
| **通用日志（默认）** | **`.log`**，或 `.txt` | `--log`（按行自动识别 logcat / dialogue） |
| logcat | Android 标准列格式 | `--logcat`（或混在 `.log` 里用 `--log`） |
| dialogue | `HH:MM:SS [module]`、ASR/NLU/TTS 关键词 | `--dialogue`（或 `--log`） |
| trace | `.trace`, perfetto, systrace | 先提取时间戳与 slice 名，并入时间线 |
| protobuf | `.pb`, `.bin`, hex dump | 若有 `.proto` 用 `protoc --decode`；否则记录字段级文本/hex 摘要 |

大文件（>50MB）：先 `head`/`tail` 或按 session id / 时间窗口切片，避免整文件进上下文。

### 2. 时间线重建（刚需）

**目标**：单一、按时间排序的事件表，工程师无需再手工拼。

1. 运行解析（可合并多源）：

```bash
cd skills/advanced-log-analysis
python3.10 scripts/parse_timeline.py \
  --log /path/to/voice_session.log \
  -o /tmp/timeline.json
# 多文件：重复 --log；或拆分 --logcat / --dialogue
```

2. 可选导出 Markdown 表：`python3.10 scripts/timeline_to_md.py /tmp/timeline.json`
3. 在回复中输出 **人类可读时间线**（模板见下）。
4. 标注 **会话边界**（唤醒 session_id、request_id、trace_id 若存在）。
5. 标出 **异常区间**（错误码、timeout、fallback、confidence 骤降）。

**时间线输出模板**：

```markdown
## 时间线（session: {id}）

| 时间 | 模块 | 事件 | 证据行/字段 |
|------|------|------|-------------|
| 10:01:22 | 唤醒 | 唤醒成功 | logcat L1234 |
| 10:01:23 | ASR | ASR 开始 | voice.log L56 |
| 10:01:25 | NLU | NLU 失败 (code=xxx) | voice.log L78 |
| 10:01:25 | 路由 | intent fallback | voice.log L79 |
| 10:01:26 | TTS | 播报开始 | voice.log L80 |

**关键路径**: 唤醒 → ASR → NLU ✗ → fallback → TTS
```

无统一时钟时：注明「相对时间 / 需对齐 NTP」并列出用于对齐的锚点事件。

### 3. Root Cause 推断

基于时间线 + [reference.md](reference.md) 中的 **症状→原因** 表做假设排序，禁止无证据断言。

**输出格式**：

```markdown
## 根因分析

| 优先级 | 假设 | 支持证据 | 反证/待验证 |
|--------|------|----------|-------------|
| P0 | 网络导致 NLU 超时 | NLU 前 network_error; RTT>3s | 需抓包确认 |
| P1 | ASR confidence 低于阈值 | conf=0.42 < 0.6 | 需对比同 utterance 历史 |

**最可能结论**: …（一句话）
**建议下一步**: 复现 / 抓包 / 对比版本 / 查配置项 …
```

常见信号（详见 reference）：`confidence < threshold`、`network timeout`、`intent fallback`、`empty nlu result`、`wakeup rejected`。

### 4. 相似问题检索（RAG）

1. 从当前 case 提取 **检索摘要**（见 [reference.md](reference.md)#检索摘要字段）。
2. 在 case 库中搜索：

```bash
python3.10 scripts/rag_search.py \
  --query "NLU timeout navigation false trigger" \
  --cases data/cases \
  --top 5
```

3. 无 case 库时：用 `Grep` 在用户提供的 `data/cases/`、历史报告目录、或用户指定的 wiki/issue 路径中做关键词 + 模块名检索。
4. 输出相似 case 及 **相似点 / 差异点**，便于判断「是否上月导航误触发类问题」。

维护 case：将结案报告存入 `data/cases/{YYYY-MM}/{case-id}.md`（模板见 [templates/issue-report.md](templates/issue-report.md)）。

### 5. 自动生成问题报告

使用 [templates/issue-report.md](templates/issue-report.md)，填满：

- 复现步骤（从时间线反推）
- 影响模块（ASR/NLU/TTS/唤醒/网络/…）
- 疑似原因（带置信度）
- 建议责任方（客户端 / 云端 / 算法 / 网络 / 待分诊）
- 附件清单（原始日志路径、timeline.json）

报告语言：与用户一致（中文/英文）。

## 脚本说明

| 脚本 | 作用 |
|------|------|
| `scripts/parse_timeline.py` | 多源日志 → 统一 JSON 时间线 |
| `scripts/timeline_to_md.py` | timeline.json → Markdown 表格 |
| `scripts/rag_search.py` | 本地 case 库 TF-IDF 相似检索 |
| `scripts/extract_session.py` | 按 session_id 裁剪日志片段 |

执行脚本失败时：说明错误，并 **回退为手工解析**（仍须交付时间线与报告）。

## 质量检查（交付前）

- [ ] 时间线覆盖从唤醒到结束（或明确缺失段）
- [ ] 每条关键结论至少一条日志证据
- [ ] 根因区分「已证实 / 高概率 / 待验证」
- [ ] 相似 case 注明来源路径
- [ ] 报告含可执行的下一步

## 附加资源

- 日志格式与事件词典：[reference.md](reference.md)
- 完整分析示例：[examples.md](examples.md)
- 报告模板：[templates/issue-report.md](templates/issue-report.md)

## 提交说明

- **必须保留**：`SKILL.md`、`reference.md`、`examples.md`、`scripts/`、`templates/`、`requirements.txt`、`data/cases/`
- **可删**：整个 [delet/](delet/) 目录（测试与本地文档，见 [delet/README.md](delet/README.md)）
