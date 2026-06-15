---
tags: [nlu, timeout, navigation, false-trigger, fallback]
modules: [NLU, network, router]
symptoms: 用户未说导航却进入导航域；NLU 超时后 generic fallback
root_cause: CDN 节点超时（已证实）
version: IVI 2.3.0
---

# 导航误触发 — NLU 超时案例（示例）

## 摘要

OTA 2.3.0 后偶发「未说导航却播报导航相关回复」，日志显示 NLU 请求超时后走 fallback。

## 时间线

| 时间 | 模块 | 事件 |
|------|------|------|
| 10:01:22 | 唤醒 | wakeup_success |
| 10:01:23 | ASR | asr_start |
| 10:01:25 | NLU | nlu_fail TIMEOUT |
| 10:01:25 | 路由 | intent_fallback |
| 10:01:26 | TTS | tts_start |

## 根因

`network_timeout` 指向 `nlu-cdn.example.com`；切换节点后恢复。
