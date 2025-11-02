# Beads VSCode Extension - Interface Design

## Overview

This document defines the interface between the VSCode extension and the beads backend for reliable state management.

## Backend Architecture

Beads uses a **SQLite database** as the source of truth, not JSONL files. The architecture follows an LSP-like pattern:

```
VSCode Extension
    ↓
bd CLI (command-line interface)
    ↓
Per-Project Daemon (optional, auto-started)
    ↓
SQLite Database (.beads/*.db)
```

## Interface Options

### Option 1: BD CLI (Current Implementation)

**Command**: `bd` (installed via homebrew, pip, or go)
**Location**: Should be in PATH (e.g., `/opt/homebrew/bin/bd`)

**Advantages**:
- Simple, no additional dependencies
- Works immediately
- Automatic daemon management (auto-starts if configured)

**Disadvantages**:
- Need to parse JSON output
- Subprocess overhead
- Less structured error handling

**Usage**:
```bash
bd list --json                          # List all issues
bd update <id> --status <status>        # Update status
bd label add <id> <label>               # Add label
bd label remove <id> <label>            # Remove label
bd create <title> --priority <n>        # Create issue
bd show <id> --json                     # Get issue details
```

### Option 2: MCP Server (Recommended for AI)

**NOT suitable for VSCode extension** - MCP is designed for AI agents (Claude, etc.), not for programmatic use by extensions.

The VSCode extension should use the BD CLI directly.

## Reliable State Management Interface

### Core Principles

1. **Always use BD CLI commands** - Never directly modify JSONL or database files
2. **Use JSON output** - All read operations should use `--json` flag for structured data
3. **Refresh after mutations** - After any create/update/delete, refresh the view
4. **Handle command not found** - Gracefully handle when `bd` is not in PATH

### Configuration

```typescript
interface BeadsConfig {
  commandPath: string;  // Default: "bd" (expects bd in PATH)
  projectRoot: string;  // Default: workspace root
}
```

### Operations

#### 1. List Issues
```bash
bd list --json
```
Returns array of issues with all fields.

#### 2. Update Status
```bash
bd update <issue-id> --status <open|in_progress|blocked|closed>
```

**Important**: Use `bd close <id>` for closing (respects approval workflows), not `bd update <id> --status closed`

#### 3. Add Label
```bash
bd label add <issue-id> <label-name>
```

#### 4. Remove Label
```bash
bd label remove <issue-id> <label-name>
```

#### 5. Create Issue
```bash
bd create <title> --priority <1-4>
```

#### 6. Get Issue Details
```bash
bd show <issue-id> --json
```

### Error Handling

```typescript
interface CommandError {
  type: 'NOT_FOUND' | 'EXECUTION_ERROR' | 'PARSE_ERROR';
  message: string;
  stderr?: string;
}
```

**Handle these cases**:
1. `ENOENT` - bd command not found in PATH
   - Show helpful error: "bd command not found. Please install beads CLI."
2. Non-zero exit code - Command failed
   - Parse stderr for user-friendly error
3. Invalid JSON - Failed to parse output
   - Show parse error with raw output

### State Synchronization

**Pattern**:
```typescript
async function updateState(issueId: string, mutation: () => Promise<void>) {
  try {
    await mutation();           // Execute bd command
    await this.refresh();       // Reload from database
    showSuccessMessage();
  } catch (error) {
    handleError(error);
    // Don't refresh on error - keep current state
  }
}
```

### File Watching

Watch the `.beads/*.db` files (not JSONL) for external changes:
```typescript
const pattern = new vscode.RelativePattern(
  projectRoot,
  '.beads/*.{db,db-wal,db-shm}'
);
```

When database changes, refresh the view automatically.

## Command Resolution

### Finding BD Command

1. Check user config `beads.commandPath`
2. Try `bd` in PATH
3. Try common locations:
   - `/opt/homebrew/bin/bd` (Homebrew on Apple Silicon)
   - `/usr/local/bin/bd` (Homebrew on Intel Mac)
   - `~/.local/bin/bd` (pip/pipx install)
   - `~/go/bin/bd` (go install)

### Implementation

```typescript
async function findBdCommand(config: BeadsConfig): Promise<string> {
  const configPath = config.commandPath;

  // If user specified a path, use it
  if (configPath && configPath !== 'bd') {
    if (await fileExists(configPath)) {
      return configPath;
    }
    throw new Error(`Configured bd path not found: ${configPath}`);
  }

  // Try 'bd' in PATH first
  try {
    await execFile('bd', ['--version']);
    return 'bd';
  } catch (err) {
    // Fall through to try common locations
  }

  // Try common installation locations
  const commonPaths = [
    '/opt/homebrew/bin/bd',
    '/usr/local/bin/bd',
    path.join(os.homedir(), '.local/bin/bd'),
    path.join(os.homedir(), 'go/bin/bd'),
  ];

  for (const p of commonPaths) {
    if (await fileExists(p)) {
      return p;
    }
  }

  throw new Error('bd command not found. Please install beads CLI.');
}
```

## Testing the Interface

### Manual Testing Checklist

1. ✅ Update issue status from webview
2. ✅ Add label from webview
3. ✅ Remove label from webview
4. ✅ Create new issue
5. ✅ View refreshes after external changes (run `bd update` in terminal)
6. ✅ Graceful error when bd not found
7. ✅ Graceful error when invalid project root

### Automated Testing

Test with mocked `execFile`:
- Success cases return valid JSON
- Error cases throw appropriate errors
- Verify refresh called after mutations

## Future Enhancements

### Phase 1 (Current)
- ✅ Read issues via `bd list --json`
- ✅ Update status via `bd update`
- ✅ Manage labels via `bd label`
- ✅ Watch database for external changes

### Phase 2 (Future)
- Add dependency management UI
- Add issue creation form with all fields
- Add bulk operations
- Add keyboard shortcuts

### Phase 3 (Future)
- Integrate with VSCode tasks
- Add git commit message templates
- Add issue templates
- Add custom views (by priority, assignee, etc.)
