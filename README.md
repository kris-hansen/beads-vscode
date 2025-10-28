# Beads VS Code Extension

This Visual Studio Code extension provides a simple explorer view for [Beads](https://github.com/steveyegge/beads) projects so that you can manage your beads without leaving the editor.

## Features

- Tree view in the Explorer sidebar that lists all beads for the current workspace.
- Loads bead information directly from the JSON data file so fields such as the external reference ID stay in sync.
- Refresh command to reload bead information.
- Open command to jump directly to the file that a bead references.
- Edit command to update the external reference identifier stored in the JSON data.
- Create command to add a new bead from within VS Code.

The extension reads from the Beads JSON data file (defaults to `.beads/beads.json` in your project). The `beads` CLI is only required for creating new beads from within VS Code and can be configured via the extension settings if needed.

## Commands

| Command | Description |
| --- | --- |
| `Beads: Refresh` | Reload bead data from the JSON data file. |
| `Beads: Open` | Open the file associated with the selected bead (if available). |
| `Beads: Edit External Reference` | Update the external reference identifier stored for the bead. |
| `Beads: Create` | Prompt for a title and invoke `beads create`. |

## Settings

- `beads.commandPath`: Path to the Beads CLI executable. Defaults to `beads`.
- `beads.projectRoot`: Optional override for the working directory used when invoking the CLI or resolving relative data file paths.
- `beads.dataFile`: Path to the Beads JSON data file. Relative paths are resolved from the project root and it defaults to `.beads/beads.json`.

## Development

Install dependencies and compile the extension:

```bash
npm install
npm run compile
```

### Testing

Run the test suite:

```bash
# Run unit tests (fast, no VSCode required)
npm run test:unit

# Run all tests including integration tests
npm test

# Run linter
npm run lint
```

See [TESTING.md](TESTING.md) for more information about the test infrastructure.

### Running the Extension

Launch the extension using the **Run > Start Debugging** command in VS Code. This will open a new Extension Development Host window with the Beads explorer view.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Distribution

See [DISTRIBUTION.md](DISTRIBUTION.md) for information on:
- Publishing to VS Code Marketplace
- Creating GitHub releases
- Local installation methods
- Setting up continuous deployment

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Resources

- [Beads CLI](https://github.com/steveyegge/beads) - The core Beads project management tool
- [VS Code Extension API](https://code.visualstudio.com/api) - For contributing to this extension
