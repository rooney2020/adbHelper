---
name: run-generate-llm-conversation
description: Run the LLM conversation data generator script to build SFT data for the model
---

# Run generate-llm-conversation

This skill generates single/multi-turn instruction fine-tuning (SFT) conversation data based on an utterance and a label by calling out to an LLM, saving the output in text files, and optionally converting them to CSV format. 

The harness relies on a bash driver script that loads the `.env` variables and executes the python scripts.

## Prerequisites
- Python 3.8+
- The `openai` and `python-dotenv` python packages (`pip install openai python-dotenv pandas`)

## Setup
Create a `.env` file in `.claude/skills/run-generate-llm-conversation/` containing the API credentials based on `.env.example`:

```bash
cp .claude/skills/run-generate-llm-conversation/.env.example .claude/skills/run-generate-llm-conversation/.env
```

## Run (Agent Path)

Call the driver script from within the skill directory with the required flags: `-u` for the utterance and `-l` for the label.

```bash
cd .claude/skills/run-generate-llm-conversation
./driver.sh -u "我想听周杰伦的歌" -l "多媒体" -n 5
```

### Options:
- `-u <utterance>`: (Required) The classic utterance, e.g., "导航去北京站"
- `-l <label>`: (Required) The intent label, e.g., "导航"
- `-n <num>`: Number of conversation groups to generate (default: 20)
- `-m <mode>`: If set to "主意图", assistant replies are collapsed to `assistant：...`
- `--to-csv`: Set this flag to run the CSV conversion immediately after generating text. This merges the generated `txt` files into a CSV and moves the `txt` files to an `Archived` folder.

Example running with CSV conversion:
```bash
cd .claude/skills/run-generate-llm-conversation
./driver.sh -u "我想听周杰伦的歌" -l "多媒体" -n 5 --to-csv
```

## Gotchas

- **Formatting constraints:** The script relies on the LLM adhering strictly to full-width colons (`user：`) and no leading whitespace.
- **Archive Folder Creation:** When running `--to-csv`, the script will create an `Archived` folder within the run directory to move processed text files to. Make sure there are no permissions issues creating this folder.
- **Python Executable Name:** The driver uses `python3`. On some Windows setups, you might need to use `python` or `py`.

## Troubleshooting

- **Error: Failed to generate data. Please check network or API key.**
  Double check that the `.env` file exists and the `OPENAI_API_KEY` and `OPENAI_BASE_URL` are correct.
  
- **ModuleNotFoundError: No module named 'dotenv'**
  Run `pip install python-dotenv` in your environment.