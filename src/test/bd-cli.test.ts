/**
 * BD CLI Integration Tests
 *
 * These tests can run standalone without VSCode test environment.
 * Run with: npm run test:bd-cli
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('BD CLI Standalone Tests', function() {
  let testWorkspace: string;
  let bdCommand: string;

  // Increase timeout for setup
  this.timeout(30000);

  before(async function() {
    // Find bd command
    bdCommand = await findBdCommand();
    console.log(`Using bd command: ${bdCommand}`);

    // Create temporary test workspace
    testWorkspace = path.join(os.tmpdir(), `beads-vscode-test-${Date.now()}`);
    await fs.mkdir(testWorkspace, { recursive: true });
    console.log(`Created test workspace: ${testWorkspace}`);

    // Initialize bd in the test workspace
    try {
      await execFileAsync(bdCommand, ['init', '--quiet'], { cwd: testWorkspace });
      console.log('Initialized bd in test workspace');
    } catch (error: any) {
      console.error('Failed to initialize bd:', error.message);
      throw error;
    }
  });

  after(async function() {
    // Clean up test workspace
    if (testWorkspace) {
      try {
        await fs.rm(testWorkspace, { recursive: true, force: true });
        console.log('Cleaned up test workspace');
      } catch (error) {
        console.warn('Failed to clean up test workspace:', error);
      }
    }
  });

  it('should list issues and return valid JSON', async function() {
    const { stdout } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(stdout);
    // bd list returns null when empty, or an array of issues
    assert.ok(issues === null || Array.isArray(issues), 'bd list should return null or array');
  });

  it('should create a new issue', async function() {
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Test issue', '--priority', '1'],
      { cwd: testWorkspace }
    );

    assert.ok(createOutput.includes('Created'));

    // Verify issue was created
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].title, 'Test issue');
    assert.strictEqual(issues[0].priority, 1);
    assert.strictEqual(issues[0].status, 'open');
  });

  it('should update issue status', async function() {
    // Create an issue first
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Status test issue'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    assert.ok(issueIdMatch, 'Should extract issue ID from create output');
    const issueId = issueIdMatch![1];

    // Update status
    await execFileAsync(bdCommand, ['update', issueId, '--status', 'in_progress'], { cwd: testWorkspace });

    // Verify status changed
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.strictEqual(updatedIssue.status, 'in_progress');
  });

  it('should add a label to issue', async function() {
    // Create an issue first
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Label test issue'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    // Add label
    await execFileAsync(bdCommand, ['label', 'add', issueId, 'test-label'], { cwd: testWorkspace });

    // Verify label was added
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const labeledIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(labeledIssue);
    assert.ok(Array.isArray(labeledIssue.labels));
    assert.ok(labeledIssue.labels.includes('test-label'));
  });

  it('should remove a label from issue', async function() {
    // Create an issue and add a label
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Label remove test'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    await execFileAsync(bdCommand, ['label', 'add', issueId, 'temp-label'], { cwd: testWorkspace });

    // Remove label
    await execFileAsync(bdCommand, ['label', 'remove', issueId, 'temp-label'], { cwd: testWorkspace });

    // Verify label was removed
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const updatedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(updatedIssue);
    assert.ok(!updatedIssue.labels || !updatedIssue.labels.includes('temp-label'));
  });

  it('should close an issue', async function() {
    // Create an issue
    const { stdout: createOutput } = await execFileAsync(
      bdCommand,
      ['create', 'Close test issue'],
      { cwd: testWorkspace }
    );
    const issueIdMatch = createOutput.match(/Created issue: ([\w-]+)/);
    const issueId = issueIdMatch![1];

    // Close the issue
    await execFileAsync(bdCommand, ['close', issueId], { cwd: testWorkspace });

    // Verify issue was closed
    const { stdout: listOutput } = await execFileAsync(bdCommand, ['list', '--json'], { cwd: testWorkspace });
    const issues = JSON.parse(listOutput);
    const closedIssue = issues.find((i: any) => i.id === issueId);
    assert.ok(closedIssue);
    assert.strictEqual(closedIssue.status, 'closed');
  });

  it('should return statistics', async function() {
    const { stdout } = await execFileAsync(bdCommand, ['stats'], { cwd: testWorkspace });
    // bd stats doesn't have --json flag, so we just verify it runs successfully
    // and returns some text output
    assert.ok(stdout.length > 0, 'bd stats should return output');
    assert.ok(stdout.includes('total') || stdout.includes('Total'), 'Output should mention total');
  });
});

async function findBdCommand(): Promise<string> {
  // Try 'bd' in PATH first
  try {
    await execFileAsync('bd', ['version']);
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

  throw new Error('bd command not found. Please install beads CLI');
}
