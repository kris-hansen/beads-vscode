# Testing Guide

This document describes the testing infrastructure for the Beads VSCode extension.

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

Tests that require the VSCode extension host to run. These test the full extension functionality including commands and tree providers.

**Run with:** `npm run test:integration`

**Coverage:**
- Extension activation
- Command registration
- File handling (JSONL and JSON formats)

**Note for macOS users:** Integration tests may fail on certain macOS versions due to compatibility issues with the `@vscode/test-electron` package. This is a known limitation. Unit tests provide comprehensive coverage of core functionality and are the primary test suite.

## Running Tests

```bash
# Run unit tests (default, fast, no VSCode required)
npm test

# Or explicitly run unit tests
npm run test:unit

# Run integration tests (requires VSCode, may not work on all macOS versions)
npm run test:integration

# Watch mode during development
npm run watch
```

## Test Files

- `src/test/unit/utils.test.ts` - Unit tests for utility functions
- `src/test/suite/extension.test.ts` - Integration: Extension activation and command tests
- `src/test/suite/fileHandling.test.ts` - Integration: File I/O tests (JSONL and JSON)

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

## Continuous Integration

Tests should be run as part of CI/CD before merging:

```bash
npm run compile && npm run lint && npm test
```

The default `npm test` runs unit tests which are fast, reliable, and work across all platforms including macOS. Integration tests require a display/GUI environment and may not work in all CI environments or on all macOS versions.
