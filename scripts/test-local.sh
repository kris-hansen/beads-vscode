#!/bin/bash
set -e

echo "=== Beads VSCode Extension - Local Test Script ==="
echo

# Check if bd is installed
if ! command -v bd &> /dev/null; then
    echo "❌ Error: bd command not found"
    echo "Please install beads CLI:"
    echo "  brew install steveyegge/tap/beads"
    echo "  OR"
    echo "  go install github.com/steveyegge/beads@latest"
    exit 1
fi

echo "✓ bd CLI found: $(which bd)"
bd version
echo

# Run linter
echo "=== Running Linter ==="
npm run lint
echo

# Compile TypeScript
echo "=== Compiling TypeScript ==="
npm run compile
echo

# Run unit tests
echo "=== Running Unit Tests ==="
npm run test:unit
echo

# Run integration tests
echo "=== Running Integration Tests ==="
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected Linux, using xvfb-run"
    xvfb-run -a npm run test:integration
else
    npm run test:integration
fi
echo

echo "=== All Tests Passed! ==="
