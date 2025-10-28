# Distribution Guide

This guide covers how to distribute and install the Beads VSCode extension.

## Distribution Options

### 1. Visual Studio Marketplace (Recommended for Public Distribution)

The official way to distribute VSCode extensions is through the Visual Studio Marketplace.

#### Prerequisites
- A [Microsoft/Azure DevOps account](https://dev.azure.com)
- A [Personal Access Token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) with Marketplace permissions
- Install `vsce` (Visual Studio Code Extension Manager):
  ```bash
  npm install -g @vscode/vsce
  ```

#### Publishing Steps

1. **Create a Publisher** (one-time setup):
   ```bash
   vsce create-publisher your-publisher-name
   ```

2. **Update package.json** with your publisher name:
   ```json
   {
     "publisher": "your-publisher-name"
   }
   ```

3. **Login to vsce**:
   ```bash
   vsce login your-publisher-name
   ```

4. **Package and publish**:
   ```bash
   # Package for verification (creates .vsix file)
   vsce package

   # Publish to marketplace
   vsce publish
   ```

5. **Update versions**:
   ```bash
   # Bump patch version (0.0.1 -> 0.0.2)
   vsce publish patch

   # Bump minor version (0.0.1 -> 0.1.0)
   vsce publish minor

   # Bump major version (0.0.1 -> 1.0.0)
   vsce publish major
   ```

**Marketplace Benefits:**
- Automatic updates for users
- Searchable in VSCode Extensions view
- Download statistics and reviews
- Version management

**Documentation:**
- [Publishing Extensions Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Marketplace](https://marketplace.visualstudio.com/vscode)

---

### 2. GitHub Releases (Recommended for Open Source)

Distribute `.vsix` files through GitHub releases for users who prefer manual installation.

#### Steps

1. **Package the extension**:
   ```bash
   npm run compile
   vsce package
   ```
   This creates `beads-vscode-VERSION.vsix`

2. **Create a GitHub Release**:
   - Go to your repository on GitHub
   - Click "Releases" → "Create a new release"
   - Tag version (e.g., `v0.0.1`)
   - Upload the `.vsix` file
   - Write release notes

3. **Users install via**:
   - Download the `.vsix` file from releases
   - In VSCode: Extensions view → `...` menu → "Install from VSIX..."
   - Or via command line:
     ```bash
     code --install-extension beads-vscode-0.0.1.vsix
     ```

---

### 3. Local Installation (Development)

For testing or private use without publishing.

#### From Source

```bash
# Clone and build
git clone https://github.com/your-username/beads-vscode.git
cd beads-vscode
npm install
npm run compile

# Create symlink to VSCode extensions directory
# macOS/Linux:
ln -s $(pwd) ~/.vscode/extensions/beads-vscode

# Windows (PowerShell as Admin):
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.vscode\extensions\beads-vscode" -Target (Get-Location)
```

Then reload VSCode (Cmd/Ctrl+Shift+P → "Developer: Reload Window")

#### From .vsix File

```bash
# Package the extension
vsce package

# Install it
code --install-extension beads-vscode-0.0.1.vsix
```

---

### 4. Open VSX Registry (For Open Source)

Alternative to VS Marketplace, used by VSCodium and other VS Code compatible editors.

#### Publishing to Open VSX

1. **Create an account** at [open-vsx.org](https://open-vsx.org)

2. **Get an access token** from your account settings

3. **Install ovsx CLI**:
   ```bash
   npm install -g ovsx
   ```

4. **Publish**:
   ```bash
   ovsx publish -p YOUR_ACCESS_TOKEN
   ```

**Documentation:** [Open VSX Publishing](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)

---

## Comparison

| Method | Best For | Pros | Cons |
|--------|----------|------|------|
| **VS Marketplace** | Public distribution | Auto-updates, discoverability | Requires Microsoft account |
| **GitHub Releases** | Open source projects | Simple, transparent | Manual updates |
| **Local Install** | Development, private use | Full control | No updates, not shareable |
| **Open VSX** | Open source, VSCodium | Open platform | Smaller user base |

---

## Recommended Approach

For an open source project like this, we recommend **dual distribution**:

1. **Primary: Visual Studio Marketplace**
   - Easiest for most users
   - Automatic updates
   - Best discoverability

2. **Secondary: GitHub Releases**
   - Provide `.vsix` files for each release
   - Users who prefer manual control
   - Backup distribution method

3. **Optional: Open VSX**
   - Support VSCodium users
   - Promote open source ecosystem

---

## Pre-Publishing Checklist

Before publishing to any platform:

- [ ] Update version in `package.json`
- [ ] Run tests: `npm run test:unit`
- [ ] Run linter: `npm run lint`
- [ ] Update CHANGELOG.md with changes
- [ ] Verify README.md is accurate
- [ ] Test extension in VSCode
- [ ] Add/update screenshots if needed
- [ ] Review package.json metadata:
  - `displayName`
  - `description`
  - `keywords`
  - `repository`
  - `homepage`
  - `bugs`
  - `license`
- [ ] Include icon (128x128 PNG recommended)
- [ ] Test installation from `.vsix`

---

## Continuous Deployment

Automate releases with GitHub Actions:

```yaml
# .github/workflows/release.yml
name: Release Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install
      - run: npm run compile
      - run: npm run test:unit

      - name: Package Extension
        run: npx vsce package

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: '*.vsix'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish to VS Marketplace
        run: npx vsce publish -p ${{ secrets.VSCE_TOKEN }}
        if: success()
```

Store your `VSCE_TOKEN` in GitHub repository secrets.

---

## Getting Help

- [VSCode Extension Publishing Docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Reference](https://github.com/microsoft/vscode-vsce)
- [Extension Manifest Reference](https://code.visualstudio.com/api/references/extension-manifest)
