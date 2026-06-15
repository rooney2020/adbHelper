import os
import json
import asyncio
import argparse
import re
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ.get("OPENAI_API_KEY", "sk-bYvFi2ScPrbJn6NfZIS1kJNe3DCTl9qiOEL9fFW4JOtKDYCZOpKjoxIe9D3v8Up8")
BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://llm.thundersoft.com")
MODEL_ID = os.environ.get("MODEL_ID", "ts-gemini-31-pro")

PROMPT_TEMPLATE = """你是一个对话数据构造专家，负责为大语言模型(LLM)的指令微调(SFT)构建高质量、多样化的单轮和多轮对话数据。

请根据用户提供的【经典说法】、【标签】和【生成组数】，生成对应数量的泛化对话。

## 规则要求：
1. **严格的格式**：必须使用中文全角冒号“：”，格式如下：
user：<用户对话>
assistant：<系统回复>
user：<用户对话>

2. **对话逻辑**：
- 按照N分类的逻辑，多轮对话主要看最后一轮和上一轮联系。
- **对话轮数要求**：请混合生成单轮对话（只有 user 说一句）和多轮对话（最多支持 U-A-U-A-U-A-U）。
- 保证最后一句必须是 `user` 说，并且这句话的意图对应【标签】，话术必须等同于或紧密包含【经典说法】。
- **极度重要**：`user：`和`assistant：`必须**顶格写**，前面**绝对不能**有任何空格、Tab或缩进！！！

3. **泛化场景**：针对同一个说法和标签，结合不同的前置意图上下文，生成 {num_groups} 组场景合理的对话。

4. **Excel 粘贴友好**（非常重要）：
- 为了方便用户直接将其完整粘贴到 Excel 的**单个单元格**中，**每一组完整的对话必须被一对英文双引号 `"` 包裹**。
- 各组对话之间用一个空行隔开。
- **只输出带引号的纯对话文本**，不要输出任何其他的分析、开头问候语、结尾总结，也**不要**使用 Markdown 的代码块符号（如 ``` ）。

## 示例：
**用户输入**：
经典说法：“第六个”，标签：“多媒体”，生成组数：2

**你的输出**：
"user：我想听郭德纲的相声
assistant：我找到了这些,你想看哪个呢,1.郭德纲21年相声精选;2.郭德纲相声十年经典;3.郭德纲相声精选;4.郭德纲相声精选;5.郭德纲于谦相声全集;6.《败家子儿》
user：第六个"

"user：放第六个"

---
请开始处理用户的输入数据，遵循上述规则批量生成对应的泛化对话：

【经典说法】：{utterance}
【标签】：{intent_label}
【生成组数】：{num_groups}
"""

async def generate_conversations(utterance: str, intent_label: str, num_groups: int) -> str:
    """调用LLM生成多轮对话"""
    client = AsyncOpenAI(
        api_key=API_KEY,
        base_url=BASE_URL,
    )
    
    prompt = PROMPT_TEMPLATE.format(
        utterance=utterance, 
        intent_label=intent_label,
        num_groups=num_groups
    )
    
    try:
        response = await client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Error generating data for {utterance} ({intent_label}): {e}")
        return ""


def sanitize_filename_component(text: str, fallback: str) -> str:
    """将文本转换为适合 Windows 文件名的片段。"""
    sanitized = re.sub(r'[<>:"/\\|?*\r\n\t]+', '_', text).strip()
    sanitized = re.sub(r'\s+', '_', sanitized)
    sanitized = re.sub(r'_+', '_', sanitized).strip('._ ')
    return sanitized[:50] or fallback


def build_utterance_key(text: str, fallback: str = "dlg") -> str:
    """经典说法去标点和空白后，取前 6 个字符用于文件名。"""
    condensed = re.sub(r'[^\w\u4e00-\u9fff]+', '', text, flags=re.UNICODE)
    return condensed[:6] or fallback


def collapse_assistant_reply(content: str) -> str:
    """主意图模式下，将 assistant 回复折叠为固定占位。"""
    return re.sub(r'(?m)^assistant：.*$', 'assistant：...', content)


def append_result_without_blank_lines(filename: str, content: str) -> None:
    """追加写入结果，同时移除内容中的空行和文件末尾多余空行。"""
    normalized_lines = [line.rstrip() for line in content.splitlines() if line.strip()]
    normalized_content = "\n".join(normalized_lines)
    if not normalized_content:
        return

    file_exists = os.path.exists(filename)
    file_has_content = file_exists and os.path.getsize(filename) > 0

    with open(filename, "a+", encoding="utf-8", newline="\n") as f:
        if file_has_content:
            f.seek(0)
            existing_content = f.read().rstrip()
            f.seek(0)
            f.truncate()
            if existing_content:
                f.write(existing_content + "\n")
        f.write(normalized_content + "\n")

async def main():
    parser = argparse.ArgumentParser(description="生成LLM SFT微调对话数据")
    parser.add_argument("-u", "--utterance", type=str, required=True, help="经典说法，如 '爱奇艺搜索家宴'")
    parser.add_argument("-l", "--label", type=str, required=True, help="标签，如 '其他'")
    parser.add_argument("-n", "--num", type=int, default=20, help="生成的对话组数，默认 20")
    parser.add_argument("mode", nargs="?", default="", help="可选模式，传入 '主意图' 时将 assistant 回复折叠为 assistant：...")
    
    args = parser.parse_args()
    
    print(f"开始生成数据...\n经典说法: {args.utterance}\n标签: {args.label}\n组数: {args.num}")
    
    result = await generate_conversations(args.utterance, args.label, args.num)
    if result:
        if args.mode == "主意图":
            result = collapse_assistant_reply(result)
        utterance_key = sanitize_filename_component(build_utterance_key(args.utterance), "dlg")
        label_key = sanitize_filename_component(args.label, "unknown")
        filename = f"conversation_{utterance_key}_{label_key}.txt"
        append_result_without_blank_lines(filename, result)
        print(f"Success! Data saved to: {filename}")
    else:
        print("Error: Failed to generate data. Please check network or API key.")

if __name__ == "__main__":
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    asyncio.run(main())
