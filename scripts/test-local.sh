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

# Run BD CLI tests (standalone, no VSCode required)
echo "=== Running BD CLI Tests ==="
npm run test:bd-cli
echo

# Run VSCode integration tests (may not work on all systems)
echo "=== Running VSCode Integration Tests ==="
echo "Note: These may fail on some macOS versions due to Electron issues"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected Linux, using xvfb-run"
    xvfb-run -a npm run test:integration || echo "⚠️  VSCode integration tests failed (non-critical)"
else
    npm run test:integration || echo "⚠️  VSCode integration tests failed (non-critical)"
fi
echo

echo "=== All Critical Tests Passed! ==="
