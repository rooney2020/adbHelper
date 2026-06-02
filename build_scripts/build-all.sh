#!/usr/bin/env bash
set -euo pipefail

#
# ADB Helper - Full Build Script (All Platforms)
#
# This script builds the ADB Helper application for all supported platforms.
#
# Requirements:
#   - Node.js v18+
#   - npm
#   - Python 3
#
# Output:
#   release/adb-helper-linux-x64/    (Ubuntu / Linux x64)
#   release/adb-helper-win32-x64/    (Windows x64)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_SCRIPTS_DIR="$SCRIPT_DIR"

echo "=============================================="
echo "  ADB Helper - Full Build (All Platforms)"
echo "=============================================="
echo ""

# Navigate to the project root
cd "$PROJECT_DIR"

# Check prerequisites
echo "→ Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js v18+."
    exit 1
fi
NODE_VERSION=$(node -v)
echo "  Node.js: ${NODE_VERSION}"

if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not found."
    exit 1
fi
echo "  npm: available"

if ! command -v python3 &> /dev/null; then
    echo "WARNING: python3 is not found. The backend CLI requires Python 3."
fi

# Install dependencies
echo ""
echo "→ Installing dependencies..."
npm ci || npm install
echo "  Dependencies installed."

# Build the Vite + TypeScript project (shared step for both platforms)
echo ""
echo "→ Building the project (Vite + TypeScript)..."
npm run build
echo "  Build completed."

# ── Linux ──────────────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
echo "  Building for Ubuntu (Linux x64)..."
echo "=============================================="
if [ -x "$BUILD_SCRIPTS_DIR/build-ubuntu.sh" ]; then
    # The per-platform script would re-run install/build — skip that by calling package:linux directly.
    echo "  Packaging for Linux..."
    npm run package:linux
    echo "  Ubuntu package completed."
else
    echo "  Packing directly via npm..."
    npm run package:linux
fi

# ── Windows ────────────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
echo "  Building for Windows (Win32 x64)..."
echo "=============================================="
if [ -x "$BUILD_SCRIPTS_DIR/build-windows.bat" ] || [ -f "$BUILD_SCRIPTS_DIR/build-windows.bat" ]; then
    echo "  Packaging for Windows..."
    npm run package:win
    echo "  Windows package completed."
else
    echo "  Packing directly via npm..."
    npm run package:win
fi

# ── Verification ───────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
echo "  Build Summary"
echo "=============================================="

BUILD_SUCCESS=true

if [ -d "release/adb-helper-linux-x64" ]; then
    echo "  ✅ Linux (Ubuntu):    release/adb-helper-linux-x64"
else
    echo "  ❌ Linux (Ubuntu):    build failed"
    BUILD_SUCCESS=false
fi

if [ -d "release/adb-helper-win32-x64" ]; then
    echo "  ✅ Windows:           release/adb-helper-win32-x64"
else
    echo "  ❌ Windows:           build failed"
    BUILD_SUCCESS=false
fi

echo ""
if [ "$BUILD_SUCCESS" = true ]; then
    echo "=============================================="
    echo "  ✓ All platform builds successful!"
    echo "=============================================="
else
    echo "=============================================="
    echo "  ⚠ Some builds failed. Please check the output above."
    echo "=============================================="
    exit 1
fi