# Testing Guide for Beads VSCode Extension

This document describes the comprehensive testing infrastructure including unit tests, integration tests, and GitHub Actions CI/CD.

## Test Structure

The project uses a hybrid testing approach:

### Unit Tests (`src/test/unit/`)

Pure unit tests that test utility functions without requiring VSCode runtime.

**Run with:** `npm run test:unit`

**Coverage:**
- Utility functions (pickValue, pickFirstKey, pickTags, normalizeBead)
- Data extraction (extractBeads)
- Path resolution (resolveDataFilePath)
- Error formatting and HTML escaping

### Integration Tests (`src/test/suite/`)

Tests that require the VSCode extension host to run. These test the full extension functionality including commands, tree providers, and **bd CLI integration**.

**Run with:** `npm run test:integration`

**Coverage:**
- Extension activation
- Command registration
- File handling (JSONL and JSON formats)
- **NEW**: BD CLI operations (create, update, label management, close)

**Prerequisites:** bd CLI must be installed and in PATH

**Note:** Integration tests create temporary workspaces and clean up after themselves.

## Running Tests

### Quick Start
```bash
# Run all tests (lint + unit + integration)
npm run test:all

# Run just unit tests (default, fast)
npm test

# Run local test script (recommended)
./scripts/test-local.sh
```

### Individual Test Suites
```bash
# Unit tests only (fast, no dependencies)
npm run test:unit

# Integration tests only (requires VSCode and bd CLI)
npm run test:integration

# Watch mode during development
npm run watch
```

### Prerequisites for Integration Tests

Install bd CLI:
```bash
# Option 1: Homebrew
brew install steveyegge/tap/beads

# Option 2: Go
go install github.com/steveyegge/beads@latest

# Verify installation
bd version
```

## Test Files

- `src/test/unit/utils.test.ts` - Unit tests for utility functions
- `src/test/suite/extension.test.ts` - Integration: Extension activation and command tests
- `src/test/suite/fileHandling.test.ts` - Integration: File I/O tests (JSONL and JSON)
- `src/test/suite/integration.test.ts` - **NEW**: BD CLI integration tests

## Writing New Tests

### Unit Tests

Create new test files in `src/test/unit/` using Mocha's BDD style:

```typescript
import * as assert from 'assert';
import { myFunction } from '../../utils';

describe('My Feature', () => {
  it('should do something', () => {
    const result = myFunction();
    assert.strictEqual(result, expected);
  });
});
```

### Integration Tests

Create new test files in `src/test/suite/` using Mocha's TDD style:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('My Extension Tests', () => {
  test('should register command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('beads.myCommand'));
  });
});
```

## Code Coverage

Currently, the test suite covers:
- ✅ All utility functions
- ✅ Data parsing and normalization
- ✅ File path resolution
- ✅ Extension activation
- ✅ Command registration
- ✅ JSONL and JSON file handling

## GitHub Actions CI/CD

### Workflow: `.github/workflows/test.yml`

Automated testing runs on:
- Push to `main` or `develop` branches
- Pull requests
- Manual workflow dispatch

**Matrix Testing:**
- Operating Systems: Ubuntu, macOS, Windows
- Node Versions: 18.x, 20.x
- Total: 6 test combinations

**Steps:**
1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Run linter
5. Compile TypeScript
6. Install Go and bd CLI
7. Run unit tests
8. Run integration tests
9. Package extension (.vsix)

**Special Handling:**
- Linux uses `xvfb-run` for headless VSCode
- Automatic bd CLI installation via Go
- Artifacts uploaded for debugging

### Running Locally

```bash
# Comprehensive local test (recommended)
./scripts/test-local.sh

# Or manually
npm run lint
npm run compile
npm run test:unit
npm run test:integration
```
