# Contributing to Beads VSCode Extension

Thank you for your interest in contributing to the Beads VSCode extension! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions with the project. We aim to foster an inclusive and welcoming community.

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm
- Visual Studio Code
- [Beads CLI](https://github.com/steveyegge/beads) (for testing create functionality)

### Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR-USERNAME/beads-vscode.git
   cd beads-vscode
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Open in VSCode:
   ```bash
   code .
   ```

4. Press F5 to launch the Extension Development Host

## Development Workflow

### Making Changes

1. Create a new branch for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and test thoroughly

3. Run tests and linting:
   ```bash
   npm run test:unit
   npm run lint
   npm run compile
   ```

4. Commit your changes with clear, descriptive messages:
   ```bash
   git commit -m "Add feature: description of what you added"
   ```

### Code Style

- Follow existing code patterns and conventions
- Use TypeScript strict mode features
- Keep functions focused and testable
- Add tests for new functionality
- Run `npm run lint` before committing

### Testing

- Write unit tests for new utility functions in `src/test/unit/`
- Add integration tests for VSCode-specific features in `src/test/suite/`
- Ensure all tests pass: `npm run test:unit`
- See [TESTING.md](TESTING.md) for detailed testing guidelines

## Submitting Changes

### Pull Request Process

1. Update the README.md or documentation if needed
2. Ensure all tests pass and linting is clean
3. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

4. Open a Pull Request against the `main` branch
5. Fill out the PR template with:
   - Clear description of changes
   - Related issue numbers (if applicable)
   - Testing performed
   - Screenshots (for UI changes)

### Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Write clear, descriptive commit messages
- Update documentation for user-facing changes
- Add tests for new functionality
- Respond to review feedback promptly

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- VSCode version
- Extension version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages or logs (if available)
- Sample `.beads/issues.jsonl` file structure (if relevant)

### Feature Requests

For feature requests, please describe:

- The problem you're trying to solve
- Your proposed solution
- Alternative solutions you've considered
- Any relevant examples or mockups

## Project Structure

```
beads-vscode/
├── src/
│   ├── extension.ts         # Main extension logic
│   ├── utils.ts             # Testable utility functions
│   └── test/
│       ├── unit/            # Unit tests
│       └── suite/           # Integration tests
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript configuration
└── README.md                # User documentation
```

## Key Areas for Contribution

### High Priority
- Improved error handling and user feedback
- Support for additional Beads CLI commands
- Better integration with Beads dependency tracking
- Performance optimizations for large projects

### Documentation
- Improve setup instructions
- Add troubleshooting guides
- Create video tutorials
- Translate documentation

### Testing
- Increase test coverage
- Add end-to-end tests
- Test on different platforms

### Features
- Status indicators in tree view
- Filtering and sorting options
- Search functionality
- Keyboard shortcuts
- Custom themes/icons

## Development Tips

### Debugging

- Use VSCode's debugger (F5) to debug the extension
- Check the Debug Console for logs
- Use `console.log()` for quick debugging
- Enable verbose logging in settings

### Testing Locally

Create a test `.beads/issues.jsonl` file:

```jsonl
{"id":"TEST-1","title":"Test Issue","status":"open","priority":2}
{"id":"TEST-2","title":"Another Issue","status":"in_progress","priority":1}
```

Configure the extension to use it:
```json
{
  "beads.dataFile": ".beads/issues.jsonl"
}
```

### Common Issues

**Extension not loading:**
- Check the Output panel (View > Output > Beads)
- Verify the data file path in settings
- Ensure the JSONL file is valid JSON

**Tests failing:**
- Run `npm install` to ensure dependencies are up to date
- Check that TypeScript compilation succeeds
- Verify no eslint errors

## Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Beads Documentation](https://github.com/steveyegge/beads)
- [Mocha Testing Framework](https://mochajs.org/)

## Questions?

If you have questions about contributing:

1. Check existing issues and PRs
2. Review the documentation
3. Open a discussion or issue
4. Join community discussions (if available)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to Beads VSCode Extension!
