#!/usr/bin/env bash
set -euo pipefail

# ADB Helper Ubuntu Build Script
# This script builds the ADB Helper application for Ubuntu (Linux x64).
#
# Usage:
#   ./build-ubuntu.sh
#
# Output:
#   release/adb-helper-linux-x64/ directory containing the packaged application.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  ADB Helper - Ubuntu Build"
echo "=============================================="
echo ""

# Navigate to the project root
cd "$PROJECT_DIR"

# Check Node.js
echo "→ Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js v18+ first."
    exit 1
fi
NODE_VERSION=$(node -v)
echo "  Node.js version: ${NODE_VERSION}"

# Check npm
echo "→ Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not found."
    exit 1
fi
echo "  npm available"

# Install dependencies
echo ""
echo "→ Installing dependencies..."
npm ci || npm install
echo "  Dependencies installed."

# Build the project
echo ""
echo "→ Building the project..."
npm run build
echo "  Build completed."

# Package for Linux
echo ""
echo "→ Packaging for Ubuntu (Linux x64)..."
npm run package:linux
echo "  Packaging completed."

# Verify output
echo ""
if [ -d "release/adb-helper-linux-x64" ]; then
    echo "=============================================="
    echo "  ✓ Build successful!"
    echo "  Output: release/adb-helper-linux-x64"
    echo "=============================================="
else
    echo "✗ Build may have failed. Please check the output above."
    exit 1
fi