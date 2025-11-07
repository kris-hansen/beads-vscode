import * as path from 'path';

export interface BeadItemData {
  id: string;
  title: string;
  filePath?: string;
  status?: string;
  tags?: string[];
  externalReferenceId?: string;
  externalReferenceDescription?: string;
  raw?: unknown;
  idKey?: string;
  externalReferenceKey?: string;
}

export function pickValue(entry: any, keys: string[], fallback?: string): string | undefined {
  if (!entry || typeof entry !== 'object') {
    return fallback;
  }

  for (const key of keys) {
    if (key in entry) {
      const value = entry[key];
      if (value === undefined || value === null) {
        continue;
      }
      return String(value);
    }
  }

  return fallback;
}

export function pickFirstKey(entry: any, keys: string[]): { value?: string; key?: string } {
  if (!entry || typeof entry !== 'object') {
    return {};
  }

  for (const key of keys) {
    if (key in entry) {
      const value = entry[key];
      if (value === undefined || value === null) {
        continue;
      }
      return { value: String(value), key };
    }
  }

  return {};
}

export function pickTags(entry: any): string[] | undefined {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }

  const candidate = entry.labels ?? entry.tags ?? entry.tag_list;
  if (!candidate) {
    return undefined;
  }

  if (Array.isArray(candidate)) {
    return candidate.map((tag) => String(tag));
  }

  if (typeof candidate === 'string') {
    return candidate
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);
  }

  return undefined;
}

export function normalizeBead(entry: any, index = 0): BeadItemData {
  const { value: id, key: idKey } = pickFirstKey(entry, ['id', 'uuid', 'beadId']);
  const title = pickValue(entry, ['title', 'name'], id ?? `bead-${index}`) ?? `bead-${index}`;
  const filePath = pickValue(entry, ['file', 'path', 'filename']);
  const status = pickValue(entry, ['status', 'state']);
  const tags = pickTags(entry);
  const { value: externalReferenceRaw, key: externalReferenceKey } = pickFirstKey(entry, [
    'external_reference_id',
    'externalReferenceId',
    'external_ref',
    'external_reference',
    'externalRefId',
  ]);

  // Parse external_ref format: "ID:description"
  let externalReferenceId: string | undefined;
  let externalReferenceDescription: string | undefined;
  if (externalReferenceRaw) {
    const parts = externalReferenceRaw.split(':', 2);
    externalReferenceId = parts[0];
    externalReferenceDescription = parts.length > 1 ? parts[1] : undefined;
  }

  return {
    id: id ?? `bead-${index}`,
    idKey,
    title,
    filePath,
    status,
    tags,
    externalReferenceId,
    externalReferenceDescription,
    externalReferenceKey,
    raw: entry,
  };
}

export function extractBeads(root: unknown): any[] | undefined {
  if (Array.isArray(root)) {
    return root;
  }

  if (root && typeof root === 'object') {
    const record = root as Record<string, unknown>;
    if (Array.isArray(record.beads)) {
      return record.beads as any[];
    }

    const project = record.project;
    if (project && typeof project === 'object') {
      const projectBeads = (project as Record<string, unknown>).beads;
      if (Array.isArray(projectBeads)) {
        return projectBeads as any[];
      }
    }
  }

  return undefined;
}

export function resolveDataFilePath(dataFile: string, projectRoot: string | undefined): string | undefined {
  if (!dataFile || dataFile.trim().length === 0) {
    return undefined;
  }

  if (path.isAbsolute(dataFile)) {
    return dataFile;
  }

  if (!projectRoot) {
    return undefined;
  }

  return path.join(projectRoot, dataFile);
}

export function formatError(prefix: string, error: unknown): string {
  if (error instanceof Error) {
    return `${prefix}: ${error.message}`;
  }
  return prefix;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (m) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m] || m;
  });
}

export function createTooltip(bead: BeadItemData): string {
  const parts: string[] = [bead.title];
  if (bead.status) {
    parts.push(`Status: ${bead.status}`);
  }
  if (bead.filePath) {
    parts.push(`File: ${bead.filePath}`);
  }
  if (bead.tags && bead.tags.length > 0) {
    parts.push(`Tags: ${bead.tags.join(', ')}`);
  }
  if (bead.externalReferenceId) {
    const displayText = bead.externalReferenceDescription || bead.externalReferenceId;
    parts.push(`External Ref: ${displayText} (${bead.externalReferenceId})`);
  }
  return parts.join('\n');
}
