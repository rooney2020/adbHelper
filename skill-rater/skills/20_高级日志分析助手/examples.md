# 分析示例

## 示例 1：NLU 失败 + fallback

**输入**：`voice_session.log` 片段

```
10:01:22.100 [wakeup] session=abc wake_success
10:01:23.050 [asr] start session=abc
10:01:24.800 [asr] end confidence=0.91 text="导航到公司"
10:01:25.100 [nlu] request start
10:01:28.200 [network] http timeout host=nlu.example.com
10:01:28.210 [nlu] error code=TIMEOUT
10:01:28.220 [router] intent=fallback generic_reply
10:01:26.500 [tts] speak start  # 注意：需按真实时间戳排序，此处展示排序后结果
```

**时间线（排序后）**

| 时间 | 模块 | 事件 |
|------|------|------|
| 10:01:22 | 唤醒 | wake_success |
| 10:01:23 | ASR | start |
| 10:01:24 | ASR | end conf=0.91 |
| 10:01:25 | NLU | request start |
| 10:01:28 | 网络 | http timeout |
| 10:01:28 | NLU | TIMEOUT |
| 10:01:28 | 路由 | fallback |
| 10:01:28 | TTS | speak start |

**根因**：P0 网络导致 NLU 超时（NLU 错误前 10ms 出现 network timeout）。

**报告摘要**：用户说「导航到公司」；NLU 未返回；走 generic fallback；建议云端/网络联合查 nlu.example.com SLA。

---

## 示例 2：ASR 置信度不足

```
10:02:01 [asr] partial conf=0.35 text="导..."
10:02:02 [asr] end conf=0.41 text="导航"
10:02:02 [asr] rejected reason=below_threshold
10:02:03 [tts] prompt "请再说一遍"
```

**根因**：P0 本地 ASR 阈值拒绝（`below_threshold`），非 NLU 问题。

---

## 示例 3：相似 case 检索

**当前摘要**：`navigation false trigger, NLU timeout, fallback`

**命中**（`data/cases/2025-03/example-nav-false-trigger.md`）：

- 相似：同为导航域、NLU 超时、fallback 播报
- 差异：上月为 CDN 节点；本次需核对 host 是否一致

建议：对比两次 `network` 日志中的 host 与 RTT。
