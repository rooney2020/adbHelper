#!/bin/bash
set -e

# Load environment variables if .env exists
if [ -f .env ]; then
  source .env
fi

# Set defaults if not set in environment
export OPENAI_API_KEY=${OPENAI_API_KEY:-"sk-bYvFi2ScPrbJn6NfZIS1kJNe3DCTl9qiOEL9fFW4JOtKDYCZOpKjoxIe9D3v8Up8"}
export OPENAI_BASE_URL=${OPENAI_BASE_URL:-"https://llm.thundersoft.com"}
export MODEL_ID=${MODEL_ID:-"ts-gemini-31-pro"}

# Parse arguments
UTTERANCE=""
LABEL=""
NUM=20
MODE=""
TO_CSV=0

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -u|--utterance) UTTERANCE="$2"; shift ;;
        -l|--label) LABEL="$2"; shift ;;
        -n|--num) NUM="$2"; shift ;;
        -m|--mode) MODE="$2"; shift ;;
        --to-csv) TO_CSV=1 ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$UTTERANCE" ] || [ -z "$LABEL" ]; then
    echo "Usage: $0 -u <utterance> -l <label> [-n <num>] [-m <mode>] [--to-csv]"
    exit 1
fi

echo "Running data generation..."
# Build the command based on mode
CMD="python generate_sft_data.py -u \"$UTTERANCE\" -l \"$LABEL\" -n $NUM"
if [ ! -z "$MODE" ]; then
    CMD="$CMD \"$MODE\""
fi

eval $CMD

if [ "$TO_CSV" -eq 1 ]; then
    echo "Converting generated TXT files to CSV..."
    python generate_csv.py --base_dir . --label_name "$LABEL"
fi

echo "Done."
