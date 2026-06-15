# 日志格式与领域参考

## 0. 通用 `.log` 文件（默认）

现场交付多为单个或多个 **`.log`**，内容可能是 logcat、dialogue 或混合。

- 解析：`python3.10 scripts/parse_timeline.py --log path/to/xxx.log -o timeline.json`
- 脚本对每一行先尝试 logcat 正则，再尝试 dialogue 正则。
- 多文件：多次 `--log`，或与 `--logcat` / `--dialogue` 混用。

## 1. Logcat

常见 Android 格式：

```
MM-DD HH:MM:SS.mmm  PID  TID LEVEL Tag: message
```

提取字段：`timestamp`, `level`, `tag`, `message`。语音相关 Tag 示例：`SpeechSDK`, `VoiceAssistant`, `AudioFlinger`, `ConnectivityService`。

## 2. Dialogue log（对话流水线）

典型阶段与关键词（大小写不敏感）：

| 阶段 | 关键词示例 |
|------|------------|
| 唤醒 | wakeup, wake, 唤醒, hotword |
| ASR | asr start/end, recognition, confidence, partial |
| NLU | nlu, intent, slot, semantic |
| 路由 | fallback, reject, domain |
| TTS | tts, speak, playback |
| 网络 | timeout, network, http, grpc, dns |

结构化 JSON 行优先解析 `timestamp` / `ts` / `time`、`event` / `type`、`sessionId` / `requestId`。

## 3. Trace

- **Perfetto / systrace**：提取 slice 名、开始/结束时间、线程名。
- 与时间线对齐：用唤醒或 ASR 开始作为锚点，标注 trace 相对偏移。

## 4. Protobuf

1. 若有 `.proto`：`protoc --decode=MessageType schema.proto < dump.bin`
2. 无 schema：记录 magic、长度、可打印字段；勿编造字段含义。
3. 将解码后的 `timestamp` + `event_type` 并入 `parse_timeline.py` 的 JSON 输入（`--json-lines`）。

## 5. 统一时间线 JSON（脚本输出）

```json
{
  "events": [
    {
      "ts": "10:01:22.123",
      "ts_epoch_ms": 1710000082123,
      "module": "wakeup",
      "event": "wakeup_success",
      "detail": {},
      "source": "logcat",
      "source_ref": "L1234"
    }
  ],
  "session_id": "optional",
  "meta": { "files": ["logcat.txt"] }
}
```

## 6. 症状 → 原因（推断用）

| 症状组合 | 常见根因 | 验证方式 |
|----------|----------|----------|
| ASR confidence 低 + 重复 partial | 噪声/麦克风/模型阈值 | 对比音频 SNR、换场景复现 |
| NLU 超时 + network timeout 同窗口 | 网络/云端 SLA | 抓包、ping、云端日志 |
| NLU 空结果 + 无 network 错误 | 语义未覆盖/模型版本 | 查 intent 白名单、版本号 |
| intent fallback 紧跟 NLU 失败 | 策略降级 | 查 routing 配置与 error code |
| 唤醒成功但无 ASR | 抢麦/焦点/通道占用 | 查 AudioFocus、并发 session |
| 仅特定 domain 失败 | 垂域服务异常 | 对比其他 domain 请求 |

结论须标注：**证实**（有直接错误码/配置） / **高概率**（时间关联） / **待验证**。

## 7. RAG 检索摘要字段

写入每个 case 文件顶部 YAML 或正文首段：

```yaml
tags: [nlu, timeout, navigation, false-trigger]
modules: [NLU, network]
symptoms: "导航误触发，NLU 超时后 fallback"
root_cause: "CDN 节点超时（已证实）"
version: "IVI 2.3.1"
```

`rag_search.py` 对 `tags`、`symptoms`、`root_cause` 做 TF-IDF；新增 case 后无需重训。

## 8. 责任方分诊参考

| 现象 | 常见责任方 |
|------|------------|
| 本地音频/唤醒/焦点 | 客户端 / BSP |
| HTTP/gRPC 超时、5xx | 网络 / 云端 |
| intent 识别错误、slot 错 | 算法 / NLU |
| 播报卡顿、合成失败 | TTS / 客户端播放器 |
| 仅 OTA 后回归 | 版本 / 集成 |
