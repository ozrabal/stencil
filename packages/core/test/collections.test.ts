import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CollectionManager } from '../src/collections.js';
import { LocalStorageProvider } from '../src/storage.js';
import type { Template } from '../src/types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await makeTempDir();
});

afterEach(async () => {
  await rm(tmpDir, { force: true, recursive: true });
});

async function makeTempDir(): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `stencil-collections-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

function makeTemplate(overrides: Partial<Template> & { name?: string } = {}): Template {
  const name = overrides.name ?? overrides.frontmatter?.name ?? 'test-template';

  return {
    body: `Hello from {{placeholder}} in ${name}`,
    filePath: '',
    frontmatter: {
      description: `Description of ${name}`,
      name,
      version: 1,
      ...overrides.frontmatter,
    },
    source: 'project',
    ...overrides,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

describe('CollectionManager listCollections', () => {
  it('returns an empty array when the collections directory does not exist', async () => {
    const manager = new CollectionManager(new LocalStorageProvider(tmpDir));

    expect(await manager.listCollections()).toEqual([]);
  });

  it('lists collection directory names, including empty collections, sorted alphabetically', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const manager = new CollectionManager(storage);

    await manager.createCollection('review');
    await manager.createCollection('backend');
    await writeFile(path.join(tmpDir, 'collections', 'notes.txt'), 'ignore me', 'utf8');

    expect(await manager.listCollections()).toEqual(['backend', 'review']);
  });
});

describe('CollectionManager createCollection', () => {
  it('creates the collection directory and is idempotent', async () => {
    const manager = new CollectionManager(new LocalStorageProvider(tmpDir));
    const collectionDir = path.join(tmpDir, 'collections', 'backend');

    await manager.createCollection('backend');
    await manager.createCollection('backend');

    expect(await pathExists(collectionDir)).toBe(true);
    expect(await manager.listCollections()).toEqual(['backend']);
  });
});

describe('CollectionManager moveToCollection', () => {
  it('moves a project template into the target collection', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const manager = new CollectionManager(storage);

    await storage.saveTemplate(makeTemplate({ name: 'endpoint' }));
    await manager.moveToCollection('endpoint', 'backend');

    const moved = await storage.getTemplate('endpoint');
    expect(moved?.collection).toBe('backend');
    expect(moved?.frontmatter.name).toBe('endpoint');
    expect(await pathExists(path.join(tmpDir, 'templates', 'endpoint.md'))).toBe(false);
    expect(await pathExists(path.join(tmpDir, 'collections', 'backend', 'endpoint.md'))).toBe(true);
  });

  it('throws when the template does not exist', async () => {
    const manager = new CollectionManager(new LocalStorageProvider(tmpDir));

    await expect(manager.moveToCollection('missing', 'backend')).rejects.toThrow(
      'Template "missing" not found.',
    );
  });

  it('rejects moving a template that exists only in the global directory', async () => {
    const globalDir = await makeTempDir();

    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);
      const manager = new CollectionManager(storage);

      await new LocalStorageProvider(globalDir).saveTemplate(makeTemplate({ name: 'shared' }));

      await expect(manager.moveToCollection('shared', 'backend')).rejects.toThrow(
        'exists in the global directory only',
      );
      const shared = await storage.getTemplate('shared');
      expect(shared?.source).toBe('global');
      expect(shared?.collection).toBeUndefined();
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });
});

describe('CollectionManager listTemplatesInCollection', () => {
  it('returns templates assigned to the requested collection', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const manager = new CollectionManager(storage);

    await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'endpoint' }));
    await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'service' }));
    await storage.saveTemplate(makeTemplate({ collection: 'review', name: 'adr' }));

    const templates = await manager.listTemplatesInCollection('backend');

    expect(templates.map((template) => template.frontmatter.name)).toEqual(['endpoint', 'service']);
  });
});

describe('CollectionManager removeCollection', () => {
  it('moves project templates to uncategorized and removes the collection directory', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const manager = new CollectionManager(storage);

    await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'endpoint' }));
    await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'service' }));

    await manager.removeCollection('backend');

    expect(await manager.listCollections()).toEqual([]);
    expect(await storage.listTemplates({ collection: 'backend' })).toEqual([]);

    const templates = await storage.listTemplates();
    expect(templates.map((template) => template.frontmatter.name)).toEqual(['endpoint', 'service']);
    expect(templates.every((template) => template.collection === undefined)).toBe(true);
    expect(await pathExists(path.join(tmpDir, 'collections', 'backend'))).toBe(false);
    expect(await pathExists(path.join(tmpDir, 'templates', 'endpoint.md'))).toBe(true);
    expect(await pathExists(path.join(tmpDir, 'templates', 'service.md'))).toBe(true);
  });

  it('is a no-op for an empty or missing collection directory', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const manager = new CollectionManager(storage);

    await manager.createCollection('empty');
    await manager.removeCollection('empty');
    await manager.removeCollection('missing');

    expect(await manager.listCollections()).toEqual([]);
    expect(await storage.listTemplates()).toEqual([]);
  });

  it('does not move global templates when removing a collection', async () => {
    const globalDir = await makeTempDir();

    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);
      const manager = new CollectionManager(storage);

      await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'project-template' }));
      await new LocalStorageProvider(globalDir).saveTemplate(
        makeTemplate({ collection: 'backend', name: 'global-template' }),
      );

      await manager.removeCollection('backend');

      const projectTemplate = await storage.getTemplate('project-template');
      expect(projectTemplate?.source).toBe('project');
      expect(projectTemplate?.collection).toBeUndefined();

      const globalTemplate = await storage.getTemplate('global-template');
      expect(globalTemplate?.source).toBe('global');
      expect(globalTemplate?.collection).toBe('backend');
      expect(
        await pathExists(path.join(globalDir, 'collections', 'backend', 'global-template.md')),
      ).toBe(true);
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });
});
