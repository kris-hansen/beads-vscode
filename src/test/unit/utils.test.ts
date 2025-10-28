import * as assert from 'assert';
import {
  normalizeBead,
  pickValue,
  pickFirstKey,
  pickTags,
  resolveDataFilePath,
  extractBeads,
  formatError,
  escapeHtml
} from '../../utils';

describe('Utility Functions', () => {

  describe('pickValue', () => {
    it('should return first matching key value', () => {
      const entry = { title: 'Test Title', name: 'Test Name' };
      const result = pickValue(entry, ['title', 'name']);
      assert.strictEqual(result, 'Test Title');
    });

    it('should return second key if first is missing', () => {
      const entry = { name: 'Test Name' };
      const result = pickValue(entry, ['title', 'name']);
      assert.strictEqual(result, 'Test Name');
    });

    it('should return fallback if no keys match', () => {
      const entry = { something: 'value' };
      const result = pickValue(entry, ['title', 'name'], 'fallback');
      assert.strictEqual(result, 'fallback');
    });

    it('should skip undefined values', () => {
      const entry = { title: undefined, name: 'Test Name' };
      const result = pickValue(entry, ['title', 'name']);
      assert.strictEqual(result, 'Test Name');
    });

    it('should convert non-string values to string', () => {
      const entry = { priority: 123 };
      const result = pickValue(entry, ['priority']);
      assert.strictEqual(result, '123');
    });
  });

  describe('pickFirstKey', () => {
    it('should return value and key for first match', () => {
      const entry = { id: '123', uuid: '456' };
      const result = pickFirstKey(entry, ['id', 'uuid']);
      assert.deepStrictEqual(result, { value: '123', key: 'id' });
    });

    it('should return empty object if no match', () => {
      const entry = { something: 'value' };
      const result = pickFirstKey(entry, ['id', 'uuid']);
      assert.deepStrictEqual(result, {});
    });

    it('should skip undefined values', () => {
      const entry = { id: undefined, uuid: '456' };
      const result = pickFirstKey(entry, ['id', 'uuid']);
      assert.deepStrictEqual(result, { value: '456', key: 'uuid' });
    });
  });

  describe('pickTags', () => {
    it('should extract tags from labels array', () => {
      const entry = { labels: ['bug', 'feature'] };
      const result = pickTags(entry);
      assert.deepStrictEqual(result, ['bug', 'feature']);
    });

    it('should extract tags from tags array', () => {
      const entry = { tags: ['bug', 'feature'] };
      const result = pickTags(entry);
      assert.deepStrictEqual(result, ['bug', 'feature']);
    });

    it('should parse comma-separated string', () => {
      const entry = { labels: 'bug, feature, enhancement' };
      const result = pickTags(entry);
      assert.deepStrictEqual(result, ['bug', 'feature', 'enhancement']);
    });

    it('should return undefined for missing tags', () => {
      const entry = { title: 'Test' };
      const result = pickTags(entry);
      assert.strictEqual(result, undefined);
    });

    it('should convert non-string array items to strings', () => {
      const entry = { labels: [1, 2, 3] };
      const result = pickTags(entry);
      assert.deepStrictEqual(result, ['1', '2', '3']);
    });
  });

  describe('normalizeBead', () => {
    it('should normalize bead with all fields', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Bead',
        file: 'test.md',
        status: 'open',
        labels: ['bug', 'feature'],
        external_ref: 'EXT-123'
      };
      const result = normalizeBead(entry, 0);

      assert.strictEqual(result.id, 'BEAD-1');
      assert.strictEqual(result.title, 'Test Bead');
      assert.strictEqual(result.filePath, 'test.md');
      assert.strictEqual(result.status, 'open');
      assert.deepStrictEqual(result.tags, ['bug', 'feature']);
      assert.strictEqual(result.externalReferenceId, 'EXT-123');
      assert.strictEqual(result.externalReferenceDescription, undefined);
      assert.strictEqual(result.raw, entry);
    });

    it('should parse external_ref with description', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Bead',
        external_ref: 'ERE-1835:external-id-contracts'
      };
      const result = normalizeBead(entry, 0);

      assert.strictEqual(result.externalReferenceId, 'ERE-1835');
      assert.strictEqual(result.externalReferenceDescription, 'external-id-contracts');
    });

    it('should handle external_ref with only ID', () => {
      const entry = {
        id: 'BEAD-1',
        title: 'Test Bead',
        external_ref: 'EXT-123'
      };
      const result = normalizeBead(entry, 0);

      assert.strictEqual(result.externalReferenceId, 'EXT-123');
      assert.strictEqual(result.externalReferenceDescription, undefined);
    });

    it('should generate fallback id if missing', () => {
      const entry = { title: 'Test' };
      const result = normalizeBead(entry, 5);
      assert.strictEqual(result.id, 'bead-5');
    });

    it('should use id as title fallback if title is missing', () => {
      const entry = { id: 'BEAD-1' };
      const result = normalizeBead(entry, 3);
      assert.strictEqual(result.title, 'BEAD-1');
    });

    it('should generate fallback title if both id and title are missing', () => {
      const entry = {};
      const result = normalizeBead(entry, 3);
      assert.strictEqual(result.title, 'bead-3');
    });

    it('should handle alternative field names', () => {
      const entry = {
        uuid: 'unique-id',
        name: 'Alternative Name',
        path: '/path/to/file',
        state: 'closed',
        externalReferenceId: 'REF-456'
      };
      const result = normalizeBead(entry, 0);

      assert.strictEqual(result.id, 'unique-id');
      assert.strictEqual(result.title, 'Alternative Name');
      assert.strictEqual(result.filePath, '/path/to/file');
      assert.strictEqual(result.status, 'closed');
      assert.strictEqual(result.externalReferenceId, 'REF-456');
    });
  });

  describe('extractBeads', () => {
    it('should return array if root is array', () => {
      const root = [{ id: '1' }, { id: '2' }];
      const result = extractBeads(root);
      assert.deepStrictEqual(result, root);
    });

    it('should extract beads from root.beads', () => {
      const beads = [{ id: '1' }, { id: '2' }];
      const root = { beads };
      const result = extractBeads(root);
      assert.deepStrictEqual(result, beads);
    });

    it('should extract beads from root.project.beads', () => {
      const beads = [{ id: '1' }, { id: '2' }];
      const root = { project: { beads } };
      const result = extractBeads(root);
      assert.deepStrictEqual(result, beads);
    });

    it('should return undefined for invalid structure', () => {
      const root = { something: 'else' };
      const result = extractBeads(root);
      assert.strictEqual(result, undefined);
    });
  });

  describe('resolveDataFilePath', () => {
    it('should return absolute path as-is', () => {
      const result = resolveDataFilePath('/absolute/path/data.jsonl', '/project');
      assert.strictEqual(result, '/absolute/path/data.jsonl');
    });

    it('should join relative path with project root', () => {
      const result = resolveDataFilePath('.beads/issues.jsonl', '/project');
      assert.strictEqual(result, '/project/.beads/issues.jsonl');
    });

    it('should return undefined if dataFile is empty', () => {
      const result = resolveDataFilePath('', '/project');
      assert.strictEqual(result, undefined);
    });

    it('should return undefined if projectRoot is missing for relative path', () => {
      const result = resolveDataFilePath('.beads/issues.jsonl', undefined);
      assert.strictEqual(result, undefined);
    });
  });

  describe('formatError', () => {
    it('should format Error object with message', () => {
      const error = new Error('Test error');
      const result = formatError('Operation failed', error);
      assert.strictEqual(result, 'Operation failed: Test error');
    });

    it('should return prefix for non-Error objects', () => {
      const result = formatError('Operation failed', 'some string');
      assert.strictEqual(result, 'Operation failed');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const result = escapeHtml('<div>Test & "quotes"</div>');
      assert.strictEqual(result, '&lt;div&gt;Test &amp; &quot;quotes&quot;&lt;/div&gt;');
    });

    it('should handle empty string', () => {
      const result = escapeHtml('');
      assert.strictEqual(result, '');
    });

    it('should handle string with no special chars', () => {
      const result = escapeHtml('plain text');
      assert.strictEqual(result, 'plain text');
    });
  });
});
