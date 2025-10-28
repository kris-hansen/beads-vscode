import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

suite('File Handling Test Suite', () => {
  let tempDir: string;

  setup(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'beads-test-'));
  });

  teardown(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.error('Failed to clean up temp directory:', err);
    }
  });

  suite('JSONL Format', () => {
    test('should read JSONL file with multiple entries', async () => {
      const jsonlPath = path.join(tempDir, 'test.jsonl');
      const content = [
        '{"id":"BEAD-1","title":"First Bead","status":"open"}',
        '{"id":"BEAD-2","title":"Second Bead","status":"closed"}'
      ].join('\n');

      await fs.writeFile(jsonlPath, content, 'utf8');
      const readContent = await fs.readFile(jsonlPath, 'utf8');
      const lines = readContent.trim().split('\n');

      assert.strictEqual(lines.length, 2);
      const first = JSON.parse(lines[0]);
      assert.strictEqual(first.id, 'BEAD-1');
      assert.strictEqual(first.title, 'First Bead');
    });

    test('should write JSONL file with proper line endings', async () => {
      const jsonlPath = path.join(tempDir, 'test.jsonl');
      const beads = [
        { id: 'BEAD-1', title: 'First' },
        { id: 'BEAD-2', title: 'Second' }
      ];

      const lines = beads.map(bead => JSON.stringify(bead)).join('\n');
      const content = lines.endsWith('\n') ? lines : `${lines}\n`;
      await fs.writeFile(jsonlPath, content, 'utf8');

      const readContent = await fs.readFile(jsonlPath, 'utf8');
      assert.ok(readContent.endsWith('\n'), 'File should end with newline');

      const parsedLines = readContent.trim().split('\n').map(line => JSON.parse(line));
      assert.strictEqual(parsedLines.length, 2);
      assert.strictEqual(parsedLines[0].id, 'BEAD-1');
    });

    test('should handle empty lines in JSONL', async () => {
      const jsonlPath = path.join(tempDir, 'test.jsonl');
      const content = [
        '{"id":"BEAD-1","title":"First"}',
        '',
        '{"id":"BEAD-2","title":"Second"}',
        ''
      ].join('\n');

      await fs.writeFile(jsonlPath, content, 'utf8');
      const readContent = await fs.readFile(jsonlPath, 'utf8');
      const lines = readContent.trim().split('\n').filter(line => line.trim().length > 0);

      assert.strictEqual(lines.length, 2);
    });
  });

  suite('JSON Format', () => {
    test('should read JSON file with beads array', async () => {
      const jsonPath = path.join(tempDir, 'test.json');
      const content = JSON.stringify({
        beads: [
          { id: 'BEAD-1', title: 'First' },
          { id: 'BEAD-2', title: 'Second' }
        ]
      }, null, 2);

      await fs.writeFile(jsonPath, content, 'utf8');
      const readContent = await fs.readFile(jsonPath, 'utf8');
      const data = JSON.parse(readContent);

      assert.ok(Array.isArray(data.beads));
      assert.strictEqual(data.beads.length, 2);
      assert.strictEqual(data.beads[0].id, 'BEAD-1');
    });

    test('should write JSON file with proper formatting', async () => {
      const jsonPath = path.join(tempDir, 'test.json');
      const data = {
        beads: [
          { id: 'BEAD-1', title: 'First' }
        ]
      };

      const serialized = JSON.stringify(data, null, 2);
      const content = serialized.endsWith('\n') ? serialized : `${serialized}\n`;
      await fs.writeFile(jsonPath, content, 'utf8');

      const readContent = await fs.readFile(jsonPath, 'utf8');
      assert.ok(readContent.endsWith('\n'), 'File should end with newline');

      const parsed = JSON.parse(readContent);
      assert.deepStrictEqual(parsed, data);
    });

    test('should handle nested project structure', async () => {
      const jsonPath = path.join(tempDir, 'test.json');
      const content = JSON.stringify({
        project: {
          name: 'Test Project',
          beads: [
            { id: 'BEAD-1', title: 'First' }
          ]
        }
      }, null, 2);

      await fs.writeFile(jsonPath, content, 'utf8');
      const readContent = await fs.readFile(jsonPath, 'utf8');
      const data = JSON.parse(readContent);

      assert.ok(data.project);
      assert.ok(Array.isArray(data.project.beads));
      assert.strictEqual(data.project.beads[0].id, 'BEAD-1');
    });
  });
});
