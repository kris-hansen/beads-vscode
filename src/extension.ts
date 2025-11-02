import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import {
  BeadItemData,
  normalizeBead,
  extractBeads,
  resolveDataFilePath,
  formatError,
  escapeHtml,
  createTooltip
} from './utils';

const execFileAsync = promisify(execFile);

async function findBdCommand(configPath: string): Promise<string> {
  // If user specified a path other than default, try to use it
  if (configPath && configPath !== 'bd') {
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      throw new Error(`Configured bd path not found: ${configPath}`);
    }
  }

  // Try 'bd' in PATH first
  try {
    await execFileAsync('bd', ['--version']);
    return 'bd';
  } catch {
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
    try {
      await fs.access(p);
      return p;
    } catch {
      continue;
    }
  }

  throw new Error('bd command not found. Please install beads CLI: https://github.com/steveyegge/beads');
}

interface BeadsDocument {
  filePath: string;
  root: unknown;
  beads: any[];
}

class BeadsTreeDataProvider implements vscode.TreeDataProvider<BeadTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BeadTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private items: BeadItemData[] = [];
  private document: BeadsDocument | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private watcherSubscriptions: vscode.Disposable[] = [];
  private watchedFilePath: string | undefined;
  private openPanels: Map<string, vscode.WebviewPanel> = new Map();
  private searchQuery: string = '';

  constructor(private readonly context: vscode.ExtensionContext) {}

  getTreeItem(element: BeadTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BeadTreeItem): Promise<BeadTreeItem[]> {
    if (element) {
      return [];
    }

    if (this.items.length === 0) {
      await this.refresh();
    }

    const filteredItems = this.filterItems(this.items);
    return filteredItems.map((item) => this.createTreeItem(item));
  }

  async refresh(): Promise<void> {
    try {
      const result = await loadBeads();
      this.items = result.items;
      this.document = result.document;
      this.ensureWatcher(result.document.filePath);
      this.onDidChangeTreeDataEmitter.fire();

      // Refresh all open webview panels
      this.refreshOpenPanels();
    } catch (error) {
      console.error('Failed to refresh beads', error);
      void vscode.window.showErrorMessage(formatError('Unable to refresh beads list', error));
    }
  }

  registerPanel(beadId: string, panel: vscode.WebviewPanel): void {
    this.openPanels.set(beadId, panel);

    panel.onDidDispose(() => {
      this.openPanels.delete(beadId);
    });
  }

  private refreshOpenPanels(): void {
    this.openPanels.forEach((panel, beadId) => {
      const updatedItem = this.items.find((i: BeadItemData) => i.id === beadId);
      if (updatedItem) {
        panel.webview.html = getBeadDetailHtml(updatedItem);
      }
    });
  }

  private filterItems(items: BeadItemData[]): BeadItemData[] {
    if (!this.searchQuery) {
      return items;
    }

    const query = this.searchQuery.toLowerCase();
    return items.filter((item) => {
      const raw = item.raw as any;
      const searchableFields = [
        item.id,
        item.title,
        raw?.description || '',
        raw?.design || '',
        raw?.acceptance_criteria || '',
        raw?.notes || '',
        raw?.assignee || '',
        item.status || '',
        raw?.issue_type || '',
        ...(raw?.labels || []),
        ...(item.tags || []),
      ];

      return searchableFields.some(field =>
        String(field).toLowerCase().includes(query)
      );
    });
  }

  async search(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Search beads by ID, title, description, labels, status, etc.',
      placeHolder: 'Enter search query',
      value: this.searchQuery,
    });

    if (query === undefined) {
      return;
    }

    this.searchQuery = query.trim();
    this.onDidChangeTreeDataEmitter.fire();

    if (this.searchQuery) {
      const count = this.filterItems(this.items).length;
      void vscode.window.showInformationMessage(`Found ${count} bead(s) matching "${this.searchQuery}"`);
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.onDidChangeTreeDataEmitter.fire();
    void vscode.window.showInformationMessage('Search cleared');
  }

  async updateExternalReference(item: BeadItemData, newValue: string | undefined): Promise<void> {
    if (!this.document) {
      void vscode.window.showErrorMessage('Beads data is not loaded yet. Try refreshing the explorer.');
      return;
    }

    if (!item.raw || typeof item.raw !== 'object') {
      void vscode.window.showErrorMessage('Unable to update this bead entry because its data is not editable.');
      return;
    }

    const targetKey = item.externalReferenceKey ?? 'external_reference_id';
    const mutable = item.raw as Record<string, unknown>;

    if (newValue && newValue.trim().length > 0) {
      mutable[targetKey] = newValue;
    } else {
      delete mutable[targetKey];
    }

    try {
      await saveBeadsDocument(this.document);
      await this.refresh();
    } catch (error) {
      console.error('Failed to persist beads document', error);
      void vscode.window.showErrorMessage(formatError('Failed to save beads data file', error));
    }
  }

  async updateStatus(item: BeadItemData, newStatus: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beads');
    const configPath = config.get<string>('commandPath', 'bd');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
      return;
    }

    try {
      const commandPath = await findBdCommand(configPath);
      await execFileAsync(commandPath, ['update', item.id, '--status', newStatus], { cwd: projectRoot });
      await this.refresh();
      void vscode.window.showInformationMessage(`Updated status to: ${newStatus}`);
    } catch (error) {
      console.error('Failed to update status', error);
      void vscode.window.showErrorMessage(formatError('Failed to update status', error));
    }
  }

  async addLabel(item: BeadItemData, label: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beads');
    const configPath = config.get<string>('commandPath', 'bd');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
      return;
    }

    try {
      const commandPath = await findBdCommand(configPath);
      await execFileAsync(commandPath, ['label', 'add', item.id, label], { cwd: projectRoot });
      await this.refresh();
      void vscode.window.showInformationMessage(`Added label: ${label}`);
    } catch (error) {
      console.error('Failed to add label', error);
      void vscode.window.showErrorMessage(formatError('Failed to add label', error));
    }
  }

  async removeLabel(item: BeadItemData, label: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('beads');
    const configPath = config.get<string>('commandPath', 'bd');
    const projectRoot = resolveProjectRoot(config);

    if (!projectRoot) {
      void vscode.window.showErrorMessage('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
      return;
    }

    try {
      const commandPath = await findBdCommand(configPath);
      await execFileAsync(commandPath, ['label', 'remove', item.id, label], { cwd: projectRoot });
      await this.refresh();
      void vscode.window.showInformationMessage(`Removed label: ${label}`);
    } catch (error) {
      console.error('Failed to remove label', error);
      void vscode.window.showErrorMessage(formatError('Failed to remove label', error));
    }
  }

  private createTreeItem(item: BeadItemData): BeadTreeItem {
    const treeItem = new BeadTreeItem(item);
    treeItem.contextValue = 'bead';

    treeItem.command = {
      command: 'beads.openBead',
      title: 'Open Bead',
      arguments: [item],
    };

    return treeItem;
  }

  private ensureWatcher(filePath: string): void {
    if (this.watchedFilePath === filePath && this.fileWatcher) {
      return;
    }

    this.disposeWatcher();

    try {
      // Watch the .beads directory for any database file changes
      // This includes *.db, *.db-wal, and *.db-shm files
      const pattern = new vscode.RelativePattern(filePath, '*.{db,db-wal,db-shm}');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onChange = watcher.onDidChange(() => void this.refresh());
      const onCreate = watcher.onDidCreate(() => void this.refresh());
      const onDelete = watcher.onDidDelete(async () => {
        this.items = [];
        this.document = undefined;
        this.onDidChangeTreeDataEmitter.fire();
      });

      this.context.subscriptions.push(watcher, onChange, onCreate, onDelete);
      this.fileWatcher = watcher;
      this.watcherSubscriptions = [onChange, onCreate, onDelete];
      this.watchedFilePath = filePath;
    } catch (error) {
      console.warn('Failed to start watcher for beads database', error);
    }
  }

  private disposeWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    for (const subscription of this.watcherSubscriptions) {
      subscription.dispose();
    }
    this.watcherSubscriptions = [];
    this.watchedFilePath = undefined;
  }
}

class BeadTreeItem extends vscode.TreeItem {
  constructor(public readonly bead: BeadItemData) {
    // Show ID before title
    const label = `${bead.id} ${bead.title}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    const parts: string[] = [];
    if (bead.tags && bead.tags.length > 0) {
      parts.push(bead.tags.join(', '));
    }
    if (bead.externalReferenceId) {
      if (bead.externalReferenceDescription) {
        parts.push(`${bead.externalReferenceId} (${bead.externalReferenceDescription})`);
      } else {
        parts.push(bead.externalReferenceId);
      }
    }
    if (parts.length > 0) {
      this.description = parts.join(' · ');
    }

    this.tooltip = createTooltip(bead);

    // Use different icons based on status
    if (bead.status === 'closed') {
      this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    } else if (bead.status === 'in_progress') {
      this.iconPath = new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-event');
    }
  }
}

function resolveProjectRoot(config: vscode.WorkspaceConfiguration): string | undefined {
  const projectRootConfig = config.get<string>('projectRoot');
  if (projectRootConfig && projectRootConfig.trim().length > 0) {
    return projectRootConfig;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }

  return undefined;
}

function naturalSort(a: BeadItemData, b: BeadItemData): number {
  // Split IDs into parts (text and numbers)
  const aParts = a.id.split(/(\d+)/);
  const bParts = b.id.split(/(\d+)/);

  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];

    // Check if both parts are numeric
    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      // Compare as numbers
      if (aNum !== bNum) {
        return aNum - bNum;
      }
    } else {
      // Compare as strings
      if (aPart !== bPart) {
        return aPart.localeCompare(bPart);
      }
    }
  }

  // If all parts are equal, shorter ID comes first
  return aParts.length - bParts.length;
}

async function loadBeads(): Promise<{ items: BeadItemData[]; document: BeadsDocument; }> {
  const config = vscode.workspace.getConfiguration('beads');
  const projectRoot = resolveProjectRoot(config);
  const configPath = config.get<string>('commandPath', 'bd');

  if (!projectRoot) {
    throw new Error('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
  }

  try {
    // Find the bd command
    const commandPath = await findBdCommand(configPath);

    // Use beads CLI to query the database directly
    const { stdout } = await execFileAsync(commandPath, ['list', '--json'], {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large issue lists
    });

    // Parse the JSON output
    let beads: any[] = [];
    if (stdout && stdout.trim()) {
      const parsed = JSON.parse(stdout);
      beads = Array.isArray(parsed) ? parsed : [];
    }

    // Create a document structure for compatibility
    // Use the database path for file watching instead of JSONL
    const dbPath = path.join(projectRoot, '.beads');
    const document: BeadsDocument = {
      filePath: dbPath, // Watch the .beads directory for any db changes
      root: beads,
      beads
    };

    const items = beads.map((entry, index) => normalizeBead(entry, index));

    // Sort items using natural sort (handles numeric parts correctly)
    items.sort(naturalSort);

    return { items, document };
  } catch (error: any) {
    // Fallback to reading JSON file if CLI command fails
    console.warn('Failed to load beads via CLI, falling back to file reading:', error.message);
    return loadBeadsFromFile(projectRoot, config);
  }
}

async function loadBeadsFromFile(projectRoot: string, config: vscode.WorkspaceConfiguration): Promise<{ items: BeadItemData[]; document: BeadsDocument; }> {
  const dataFileConfig = config.get<string>('dataFile', '.beads/issues.jsonl');
  const resolvedDataFile = resolveDataFilePath(dataFileConfig, projectRoot);

  if (!resolvedDataFile) {
    throw new Error('Unable to resolve beads data file. Set "beads.projectRoot" or provide an absolute "beads.dataFile" path.');
  }

  const document = await readBeadsDocument(resolvedDataFile);
  const items = document.beads.map((entry, index) => normalizeBead(entry, index));

  // Sort items using natural sort (handles numeric parts correctly)
  items.sort(naturalSort);

  return { items, document };
}

async function readBeadsDocument(filePath: string): Promise<BeadsDocument> {
  const rawContent = await fs.readFile(filePath, 'utf8');

  // Check if it's JSONL format (each line is a JSON object)
  if (filePath.endsWith('.jsonl')) {
    const lines = rawContent.trim().split('\n').filter(line => line.trim().length > 0);
    const beads = lines.map(line => JSON.parse(line));
    return { filePath, root: beads, beads };
  }

  // Otherwise assume it's JSON format
  const root = JSON.parse(rawContent);
  const beads = extractBeads(root);

  if (!Array.isArray(beads)) {
    throw new Error('Beads data file does not contain a beads array.');
  }

  return { filePath, root, beads };
}

async function saveBeadsDocument(document: BeadsDocument): Promise<void> {
  // Check if it's JSONL format
  if (document.filePath.endsWith('.jsonl')) {
    const lines = document.beads.map(bead => JSON.stringify(bead)).join('\n');
    const content = lines.endsWith('\n') ? lines : `${lines}\n`;
    await fs.writeFile(document.filePath, content, 'utf8');
  } else {
    const serialized = JSON.stringify(document.root, null, 2);
    const content = serialized.endsWith('\n') ? serialized : `${serialized}\n`;
    await fs.writeFile(document.filePath, content, 'utf8');
  }
}

function getBeadDetailHtml(item: BeadItemData): string {
  const raw = item.raw as any;
  const description = raw?.description || '';
  const design = raw?.design || '';
  const acceptanceCriteria = raw?.acceptance_criteria || '';
  const notes = raw?.notes || '';
  const issueType = raw?.issue_type || '';
  const priority = raw?.priority || '';
  const createdAt = raw?.created_at ? new Date(raw.created_at).toLocaleString() : '';
  const updatedAt = raw?.updated_at ? new Date(raw.updated_at).toLocaleString() : '';
  const closedAt = raw?.closed_at ? new Date(raw.closed_at).toLocaleString() : '';
  const dependencies = raw?.dependencies || [];
  const assignee = raw?.assignee || '';
  const labels = raw?.labels || [];

  const statusColor = {
    'open': '#3794ff',
    'in_progress': '#f9c513',
    'blocked': '#f14c4c',
    'closed': '#73c991'
  }[item.status || 'open'] || '#666';

  const priorityLabel = ['', 'P1', 'P2', 'P3', 'P4'][priority] || '';

  // Format status for display
  const statusDisplay = item.status
    ? item.status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${item.id}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 16px;
            margin-bottom: 24px;
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
        }
        .issue-id {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
            margin-bottom: 8px;
        }
        .edit-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }
        .edit-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 16px 0;
        }
        .metadata {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            margin-top: 12px;
            align-items: center;
        }
        .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-badge {
            background-color: ${statusColor}22;
            color: ${statusColor};
            border: 1px solid ${statusColor}44;
            position: relative;
        }
        .status-badge.editable {
            cursor: pointer;
            padding-right: 24px;
        }
        .status-badge.editable:hover {
            opacity: 0.8;
        }
        .status-badge.editable::after {
            content: '▾';
            position: absolute;
            right: 6px;
            top: 50%;
            transform: translateY(-50%);
        }
        .status-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            min-width: 150px;
        }
        .status-dropdown.show {
            display: block;
        }
        .status-option {
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.1s;
        }
        .status-option:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .status-option:first-child {
            border-radius: 4px 4px 0 0;
        }
        .status-option:last-child {
            border-radius: 0 0 4px 4px;
        }
        .status-wrapper {
            position: relative;
        }
        .type-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .priority-badge {
            background-color: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
        }
        .section {
            margin: 24px 0;
        }
        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
        .description {
            white-space: pre-wrap;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 12px 16px;
            border-radius: 4px;
        }
        .meta-item {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
        }
        .meta-label {
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            min-width: 120px;
        }
        .meta-value {
            color: var(--vscode-foreground);
        }
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .tag {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .tag.editable {
            padding-right: 8px;
        }
        .tag-remove {
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            opacity: 0.7;
            line-height: 1;
        }
        .tag-remove:hover {
            opacity: 1;
            color: var(--vscode-errorForeground);
        }
        .dependency-item {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 8px;
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
        .dependency-type {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            font-weight: 600;
        }
        .empty {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-top">
            <div class="issue-id">${item.id}</div>
            <button class="edit-button" id="editButton">Edit</button>
        </div>
        <h1 class="title">${escapeHtml(item.title)}</h1>
        <div class="metadata">
            <div class="status-wrapper">
                <span class="badge status-badge" id="statusBadge" data-status="${item.status || 'open'}">${statusDisplay || 'Open'}</span>
                <div class="status-dropdown" id="statusDropdown">
                    <div class="status-option" data-status="open">Open</div>
                    <div class="status-option" data-status="in_progress">In Progress</div>
                    <div class="status-option" data-status="blocked">Blocked</div>
                    <div class="status-option" data-status="closed">Closed</div>
                </div>
            </div>
            ${issueType ? `<span class="badge type-badge">${issueType.toUpperCase()}</span>` : ''}
            ${priorityLabel ? `<span class="badge priority-badge">${priorityLabel}</span>` : ''}
        </div>
    </div>

    ${description ? `
    <div class="section">
        <div class="section-title">Description</div>
        <div class="description">${escapeHtml(description)}</div>
    </div>
    ` : ''}

    ${design ? `
    <div class="section">
        <div class="section-title">Design</div>
        <div class="description">${escapeHtml(design)}</div>
    </div>
    ` : ''}

    ${acceptanceCriteria ? `
    <div class="section">
        <div class="section-title">Acceptance Criteria</div>
        <div class="description">${escapeHtml(acceptanceCriteria)}</div>
    </div>
    ` : ''}

    ${notes ? `
    <div class="section">
        <div class="section-title">Notes</div>
        <div class="description">${escapeHtml(notes)}</div>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-title">Details</div>
        ${assignee ? `<div class="meta-item"><span class="meta-label">Assignee:</span><span class="meta-value">${escapeHtml(assignee)}</span></div>` : ''}
        ${item.externalReferenceId ? `<div class="meta-item"><span class="meta-label">External ID:</span><span class="meta-value">${escapeHtml(item.externalReferenceId)}</span></div>` : ''}
        ${item.externalReferenceDescription ? `<div class="meta-item"><span class="meta-label">External Desc:</span><span class="meta-value">${escapeHtml(item.externalReferenceDescription)}</span></div>` : ''}
        ${createdAt ? `<div class="meta-item"><span class="meta-label">Created:</span><span class="meta-value">${createdAt}</span></div>` : ''}
        ${updatedAt ? `<div class="meta-item"><span class="meta-label">Updated:</span><span class="meta-value">${updatedAt}</span></div>` : ''}
        ${closedAt ? `<div class="meta-item"><span class="meta-label">Closed:</span><span class="meta-value">${closedAt}</span></div>` : ''}
    </div>

    <div class="section">
        <div class="section-title">Labels</div>
        <div class="tags" id="labelsContainer">
            ${labels && labels.length > 0 ? labels.map((label: string) => `<span class="tag" data-label="${escapeHtml(label)}">${escapeHtml(label)}<span class="tag-remove" style="display: none;">×</span></span>`).join('') : '<span class="empty">No labels</span>'}
        </div>
        <div style="margin-top: 12px; display: none;" id="labelActions">
            <button class="edit-button" id="addInReviewButton" style="margin-right: 8px;">
                <span id="inReviewButtonText">Mark as In Review</span>
            </button>
            <button class="edit-button" id="addLabelButton">Add Label</button>
        </div>
    </div>

    ${dependencies && dependencies.length > 0 ? `
    <div class="section">
        <div class="section-title">Dependencies</div>
        ${dependencies.map((dep: any) => `
            <div class="dependency-item">
                <div class="dependency-type">${dep.dep_type || dep.type || 'blocks'}</div>
                <strong>${dep.id || dep.depends_on_id || dep.issue_id}</strong>
                ${dep.title ? `<div style="margin-top: 4px;">${escapeHtml(dep.title)}</div>` : ''}
                ${dep.status ? `<span class="badge status-badge" style="margin-top: 4px; display: inline-block;">${dep.status.toUpperCase()}</span>` : ''}
            </div>
        `).join('')}
    </div>
    ` : ''}

    <script>
        const vscode = acquireVsCodeApi();
        let isEditMode = false;

        const editButton = document.getElementById('editButton');
        const statusBadge = document.getElementById('statusBadge');
        const statusDropdown = document.getElementById('statusDropdown');

        const labelActions = document.getElementById('labelActions');
        const addInReviewButton = document.getElementById('addInReviewButton');
        const addLabelButton = document.getElementById('addLabelButton');
        const inReviewButtonText = document.getElementById('inReviewButtonText');
        const labelsContainer = document.getElementById('labelsContainer');

        console.log('DEBUG: labelActions element:', labelActions);
        console.log('DEBUG: addInReviewButton element:', addInReviewButton);

        const currentLabels = ${JSON.stringify(labels || [])};
        const hasInReview = currentLabels.includes('in-review');

        if (hasInReview) {
            inReviewButtonText.textContent = 'Remove In Review';
        }

        editButton.addEventListener('click', () => {
            isEditMode = !isEditMode;

            if (isEditMode) {
                editButton.textContent = 'Done';
                statusBadge.classList.add('editable');
                labelActions.style.display = 'block';

                // Show remove buttons on labels
                document.querySelectorAll('.tag-remove').forEach(btn => {
                    btn.style.display = 'inline';
                });
                document.querySelectorAll('.tag').forEach(tag => {
                    if (!tag.classList.contains('empty')) {
                        tag.classList.add('editable');
                    }
                });
            } else {
                editButton.textContent = 'Edit';
                statusBadge.classList.remove('editable');
                statusDropdown.classList.remove('show');
                labelActions.style.display = 'none';

                // Hide remove buttons on labels
                document.querySelectorAll('.tag-remove').forEach(btn => {
                    btn.style.display = 'none';
                });
                document.querySelectorAll('.tag').forEach(tag => {
                    tag.classList.remove('editable');
                });
            }
        });

        statusBadge.addEventListener('click', () => {
            if (isEditMode) {
                statusDropdown.classList.toggle('show');
            }
        });

        document.querySelectorAll('.status-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const newStatus = e.target.getAttribute('data-status');

                // Send message to extension
                vscode.postMessage({
                    command: 'updateStatus',
                    status: newStatus,
                    issueId: '${item.id}'
                });

                // Close dropdown
                statusDropdown.classList.remove('show');
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!statusBadge.contains(e.target) && !statusDropdown.contains(e.target)) {
                statusDropdown.classList.remove('show');
            }
        });

        // Handle "In Review" toggle button
        addInReviewButton.addEventListener('click', () => {
            const hasInReview = currentLabels.includes('in-review');

            if (hasInReview) {
                vscode.postMessage({
                    command: 'removeLabel',
                    label: 'in-review',
                    issueId: '${item.id}'
                });
            } else {
                vscode.postMessage({
                    command: 'addLabel',
                    label: 'in-review',
                    issueId: '${item.id}'
                });
            }
        });

        // Handle custom label addition
        addLabelButton.addEventListener('click', () => {
            const label = prompt('Enter label name:');
            if (label && label.trim()) {
                vscode.postMessage({
                    command: 'addLabel',
                    label: label.trim(),
                    issueId: '${item.id}'
                });
            }
        });

        // Handle label removal
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                const tagElement = e.target.closest('.tag');
                const label = tagElement.getAttribute('data-label');

                if (label) {
                    vscode.postMessage({
                        command: 'removeLabel',
                        label: label,
                        issueId: '${item.id}'
                    });
                }
            }
        });
    </script>
</body>
</html>`;
}

function getDependencyTreeHtml(items: BeadItemData[]): string {
  // Build dependency graph
  const nodeMap = new Map<string, BeadItemData>();
  const edges: Array<{from: string, to: string, type: string}> = [];

  items.forEach(item => {
    nodeMap.set(item.id, item);
    const raw = item.raw as any;
    const dependencies = raw?.dependencies || [];

    dependencies.forEach((dep: any) => {
      const depType = dep.dep_type || dep.type || 'related';
      const targetId = dep.id || dep.depends_on_id || dep.issue_id;
      if (targetId) {
        edges.push({
          from: item.id,
          to: targetId,
          type: depType
        });
      }
    });
  });

  // Serialize data for JavaScript, sorted by ID (descending order naturally)
  const sortedNodes = Array.from(nodeMap.entries())
    .sort(([idA], [idB]) => {
      // Extract numeric parts for proper numerical sorting
      const numA = parseInt(idA.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(idB.match(/\d+/)?.[0] || '0', 10);
      return numA - numB;
    })
    .map(([id, item]) => ({
      id,
      title: item.title,
      status: item.status || 'open'
    }));

  const nodesJson = JSON.stringify(sortedNodes);
  const edgesJson = JSON.stringify(edges);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beads Dependency Tree</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            overflow: hidden;
        }

        #container {
            width: 100%;
            height: calc(100vh - 60px);
            position: relative;
            overflow: auto;
        }

        #canvas {
            position: absolute;
            top: 0;
            left: 0;
            min-width: 100%;
            min-height: 100%;
            z-index: 10;
        }

        .node {
            position: absolute;
            padding: 12px 16px;
            border-radius: 8px;
            border: 2px solid;
            background-color: #1e1e1e;
            cursor: move;
            min-width: 120px;
            text-align: center;
            transition: box-shadow 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 10;
            user-select: none;
        }

        .node:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 20;
        }

        .node.dragging {
            opacity: 0.8;
            z-index: 1000;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);
        }

        .node.status-closed {
            border-color: #73c991;
            background-color: #1e1e1e;
        }

        .node.status-in_progress {
            border-color: #f9c513;
            background-color: #1e1e1e;
        }

        .node.status-open {
            border-color: #ff8c00;
            background-color: #1e1e1e;
        }

        .node.status-blocked {
            border-color: #f14c4c;
            background-color: #1e1e1e;
        }

        .node-id {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 4px;
        }

        .node-title {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 200px;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;
        }

        .status-indicator.closed {
            background-color: #73c991;
        }

        .status-indicator.in_progress {
            background-color: #f9c513;
        }

        .status-indicator.open {
            background-color: #ff8c00;
        }

        .status-indicator.blocked {
            background-color: #f14c4c;
        }

        svg {
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 0;
        }

        .edge {
            stroke: var(--vscode-panel-border);
            stroke-width: 2;
            fill: none;
            marker-end: url(#arrowhead);
            opacity: 0.8;
        }

        .edge.blocks {
            stroke: #f14c4c;
            stroke-width: 2.5;
        }

        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 8px;
        }

        .control-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }

        .control-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .legend {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            font-size: 11px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
        }

        .legend-item:last-child {
            margin-bottom: 0;
        }
    </style>
</head>
<body>
    <div class="controls">
        <button class="control-button" onclick="resetZoom()">Reset View</button>
        <button class="control-button" onclick="autoLayout()">Auto Layout</button>
    </div>

    <div class="legend">
        <div class="legend-item">
            <span class="status-indicator closed"></span>
            <span>Closed</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator in_progress"></span>
            <span>In Progress</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator open"></span>
            <span>Open</span>
        </div>
        <div class="legend-item">
            <span class="status-indicator blocked"></span>
            <span>Blocked</span>
        </div>
    </div>

    <div id="container">
        <svg id="svg"></svg>
        <div id="canvas"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const nodes = ${nodesJson};
        const edges = ${edgesJson};

        const nodeElements = new Map();
        const nodePositions = new Map();

        // Restore previous state if available
        const previousState = vscode.getState() || {};
        let savedPositions = previousState.nodePositions || {};

        // Drag state
        let draggedNode = null;
        let draggedNodeId = null;
        let dragOffset = {x: 0, y: 0};
        let isDragging = false;

        // Simple tree layout algorithm
        function calculateLayout() {
            const levels = new Map();
            const visited = new Set();
            const outDegree = new Map();

            // Calculate out-degrees (how many dependencies each node has)
            nodes.forEach(node => outDegree.set(node.id, 0));
            edges.forEach(edge => {
                outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
            });

            // Find leaf nodes (nodes with no outgoing edges - no dependencies)
            // These should be at the TOP of the tree
            const leaves = nodes.filter(node => outDegree.get(node.id) === 0);

            // If no leaves, pick nodes with minimal out-degree
            if (leaves.length === 0) {
                const minOutDegree = Math.min(...Array.from(outDegree.values()));
                leaves.push(...nodes.filter(node => outDegree.get(node.id) === minOutDegree));
            }

            // BFS to assign levels, traversing backwards through dependencies
            const queue = leaves.map(node => ({node, level: 0}));
            leaves.forEach(node => visited.add(node.id));

            while (queue.length > 0) {
                const {node, level} = queue.shift();

                if (!levels.has(level)) {
                    levels.set(level, []);
                }
                levels.get(level).push(node);

                // Find parents (nodes that depend on this node)
                const parents = edges
                    .filter(edge => edge.to === node.id)
                    .map(edge => nodes.find(n => n.id === edge.from))
                    .filter(n => n && !visited.has(n.id));

                parents.forEach(parent => {
                    visited.add(parent.id);
                    queue.push({node: parent, level: level + 1});
                });
            }

            // Add unvisited nodes
            nodes.forEach(node => {
                if (!visited.has(node.id)) {
                    const maxLevel = Math.max(...Array.from(levels.keys()), -1);
                    const level = maxLevel + 1;
                    if (!levels.has(level)) {
                        levels.set(level, []);
                    }
                    levels.get(level).push(node);
                }
            });

            // Calculate positions
            const horizontalSpacing = 250;
            const verticalSpacing = 120;
            const startX = 100;
            const startY = 100;

            levels.forEach((nodesInLevel, level) => {
                // Sort nodes within each level by their numeric ID
                const sortedNodes = nodesInLevel.sort((a, b) => {
                    const numA = parseInt(a.id.match(/\\d+/)?.[0] || '0', 10);
                    const numB = parseInt(b.id.match(/\\d+/)?.[0] || '0', 10);
                    return numA - numB;
                });

                sortedNodes.forEach((node, index) => {
                    // Use saved position if available, otherwise calculate
                    if (savedPositions[node.id]) {
                        nodePositions.set(node.id, savedPositions[node.id]);
                    } else {
                        const x = startX + (index * horizontalSpacing);
                        const y = startY + (level * verticalSpacing);
                        nodePositions.set(node.id, {x, y});
                    }
                });
            });
        }

        function savePositions() {
            const positions = {};
            nodePositions.forEach((pos, id) => {
                positions[id] = pos;
            });
            vscode.setState({ nodePositions: positions });
        }

        function createNode(node) {
            const div = document.createElement('div');
            div.className = \`node status-\${node.status}\`;
            div.innerHTML = \`
                <div class="node-id">
                    <span class="status-indicator \${node.status}"></span>
                    \${node.id}
                </div>
                <div class="node-title" title="\${node.title}">\${node.title}</div>
            \`;
            div.dataset.nodeId = node.id;

            // Mouse down to start dragging
            div.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Only left mouse button

                isDragging = true;
                draggedNode = div;
                draggedNodeId = node.id;

                const pos = nodePositions.get(node.id);
                dragOffset.x = e.clientX - pos.x;
                dragOffset.y = e.clientY - pos.y;

                div.classList.add('dragging');
                e.preventDefault();
                e.stopPropagation();
            });

            // Click to open (only if not dragged)
            div.addEventListener('click', (e) => {
                if (!isDragging) {
                    vscode.postMessage({
                        command: 'openBead',
                        beadId: node.id
                    });
                }
            });

            return div;
        }

        function drawEdge(from, to, type) {
            const fromPos = nodePositions.get(from);
            const toPos = nodePositions.get(to);

            if (!fromPos || !toPos) return '';

            const fromEl = nodeElements.get(from);
            const toEl = nodeElements.get(to);

            if (!fromEl || !toEl) return '';

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const containerRect = document.getElementById('canvas').getBoundingClientRect();

            const x1 = fromPos.x + (fromRect.width / 2);
            const y1 = fromPos.y + fromRect.height;
            const x2 = toPos.x + (toRect.width / 2);
            const y2 = toPos.y;

            // Draw curved line
            const midY = (y1 + y2) / 2;
            const path = \`M \${x1} \${y1} C \${x1} \${midY}, \${x2} \${midY}, \${x2} \${y2}\`;

            return \`<path d="\${path}" class="edge \${type}" />\`;
        }

        function render() {
            const canvas = document.getElementById('canvas');
            const svg = document.getElementById('svg');

            // Clear
            canvas.innerHTML = '';
            nodeElements.clear();

            // Calculate layout
            calculateLayout();

            // Create nodes
            nodes.forEach(node => {
                const div = createNode(node);
                const pos = nodePositions.get(node.id);
                div.style.left = pos.x + 'px';
                div.style.top = pos.y + 'px';
                canvas.appendChild(div);
                nodeElements.set(node.id, div);
            });

            // Calculate SVG size
            let maxX = 0, maxY = 0;
            nodePositions.forEach(pos => {
                maxX = Math.max(maxX, pos.x + 250);
                maxY = Math.max(maxY, pos.y + 100);
            });

            svg.setAttribute('width', maxX);
            svg.setAttribute('height', maxY);
            canvas.style.width = maxX + 'px';
            canvas.style.height = maxY + 'px';

            // Draw edges
            setTimeout(() => {
                const edgePaths = edges.map(edge =>
                    drawEdge(edge.from, edge.to, edge.type)
                ).join('');

                svg.innerHTML = \`
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="10"
                                refX="9" refY="3" orient="auto">
                            <polygon points="0 0, 10 3, 0 6"
                                     fill="var(--vscode-panel-border)" />
                        </marker>
                    </defs>
                    \${edgePaths}
                \`;
            }, 100);
        }

        function resetZoom() {
            const container = document.getElementById('container');

            // Calculate bounding box of all nodes
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            nodePositions.forEach(pos => {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + 250); // account for node width
                maxY = Math.max(maxY, pos.y + 100); // account for node height
            });

            // Calculate center point
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            // Calculate viewport center
            const viewportCenterX = container.clientWidth / 2;
            const viewportCenterY = container.clientHeight / 2;

            // Scroll to center the graph
            container.scrollTo({
                left: centerX - viewportCenterX,
                top: centerY - viewportCenterY,
                behavior: 'smooth'
            });
        }

        function autoLayout() {
            // Clear saved positions and re-render
            vscode.setState({ nodePositions: {} });
            savedPositions = {};
            nodePositions.clear();
            render();
        }

        function redrawEdges() {
            const svg = document.getElementById('svg');
            const edgePaths = edges.map(edge =>
                drawEdge(edge.from, edge.to, edge.type)
            ).join('');

            svg.innerHTML = \`
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="10"
                            refX="9" refY="3" orient="auto">
                        <polygon points="0 0, 10 3, 0 6"
                                 fill="var(--vscode-panel-border)" />
                    </marker>
                </defs>
                \${edgePaths}
            \`;
        }

        // Global mouse move handler for dragging
        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !draggedNode || !draggedNodeId) return;

            const container = document.getElementById('container');
            const scrollLeft = container.scrollLeft;
            const scrollTop = container.scrollTop;

            // Calculate new position
            const x = e.clientX - dragOffset.x + scrollLeft;
            const y = e.clientY - dragOffset.y + scrollTop;

            // Update position
            nodePositions.set(draggedNodeId, {x, y});
            draggedNode.style.left = x + 'px';
            draggedNode.style.top = y + 'px';

            // Redraw edges in real-time
            redrawEdges();
        });

        // Global mouse up handler to end dragging
        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;

            if (draggedNode) {
                draggedNode.classList.remove('dragging');
            }

            // Save positions to state
            savePositions();

            // Reset drag state
            draggedNode = null;
            draggedNodeId = null;

            // Small delay to prevent click event from firing
            setTimeout(() => {
                isDragging = false;
            }, 10);
        });

        // Initial render
        render();
    </script>
</body>
</html>`;
}

async function openBead(item: BeadItemData, provider: BeadsTreeDataProvider): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'beadDetail',
    item.id,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = getBeadDetailHtml(item);

  // Register this panel so it can be refreshed when data changes
  provider.registerPanel(item.id, panel);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'updateStatus': {
          await provider.updateStatus(item, message.status);
          break;
        }
        case 'addLabel': {
          await provider.addLabel(item, message.label);
          break;
        }
        case 'removeLabel': {
          await provider.removeLabel(item, message.label);
          break;
        }
      }
    }
  );
}

async function createBead(): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter a title for the new bead',
    placeHolder: 'Implement feature X',
  });

  if (!name) {
    return;
  }

  const config = vscode.workspace.getConfiguration('beads');
  const configPath = config.get<string>('commandPath', 'bd');
  const projectRoot = resolveProjectRoot(config);

  try {
    const commandPath = await findBdCommand(configPath);
    await execFileAsync(commandPath, ['create', name], { cwd: projectRoot });
    void vscode.commands.executeCommand('beads.refresh');
    void vscode.window.showInformationMessage(`Created bead: ${name}`);
  } catch (error) {
    void vscode.window.showErrorMessage(formatError('Failed to create bead', error));
  }
}

async function visualizeDependencies(provider: BeadsTreeDataProvider): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'beadDependencyTree',
    'Beads Dependency Tree',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // Get all items from the provider
  const items = provider['items'] as BeadItemData[];

  panel.webview.html = getDependencyTreeHtml(items);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'openBead': {
          const item = items.find((i: BeadItemData) => i.id === message.beadId);
          if (item) {
            await openBead(item, provider);
          }
          break;
        }
      }
    }
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new BeadsTreeDataProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('beadsExplorer', provider),
    vscode.commands.registerCommand('beads.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('beads.search', () => provider.search()),
    vscode.commands.registerCommand('beads.clearSearch', () => provider.clearSearch()),
    vscode.commands.registerCommand('beads.openBead', (item: BeadItemData) => openBead(item, provider)),
    vscode.commands.registerCommand('beads.createBead', () => createBead()),
    vscode.commands.registerCommand('beads.visualizeDependencies', () => visualizeDependencies(provider)),
    vscode.commands.registerCommand('beads.editExternalReference', async (item: BeadItemData) => {
      if (!item) {
        return;
      }

      // Construct the current value from ID and description
      const currentValue = item.externalReferenceId
        ? (item.externalReferenceDescription
          ? `${item.externalReferenceId}:${item.externalReferenceDescription}`
          : item.externalReferenceId)
        : '';

      const newValue = await vscode.window.showInputBox({
        prompt: 'Set the external reference for this bead (format: ID:description)',
        value: currentValue,
        placeHolder: 'Enter "ID:description" or leave empty to remove',
      });

      if (newValue === undefined) {
        return;
      }

      await provider.updateExternalReference(item, newValue.trim().length > 0 ? newValue.trim() : undefined);
    }),
  );

  void provider.refresh();
}

export function deactivate(): void {
  // no-op
}
