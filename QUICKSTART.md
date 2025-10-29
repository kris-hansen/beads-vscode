# Quick Start - Install & Use

## Installing the Extension

### Option 1: Install from .vsix (Fastest for now)

1. **Package the extension:**
   ```bash
   npm install
   npm run compile
   npx vsce package
   ```
   This creates `beads-vscode-0.0.1.vsix`

2. **Install in VSCode:**
   - Open VSCode
   - Go to Extensions view (Cmd/Ctrl+Shift+X)
   - Click the `...` menu at the top
   - Select "Install from VSIX..."
   - Choose the `beads-vscode-0.0.1.vsix` file

   **Or via command line:**
   ```bash
   code --install-extension beads-vscode-0.0.1.vsix
   ```

3. **Reload VSCode** (Cmd/Ctrl+Shift+P → "Developer: Reload Window")

### Option 2: Symlink for Development

If you're actively developing:

```bash
# macOS/Linux:
ln -s $(pwd) ~/.vscode/extensions/beads-vscode

# Windows (PowerShell as Admin):
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.vscode\extensions\beads-vscode" -Target (Get-Location)
```

Then reload VSCode.

---

## First Time Setup

### 1. Configure Your Beads Project

The extension needs to know where your beads data file is located.

**Option A: Use workspace folder (automatic)**
- Open your project folder in VSCode
- If you have `.beads/issues.jsonl` in your project root, it will work automatically

**Option B: Configure manually**
1. Open VSCode Settings (Cmd/Ctrl+,)
2. Search for "beads"
3. Set:
   - **Beads: Data File** - Path to your issues file (default: `.beads/issues.jsonl`)
   - **Beads: Project Root** - Override project root if needed
   - **Beads: Command Path** - Path to `beads` CLI (default: `beads`)

### 2. Create Test Data (Optional)

If you don't have a beads project yet, create a test file:

```bash
mkdir -p .beads
cat > .beads/issues.jsonl << 'EOF'
{"id":"TEST-1","title":"First test issue","status":"open","priority":2,"issue_type":"task"}
{"id":"TEST-2","title":"Second test issue","status":"in_progress","priority":1,"issue_type":"bug","labels":["urgent","backend"]}
{"id":"TEST-3","title":"Third test issue","status":"closed","priority":3,"issue_type":"feature","external_ref":"JIRA-123"}
EOF
```

---

## Using the Extension

### 1. Open the Beads Explorer

- Look for the Beads icon in the Activity Bar (left sidebar)
- Or use View menu → "Open View..." → "Beads"

### 2. View Your Issues

The tree view shows all your beads with:
- Issue ID and title
- Status badge (color-coded)
- Priority and labels
- External references

### 3. Available Commands

**Right-click on an issue:**
- **Open** - View full issue details in a webview panel
- **Edit External Reference** - Add/update external tracker links (JIRA, Linear, etc.)

**Toolbar buttons:**
- **Refresh** 🔄 - Reload issues from file
- **Create** ➕ - Create a new issue (requires `beads` CLI)

**Keyboard shortcuts:**
- Click an issue to open its details

### 4. Auto-Refresh

The extension automatically watches your `.beads/issues.jsonl` file and refreshes when it changes.

---

## Common Issues

### Extension not appearing

1. Check the Extensions view - is "Beads Project Manager" installed and enabled?
2. Reload VSCode: Cmd/Ctrl+Shift+P → "Developer: Reload Window"
3. Check for errors: View → Output → Select "Beads" from dropdown

### "Unable to refresh beads list"

1. Verify your data file path in settings
2. Check that the file exists and is valid JSONL
3. Each line must be valid JSON
4. Check VSCode Output panel for specific errors

### Changes not appearing

1. Click the Refresh button in the Beads explorer
2. Check that the file watcher is working (it should auto-refresh)
3. Verify file permissions

### Create command not working

1. Ensure `beads` CLI is installed: `which beads`
2. Set `beads.commandPath` in settings if it's not in your PATH
3. Verify project root is set correctly

---

## Example Workflow

1. **Morning standup:**
   - Open Beads explorer
   - Review open issues
   - Click an issue to see full details

2. **Start work:**
   - Find issue in explorer
   - Click to open details
   - Update status via beads CLI or edit file directly

3. **Link to external tracker:**
   - Right-click issue
   - "Edit External Reference"
   - Enter JIRA/Linear/GitHub issue ID
   - Syncs to your `.beads/issues.jsonl` file

4. **Create new issue:**
   - Click ➕ in toolbar
   - Enter title
   - Issue created via beads CLI

---

## Uninstalling

1. Extensions view (Cmd/Ctrl+Shift+X)
2. Find "Beads Project Manager"
3. Click gear icon → Uninstall

Or via command line:
```bash
code --uninstall-extension beads.beads-vscode
```

---

## Next Steps

- Read [CONTRIBUTING.md](CONTRIBUTING.md) to contribute
- See [DISTRIBUTION.md](DISTRIBUTION.md) to publish your own version
- Check [README.md](README.md) for full documentation
- Report issues on [GitHub](https://github.com/kris-hansen/beads-vscode/issues)

---

## Tips & Tricks

- **Filtering:** Currently view-all, but you can use Cmd/Ctrl+F in the details panel
- **Multi-workspace:** Set `beads.projectRoot` per workspace folder
- **Custom commands:** The beads CLI supports many operations - use terminal for advanced workflows
- **File format:** You can manually edit `.beads/issues.jsonl` - each line is independent JSON
