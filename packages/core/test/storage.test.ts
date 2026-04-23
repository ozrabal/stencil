import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
    `stencil-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe('LocalStorageProvider round-trip', () => {
  it('saves, finds, gets, lists, and deletes a template', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const template = makeTemplate({ name: 'my-template' });

    expect(await storage.templateExists('my-template')).toBe(false);
    expect(await storage.getTemplate('my-template')).toBeNull();

    await storage.saveTemplate(template);

    expect(await storage.templateExists('my-template')).toBe(true);

    const fetched = await storage.getTemplate('my-template');
    expect(fetched).not.toBeNull();
    expect(fetched?.frontmatter.name).toBe('my-template');
    expect(fetched?.frontmatter.description).toBe('Description of my-template');
    expect(fetched?.frontmatter.version).toBe(1);
    expect(fetched?.body).toBe(template.body);

    const list = await storage.listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]?.frontmatter.name).toBe('my-template');

    expect(await storage.deleteTemplate('my-template')).toBe(true);
    expect(await storage.templateExists('my-template')).toBe(false);
    expect(await storage.getTemplate('my-template')).toBeNull();
    expect(await storage.deleteTemplate('my-template')).toBe(false);
  });
});

describe('LocalStorageProvider file placement', () => {
  it('saves uncategorized templates to templates/<name>.md', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'flat-template' }));

    const expectedPath = path.join(tmpDir, 'templates', 'flat-template.md');
    const files = await readdir(path.join(tmpDir, 'templates'));
    expect(files).toContain('flat-template.md');

    const fetched = await storage.getTemplate('flat-template');
    expect(fetched?.filePath).toBe(expectedPath);
    expect(fetched?.collection).toBeUndefined();
  });

  it('saves collection templates to collections/<collection>/<name>.md', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'endpoint' }));

    const expectedPath = path.join(tmpDir, 'collections', 'backend', 'endpoint.md');
    const files = await readdir(path.join(tmpDir, 'collections', 'backend'));
    expect(files).toContain('endpoint.md');

    const fetched = await storage.getTemplate('endpoint');
    expect(fetched?.filePath).toBe(expectedPath);
    expect(fetched?.collection).toBe('backend');
  });

  it('creates intermediate directories automatically on save', async () => {
    const storage = new LocalStorageProvider(tmpDir);

    await expect(
      storage.saveTemplate(makeTemplate({ collection: 'deep', name: 'deep-template' })),
    ).resolves.toBeUndefined();
    expect(await storage.templateExists('deep-template')).toBe(true);
  });
});

describe('LocalStorageProvider serialization', () => {
  it('preserves frontmatter fields after save and get', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const template: Template = {
      body: 'Use {{entity_name}} with {{$ctx.project_name}}.',
      collection: 'backend',
      filePath: '',
      frontmatter: {
        author: 'alice',
        description: 'A rich template',
        name: 'rich-template',
        placeholders: [
          {
            default: 'User',
            description: 'The entity name',
            name: 'entity_name',
            required: false,
            type: 'string',
          },
        ],
        tags: ['backend', 'rest'],
        version: 2,
      },
      source: 'project',
    };

    await storage.saveTemplate(template);
    const fetched = await storage.getTemplate('rich-template');

    expect(fetched?.frontmatter.name).toBe('rich-template');
    expect(fetched?.frontmatter.description).toBe('A rich template');
    expect(fetched?.frontmatter.version).toBe(2);
    expect(fetched?.frontmatter.author).toBe('alice');
    expect(fetched?.frontmatter.tags).toEqual(['backend', 'rest']);
    expect(fetched?.frontmatter.placeholders).toEqual([
      {
        default: 'User',
        description: 'The entity name',
        name: 'entity_name',
        required: false,
        type: 'string',
      },
    ]);
    expect(fetched?.body).toBe(template.body);
    expect(fetched?.collection).toBe('backend');
  });
});

describe('LocalStorageProvider global precedence', () => {
  it('excludes a global template shadowed by a project template in listTemplates', async () => {
    const globalDir = await makeTempDir();
    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);

      await new LocalStorageProvider(globalDir).saveTemplate(makeTemplate({ name: 'shared' }));
      await storage.saveTemplate({
        ...makeTemplate({ name: 'shared' }),
        frontmatter: { description: 'Project version', name: 'shared', version: 99 },
      });

      const shared = (await storage.listTemplates()).filter(
        (template) => template.frontmatter.name === 'shared',
      );

      expect(shared).toHaveLength(1);
      expect(shared[0]?.frontmatter.version).toBe(99);
      expect(shared[0]?.source).toBe('project');
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('returns a global template when no project template exists', async () => {
    const globalDir = await makeTempDir();
    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);
      await new LocalStorageProvider(globalDir).saveTemplate(makeTemplate({ name: 'global-only' }));

      const fetched = await storage.getTemplate('global-only');
      expect(fetched?.source).toBe('global');
      expect(fetched?.frontmatter.name).toBe('global-only');
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('prefers project over global in getTemplate', async () => {
    const globalDir = await makeTempDir();
    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);
      await new LocalStorageProvider(globalDir).saveTemplate(makeTemplate({ name: 'clash' }));
      await storage.saveTemplate({
        ...makeTemplate({ name: 'clash' }),
        frontmatter: { description: 'Project version', name: 'clash', version: 7 },
      });

      const fetched = await storage.getTemplate('clash');
      expect(fetched?.source).toBe('project');
      expect(fetched?.frontmatter.version).toBe(7);
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });
});

describe('LocalStorageProvider listTemplates edge cases', () => {
  it('returns an empty array when the stencil dir has no template directories', async () => {
    const storage = new LocalStorageProvider(tmpDir);

    expect(await storage.listTemplates()).toEqual([]);
  });

  it('returns an empty array when the stencil dir does not exist', async () => {
    const storage = new LocalStorageProvider(path.join(tmpDir, 'missing'));

    expect(await storage.listTemplates()).toEqual([]);
  });

  it('skips malformed markdown files without throwing', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const templatesDir = path.join(tmpDir, 'templates');
    await mkdir(templatesDir, { recursive: true });
    await writeFile(path.join(templatesDir, 'broken.md'), 'no frontmatter here', 'utf8');
    await storage.saveTemplate(makeTemplate({ name: 'valid-template' }));

    const list = await storage.listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]?.frontmatter.name).toBe('valid-template');
  });

  it('ignores non-markdown files in template directories', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const templatesDir = path.join(tmpDir, 'templates');
    await mkdir(templatesDir, { recursive: true });
    await writeFile(path.join(templatesDir, 'readme.txt'), 'not a template', 'utf8');
    await writeFile(path.join(templatesDir, 'config.json'), '{}', 'utf8');
    await storage.saveTemplate(makeTemplate({ name: 'real-template' }));

    const list = await storage.listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]?.frontmatter.name).toBe('real-template');
  });
});

describe('LocalStorageProvider listTemplates filters', () => {
  it('filters by collection', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'uncategorized' }));
    await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'backend-template' }));
    await storage.saveTemplate(makeTemplate({ collection: 'review', name: 'review-template' }));

    const result = await storage.listTemplates({ collection: 'backend' });
    expect(result).toHaveLength(1);
    expect(result[0]?.frontmatter.name).toBe('backend-template');
  });

  it('filters by source', async () => {
    const globalDir = await makeTempDir();
    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);
      await storage.saveTemplate(makeTemplate({ name: 'project-template' }));
      await new LocalStorageProvider(globalDir).saveTemplate(
        makeTemplate({ name: 'global-template' }),
      );

      const projectOnly = await storage.listTemplates({ source: 'project' });
      expect(projectOnly).toHaveLength(1);
      expect(projectOnly.every((template) => template.source === 'project')).toBe(true);

      const globalOnly = await storage.listTemplates({ source: 'global' });
      expect(globalOnly).toHaveLength(1);
      expect(globalOnly.every((template) => template.source === 'global')).toBe(true);
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('filters by tags with at least one matching tag', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate({
      ...makeTemplate({ name: 'tagged' }),
      frontmatter: {
        description: 'Tagged',
        name: 'tagged',
        tags: ['rest', 'backend'],
        version: 1,
      },
    });
    await storage.saveTemplate(makeTemplate({ name: 'untagged' }));

    const result = await storage.listTemplates({ tags: ['rest'] });
    expect(result).toHaveLength(1);
    expect(result[0]?.frontmatter.name).toBe('tagged');
  });

  it('filters by case-insensitive searchQuery on name', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'create-endpoint' }));
    await storage.saveTemplate(makeTemplate({ name: 'write-adr' }));

    const result = await storage.listTemplates({ searchQuery: 'ENDPOINT' });
    expect(result).toHaveLength(1);
    expect(result[0]?.frontmatter.name).toBe('create-endpoint');
  });

  it('filters by searchQuery on description', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate({
      ...makeTemplate({ name: 'some-template' }),
      frontmatter: {
        description: 'Generates a REST handler',
        name: 'some-template',
        version: 1,
      },
    });
    await storage.saveTemplate(makeTemplate({ name: 'other' }));

    const result = await storage.listTemplates({ searchQuery: 'rest handler' });
    expect(result).toHaveLength(1);
    expect(result[0]?.frontmatter.name).toBe('some-template');
  });

  it('filters by searchQuery on tags', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate({
      ...makeTemplate({ name: 'tagged-template' }),
      frontmatter: {
        description: 'Tagged',
        name: 'tagged-template',
        tags: ['security'],
        version: 1,
      },
    });
    await storage.saveTemplate(makeTemplate({ name: 'plain' }));

    const result = await storage.listTemplates({ searchQuery: 'security' });
    expect(result).toHaveLength(1);
    expect(result[0]?.frontmatter.name).toBe('tagged-template');
  });
});

describe('LocalStorageProvider listTemplates sort order', () => {
  it('sorts uncategorized templates before named collections', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'z-uncategorized' }));
    await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'a-backend' }));

    const list = await storage.listTemplates();
    expect(list[0]?.collection).toBeUndefined();
    expect(list[1]?.collection).toBe('backend');
  });

  it('sorts templates alphabetically by name within a collection', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ collection: 'col', name: 'zebra' }));
    await storage.saveTemplate(makeTemplate({ collection: 'col', name: 'apple' }));
    await storage.saveTemplate(makeTemplate({ collection: 'col', name: 'mango' }));

    const list = await storage.listTemplates({ collection: 'col' });
    expect(list.map((template) => template.frontmatter.name)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('sorts collections alphabetically, then names within each collection', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ collection: 'review', name: 'z-review' }));
    await storage.saveTemplate(makeTemplate({ collection: 'backend', name: 'a-backend' }));
    await storage.saveTemplate(makeTemplate({ collection: 'review', name: 'a-review' }));

    const list = await storage.listTemplates();
    expect(list.map((template) => template.frontmatter.name)).toEqual([
      'a-backend',
      'a-review',
      'z-review',
    ]);
  });
});

describe('LocalStorageProvider deleteTemplate', () => {
  it('returns true and removes the file when a template exists', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'to-delete' }));

    expect(await storage.deleteTemplate('to-delete')).toBe(true);
    expect(await storage.templateExists('to-delete')).toBe(false);
  });

  it('returns false when a template does not exist', async () => {
    const storage = new LocalStorageProvider(tmpDir);

    expect(await storage.deleteTemplate('missing')).toBe(false);
  });

  it('deletes templates in collections', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ collection: 'docs', name: 'col-template' }));

    expect(await storage.deleteTemplate('col-template')).toBe(true);
    expect(await storage.templateExists('col-template')).toBe(false);
  });
});

describe('LocalStorageProvider templateExists', () => {
  it('returns false before save', async () => {
    const storage = new LocalStorageProvider(tmpDir);

    expect(await storage.templateExists('not-saved')).toBe(false);
  });

  it('returns true after save', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'exists-check' }));

    expect(await storage.templateExists('exists-check')).toBe(true);
  });
});

describe('LocalStorageProvider getTemplate', () => {
  it('returns null for a missing template', async () => {
    const storage = new LocalStorageProvider(tmpDir);

    expect(await storage.getTemplate('missing')).toBeNull();
  });

  it('returns the project source for a project template', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'project-template' }));

    const result = await storage.getTemplate('project-template');
    expect(result?.source).toBe('project');
  });

  it('returns collection metadata for a collection template', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ collection: 'docs', name: 'collection-template' }));

    const result = await storage.getTemplate('collection-template');
    expect(result?.collection).toBe('docs');
  });
});
