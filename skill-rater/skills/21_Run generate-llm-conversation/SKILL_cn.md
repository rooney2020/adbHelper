---
name: run-generate-llm-conversation
description: 运行 LLM 对话数据生成器脚本，为模型构建 SFT 数据
---

# 运行 generate-llm-conversation

此技能基于一个话语（utterance）和一个标签（label），通过调用 LLM 生成单轮/多轮指令微调（SFT）对话数据，将输出保存到文本文件，并可选择将其转换为 CSV 格式。

该测试工具依赖于一个 bash 驱动脚本，该脚本加载 `.env` 变量并执行 python 脚本。

## 前提条件
- Python 3.8+
- `openai` 和 `python-dotenv` python 包（`pip install openai python-dotenv pandas`）

## 设置
在 `.claude/skills/run-generate-llm-conversation/` 中创建一个 `.env` 文件，基于 `.env.example` 包含 API 凭证：

```bash
cp .claude/skills/run-generate-llm-conversation/.env.example .claude/skills/run-generate-llm-conversation/.env
```

## 运行（Agent 路径）

在技能目录内调用驱动脚本，使用必需的标志：`-u` 用于话语，`-l` 用于标签。

```bash
cd .claude/skills/run-generate-llm-conversation
./driver.sh -u "我想听周杰伦的歌" -l "多媒体" -n 5
```

### 选项：
- `-u <utterance>`：（必需）经典话语，例如，“导航去北京站”
- `-l <label>`：（必需）意图标签，例如，“导航”
- `-n <num>`：要生成的对话组数（默认：20）
- `-m <mode>`：如果设置为“主意图”，助手回复被折叠为 `assistant：...`
- `--to-csv`：设置此标志以在生成文本后立即运行 CSV 转换。这将把生成的 `txt` 文件合并到 CSV 中，并将 `txt` 文件移动到一个 `Archived` 文件夹。

带 CSV 转换的运行示例：
```bash
cd .claude/skills/run-generate-llm-conversation
./driver.sh -u "我想听周杰伦的歌" -l "多媒体" -n 5 --to-csv
```

## 注意事项

- **格式约束：** 脚本依赖于 LLM 严格遵守全角冒号（`user：`）且没有前导空格。
- **归档文件夹创建：** 运行 `--to-csv` 时，脚本将在运行目录内创建一个 `Archived` 文件夹，用于移动已处理的文本文件。确保创建此文件夹没有权限问题。
- **Python 可执行文件名称：** 驱动脚本使用 `python3`。在某些 Windows 设置上，您可能需要使用 `python` 或 `py`。

## 故障排除

- **错误：Failed to generate data. Please check network or API key.**
  请仔细检查 `.env` 文件是否存在，并且 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL` 是否正确。

- **ModuleNotFoundError: No module named 'dotenv'**
  在您的环境中运行 `pip install python-dotenv`。

