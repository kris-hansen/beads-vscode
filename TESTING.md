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

**Run with:** `npm test`

**Coverage:**
- Extension activation
- Command registration
- File handling (JSONL and JSON formats)

## Running Tests

```bash
# Run only unit tests (fast, no VSCode required)
npm run test:unit

# Run all tests (including VSCode integration tests)
npm test

# Watch mode during development
npm run watch
```

## Test Files

- `src/test/unit/utils.test.ts` - Unit tests for utility functions
- `src/test/suite/extension.test.ts` - Extension activation and command tests
- `src/test/suite/fileHandling.test.ts` - File I/O tests (JSONL and JSON)

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
npm run compile && npm run lint && npm run test:unit
```

Note: Full integration tests (`npm test`) may require a display/GUI environment and may not work in all CI environments. Unit tests provide good coverage without this requirement.
