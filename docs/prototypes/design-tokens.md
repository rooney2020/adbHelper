# 设计令牌

## 基础信息

- 页面或模块：ADB Helper 桌面工作台原型
- 设计风格：科技清爽
- 技术栈：Electron + React + TypeScript
- 是否深色模式：默认浅色，后续可补暗色主题

## 颜色令牌

| Token | 值 | 用途 | 禁止用途 |
|------|----|------|---------|
| `color.bg.canvas` | `#f3f8fc` | 页面总背景 | 禁止用于卡片背景 |
| `color.bg.surface` | `rgba(255,255,255,0.88)` | 卡片/面板背景 | 禁止用于按钮主色 |
| `color.text.primary` | `#133042` | 主文案 | 禁止用于禁用态 |
| `color.text.secondary` | `#5d7486` | 次级文案 | 禁止用于正文大段文本 |
| `color.action.primary` | `#1d86d9` | 主按钮、主强调 | 禁止用于危险操作 |
| `color.border.default` | `rgba(29,134,217,0.14)` | 常规边框 | 禁止用于焦点态 |
| `color.feedback.error` | `#d64545` | 错误态 | 仅用于错误反馈 |

## 字体与排版

| Token | 值 | 用途 |
|------|----|------|
| `font.family.display` | `"Noto Sans SC", "PingFang SC", sans-serif` | 标题字体 |
| `font.family.body` | `"Noto Sans SC", "PingFang SC", sans-serif` | 正文字体 |
| `font.family.mono` | `"JetBrains Mono", monospace` | 原始命令、结果文本、序列号 |
| `font.size.h1` | `34px` | 页面主标题 |
| `font.size.h2` | `24px` | 区块标题 |
| `font.size.body` | `16px` | 正文 |
| `font.weight.strong` | `700` | 重点标题/按钮 |
| `line.height.body` | `1.7` | 正文行高 |

## 空间令牌

| Token | 值 | 用途 |
|------|----|------|
| `space.xs` | `8px` | 组件内最小间距 |
| `space.sm` | `12px` | 表单字段间距 |
| `space.md` | `16px` | 区块内边距 |
| `space.lg` | `24px` | 大区块间距 |
| `space.xl` | `32px` | 页面级留白 |

## 圆角、边框、阴影

| Token | 值 | 用途 |
|------|----|------|
| `radius.sm` | `12px` | 输入框/小按钮 |
| `radius.md` | `20px` | 卡片/弹层 |
| `border.default` | `1px solid rgba(29,134,217,0.14)` | 常规边框 |
| `border.focus` | `1px solid rgba(29,134,217,0.45)` | 焦点态 |
| `shadow.card` | `0 18px 44px rgba(27,81,122,0.12)` | 卡片 |
| `shadow.popup` | `0 24px 60px rgba(17,59,93,0.18)` | 弹层/下拉 |

## 高风险控件特例

- 下拉框：禁止使用系统原生默认箭头外观，需要统一成圆角 14px 的品牌风格下拉。
- 弹层：高风险确认弹窗必须使用强遮罩、清晰标题和三段信息摘要，禁止轻提示替代。
- 滚动条：结果区滚动条需要细化处理，避免原生粗滚动条破坏科技清爽风格。
- 列表选中态：设备卡片、命令卡片、树节点选中态统一使用淡蓝高亮与细边框。
- 空状态：必须有明确下一步动作，禁止只写“暂无数据”。

## 开发约束

- 哪些令牌必须做成常量：颜色、圆角、阴影、字体族、结果区 mono 字体。
- 哪些允许按平台微调：滚动条宽度、窗口阴影强度、系统标题栏适配边距。
- 哪些不允许在开发阶段临时改值：主色、面板圆角、结果区背景、按钮层级规则。