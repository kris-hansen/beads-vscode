import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
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

    return this.items.map((item) => this.createTreeItem(item));
  }

  async refresh(): Promise<void> {
    try {
      const result = await loadBeads();
      this.items = result.items;
      this.document = result.document;
      this.ensureWatcher(result.document.filePath);
      this.onDidChangeTreeDataEmitter.fire();
    } catch (error) {
      console.error('Failed to refresh beads', error);
      void vscode.window.showErrorMessage(formatError('Unable to refresh beads list', error));
    }
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
    if (!this.document) {
      void vscode.window.showErrorMessage('Beads data is not loaded yet. Try refreshing the explorer.');
      return;
    }

    if (!item.raw || typeof item.raw !== 'object') {
      void vscode.window.showErrorMessage('Unable to update this bead entry because its data is not editable.');
      return;
    }

    const mutable = item.raw as Record<string, unknown>;
    mutable['status'] = newStatus;

    try {
      await saveBeadsDocument(this.document);
      await this.refresh();
      void vscode.window.showInformationMessage(`Updated status to: ${newStatus}`);
    } catch (error) {
      console.error('Failed to persist beads document', error);
      void vscode.window.showErrorMessage(formatError('Failed to save beads data file', error));
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
  const commandPath = config.get<string>('commandPath', 'bd');

  if (!projectRoot) {
    throw new Error('Unable to resolve project root. Set "beads.projectRoot" or open a workspace folder.');
  }

  try {
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

    <script>
        const vscode = acquireVsCodeApi();
        let isEditMode = false;

        const editButton = document.getElementById('editButton');
        const statusBadge = document.getElementById('statusBadge');
        const statusDropdown = document.getElementById('statusDropdown');

        editButton.addEventListener('click', () => {
            isEditMode = !isEditMode;

            if (isEditMode) {
                editButton.textContent = 'Done';
                statusBadge.classList.add('editable');
            } else {
                editButton.textContent = 'Edit';
                statusBadge.classList.remove('editable');
                statusDropdown.classList.remove('show');
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
    </script>

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

    ${labels && labels.length > 0 ? `
    <div class="section">
        <div class="section-title">Labels</div>
        <div class="tags">
            ${labels.map((label: string) => `<span class="tag">${escapeHtml(label)}</span>`).join('')}
        </div>
    </div>
    ` : ''}

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

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'updateStatus': {
          await provider.updateStatus(item, message.status);
          // Refresh the webview with updated data
          await provider.refresh();
          // Find the updated item
          const updatedItem = provider['items'].find((i: BeadItemData) => i.id === item.id);
          if (updatedItem) {
            panel.webview.html = getBeadDetailHtml(updatedItem);
          }
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
  const commandPath = config.get<string>('commandPath', 'beads');
  const projectRoot = resolveProjectRoot(config);

  try {
    await execFileAsync(commandPath, ['create', name], { cwd: projectRoot });
    void vscode.commands.executeCommand('beads.refresh');
    void vscode.window.showInformationMessage(`Created bead: ${name}`);
  } catch (error) {
    void vscode.window.showErrorMessage(formatError('Failed to create bead', error));
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new BeadsTreeDataProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('beadsExplorer', provider),
    vscode.commands.registerCommand('beads.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('beads.openBead', (item: BeadItemData) => openBead(item, provider)),
    vscode.commands.registerCommand('beads.createBead', () => createBead()),
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
