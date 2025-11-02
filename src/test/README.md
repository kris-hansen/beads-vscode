# Beads VSCode Extension Tests

This directory contains unit tests and integration tests for the beads-vscode extension.

## Test Structure

```
test/
├── unit/          # Unit tests (no VSCode APIs, fast)
├── suite/         # Integration tests (with VSCode APIs and bd CLI)
└── runTest.ts     # Test runner for VSCode extension tests
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

## Test Suites

### Unit Tests (`unit/`)
- `utils.test.ts` - Tests for utility functions
- Fast, no external dependencies
- Run with Mocha directly

### Integration Tests (`suite/`)
- `extension.test.ts` - Tests for extension activation and commands
- `fileHandling.test.ts` - Tests for file operations
- `integration.test.ts` - Tests for bd CLI integration
- Require VSCode test environment
- Require bd CLI to be installed

## Prerequisites for Integration Tests

1. **bd CLI**: Must be installed and in PATH
   ```bash
   # Install via homebrew
   brew install steveyegge/tap/beads

   # Or via go
   go install github.com/steveyegge/beads@latest
   ```

2. **Node.js**: v18 or higher

3. **Dependencies**: Run `npm install`

## CI/CD

Tests run automatically on GitHub Actions for:
- Push to main/develop branches
- Pull requests
- Multiple OS (Ubuntu, macOS, Windows)
- Multiple Node versions (18.x, 20.x)

See `.github/workflows/test.yml` for configuration.

## Writing New Tests

### Unit Tests
Create files in `src/test/unit/` with `*.test.ts` extension:

```typescript
import * as assert from 'assert';

suite('My Unit Test Suite', () => {
  test('should do something', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```

### Integration Tests
Create files in `src/test/suite/` with `*.test.ts` extension:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('My Integration Test Suite', () => {
  test('should interact with VSCode', async () => {
    const doc = await vscode.workspace.openTextDocument();
    assert.ok(doc);
  });
});
```

## BD CLI Integration Tests

The `integration.test.ts` file contains tests that verify:
- bd CLI can be found and executed
- Issue creation works
- Status updates work
- Label management works
- Issue closing works
- Statistics retrieval works

These tests create a temporary workspace, initialize bd, and clean up after themselves.

## Debugging Tests

### VSCode
1. Open the project in VSCode
2. Set breakpoints in test files
3. Press F5 or Run > Start Debugging
4. Select "Extension Tests" configuration

### Command Line
```bash
# With verbose output
npm run test:integration -- --grep "specific test name"
```

## Troubleshooting

### "bd command not found"
- Ensure bd is installed: `bd version`
- Check PATH includes bd location
- On CI: Check workflow installs bd correctly

### "Extension not found"
- Ensure package.json has correct publisher and name
- Run `npm run compile` before testing

### Tests timeout
- Increase timeout in test file: `this.timeout(30000)`
- Check bd CLI is responding: `bd version`

### Linux headless environment
- CI uses `xvfb-run` for Linux tests
- Locally: `xvfb-run -a npm run test:integration`
