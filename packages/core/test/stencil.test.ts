import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StencilConfigError } from '../src/config.js';
import { StencilErrorCode, TemplateConflictError, TemplateValidationError } from '../src/errors.js';
import { ParseError, TemplateNotFoundError } from '../src/parser.js';
import { Stencil } from '../src/stencil.js';
import { LocalStorageProvider } from '../src/storage.js';
import type { ContextProvider, TemplateFrontmatter } from '../src/types.js';

let projectDir: string;
let stencil: Stencil;

beforeEach(async () => {
  projectDir = await makeTempDir('stencil-facade');
  stencil = new Stencil({ projectDir });
});

afterEach(async () => {
  await rm(projectDir, { force: true, recursive: true });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

function makeFrontmatter(
  name: string,
  overrides: Partial<TemplateFrontmatter> = {},
): TemplateFrontmatter {
  return {
    description: `Description for ${name}`,
    name,
    version: 1,
    ...overrides,
  };
}

async function writeStencilConfig(stencilDir: string, content: string): Promise<void> {
  await mkdir(stencilDir, { recursive: true });
  await writeFile(path.join(stencilDir, 'config.yaml'), content, 'utf8');
}

async function saveTemplateInDir(
  stencilDir: string,
  name: string,
  body: string,
  collection?: string,
): Promise<void> {
  const storage = new LocalStorageProvider(stencilDir);
  await storage.saveTemplate({
    body,
    collection,
    filePath: '',
    frontmatter: makeFrontmatter(name),
    source: 'project',
  });
}

describe('Stencil constructor', () => {
  it('exposes context as a readonly property', () => {
    expect(stencil.context).toBeDefined();
    expect(typeof stencil.context.resolveAll).toBe('function');
  });

  it('exposes storage as a readonly property', () => {
    expect(stencil.storage).toBeDefined();
    expect(typeof stencil.storage.listTemplates).toBe('function');
  });

  it('exposes collections as a readonly property', () => {
    expect(stencil.collections).toBeDefined();
    expect(typeof stencil.collections.listCollections).toBe('function');
  });

  it('accepts custom context providers and registers them', async () => {
    const customProvider: ContextProvider = {
      name: 'Custom',
      resolve: async () => ({ custom_key: 'custom_value' }),
    };

    const stencilWithProvider = new Stencil({
      contextProviders: [customProvider],
      projectDir,
    });

    const ctx = await stencilWithProvider.context.resolveAll();
    expect(ctx['custom_key']).toBe('custom_value');
  });

  it('adapter provider overrides built-in context variable on collision', async () => {
    const overrideProvider: ContextProvider = {
      name: 'Override',
      resolve: async () => ({ date: 'overridden-date' }),
    };

    const stencilWithOverride = new Stencil({
      contextProviders: [overrideProvider],
      projectDir,
    });

    const ctx = await stencilWithOverride.context.resolveAll();
    expect(ctx['date']).toBe('overridden-date');
  });
});

describe('Stencil.init()', () => {
  it('creates the .stencil/templates directory', async () => {
    await stencil.init();

    const stats = await stat(path.join(projectDir, '.stencil', 'templates'));
    expect(stats.isDirectory()).toBe(true);
  });

  it('is idempotent', async () => {
    await stencil.init();
    await expect(stencil.init()).resolves.toBeUndefined();
  });

  it('does not throw if .stencil/templates already exists', async () => {
    await mkdir(path.join(projectDir, '.stencil', 'templates'), { recursive: true });
    await expect(stencil.init()).resolves.toBeUndefined();
  });
});

describe('Stencil.create()', () => {
  it('saves a template and returns it with a populated filePath', async () => {
    const template = await stencil.create(makeFrontmatter('my-template'), 'Hello world');

    expect(template.frontmatter.name).toBe('my-template');
    expect(template.body).toBe('Hello world');
    expect(template.filePath).toBeTruthy();
    expect(template.source).toBe('project');
  });

  it('creates a template in a collection', async () => {
    const template = await stencil.create(makeFrontmatter('endpoint'), 'Endpoint body', 'backend');

    expect(template.collection).toBe('backend');
    expect(template.filePath).toContain('backend');
  });

  it('returned template is retrievable via get()', async () => {
    await stencil.create(makeFrontmatter('retrievable'), 'Body text');

    const fetched = await stencil.get('retrievable');
    expect(fetched).not.toBeNull();
    expect(fetched?.frontmatter.name).toBe('retrievable');
  });

  it('throws if frontmatter is invalid', async () => {
    const badFrontmatter: TemplateFrontmatter = {
      description: '',
      name: 'bad-template',
      version: 1,
    };

    await expect(stencil.create(badFrontmatter, 'body')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TemplateValidationError);
      expect((error as TemplateValidationError).code).toBe(
        StencilErrorCode.TEMPLATE_VALIDATION_FAILED,
      );
      expect((error as TemplateValidationError).operation).toBe('create');
      expect(
        (error as TemplateValidationError).issues.some((issue) => issue.severity === 'error'),
      ).toBe(true);
      return true;
    });
  });

  it('throws if name is not kebab-case', async () => {
    await expect(stencil.create(makeFrontmatter('BadName'), 'body')).rejects.toThrow();
  });

  it('preserves all frontmatter fields', async () => {
    const frontmatter: TemplateFrontmatter = {
      author: 'alice',
      description: 'Full featured',
      name: 'full-template',
      placeholders: [{ description: 'Entity name', name: 'entity', required: true }],
      tags: ['backend'],
      version: 2,
    };

    const created = await stencil.create(frontmatter, 'Entity: {{entity}}');

    expect(created.frontmatter.author).toBe('alice');
    expect(created.frontmatter.tags).toEqual(['backend']);
    expect(created.frontmatter.version).toBe(2);
    expect(created.frontmatter.placeholders).toHaveLength(1);
  });

  it('uses default_collection from project config when collection is omitted', async () => {
    await writeStencilConfig(
      path.join(projectDir, '.stencil'),
      ["default_collection: 'backend'"].join('\n'),
    );

    const created = await stencil.create(makeFrontmatter('config-default'), 'Body text');

    expect(created.collection).toBe('backend');
    expect(created.filePath).toContain(`${path.sep}collections${path.sep}backend${path.sep}`);
  });

  it('prefers an explicit collection over default_collection from config', async () => {
    await writeStencilConfig(
      path.join(projectDir, '.stencil'),
      ["default_collection: 'backend'"].join('\n'),
    );

    const created = await stencil.create(
      makeFrontmatter('explicit-collection'),
      'Body text',
      'docs',
    );

    expect(created.collection).toBe('docs');
    expect(created.filePath).toContain(`${path.sep}collections${path.sep}docs${path.sep}`);
  });
});

describe('Stencil.list()', () => {
  it('returns empty array when no templates exist', async () => {
    expect(await stencil.list()).toEqual([]);
  });

  it('returns all created templates', async () => {
    await stencil.create(makeFrontmatter('tmpl-a'), 'Body A');
    await stencil.create(makeFrontmatter('tmpl-b'), 'Body B');

    const templates = await stencil.list();
    expect(templates).toHaveLength(2);
    expect(templates.map((template) => template.frontmatter.name)).toEqual(['tmpl-a', 'tmpl-b']);
  });

  it('filters by collection', async () => {
    await stencil.create(makeFrontmatter('backend-tmpl'), 'body', 'backend');
    await stencil.create(makeFrontmatter('review-tmpl'), 'body', 'review');

    const backendOnly = await stencil.list({ collection: 'backend' });
    expect(backendOnly).toHaveLength(1);
    expect(backendOnly[0]?.frontmatter.name).toBe('backend-tmpl');
  });

  it('filters by searchQuery', async () => {
    await stencil.create(makeFrontmatter('rest-endpoint'), 'body');
    await stencil.create(makeFrontmatter('security-review'), 'body');

    const results = await stencil.list({ searchQuery: 'rest' });
    expect(results).toHaveLength(1);
    expect(results[0]?.frontmatter.name).toBe('rest-endpoint');
  });

  it('filters by tags', async () => {
    await stencil.create(makeFrontmatter('tagged', { tags: ['backend'] }), 'body');
    await stencil.create(makeFrontmatter('untagged'), 'body');

    const tagged = await stencil.list({ tags: ['backend'] });
    expect(tagged).toHaveLength(1);
    expect(tagged[0]?.frontmatter.name).toBe('tagged');
  });
});

describe('Stencil.get()', () => {
  it('returns the template with correct fields', async () => {
    await stencil.create(makeFrontmatter('fetch-me'), 'Fetch body');

    const template = await stencil.get('fetch-me');
    expect(template).not.toBeNull();
    expect(template?.frontmatter.name).toBe('fetch-me');
    expect(template?.body).toBe('Fetch body');
  });

  it('returns null for an unknown template name', async () => {
    expect(await stencil.get('does-not-exist')).toBeNull();
  });

  it('auto-discovers ~/.stencil when globalDir is omitted', async () => {
    const previousHome = process.env.HOME;
    const tempHome = await makeTempDir('stencil-home');

    try {
      process.env.HOME = tempHome;
      await saveTemplateInDir(path.join(tempHome, '.stencil'), 'global-only', 'Global body');

      const stencilWithDiscoveredGlobal = new Stencil({ projectDir });
      const template = await stencilWithDiscoveredGlobal.get('global-only');

      expect(template).not.toBeNull();
      expect(template?.frontmatter.name).toBe('global-only');
      expect(template?.source).toBe('global');
    } finally {
      process.env.HOME = previousHome;
      await rm(tempHome, { force: true, recursive: true });
    }
  });

  it('prefers project templates over auto-discovered global templates', async () => {
    const previousHome = process.env.HOME;
    const tempHome = await makeTempDir('stencil-home');

    try {
      process.env.HOME = tempHome;
      await saveTemplateInDir(path.join(tempHome, '.stencil'), 'shared-template', 'Global body');
      await stencil.create(makeFrontmatter('shared-template'), 'Project body');

      const template = await stencil.get('shared-template');

      expect(template).not.toBeNull();
      expect(template?.body).toBe('Project body');
      expect(template?.source).toBe('project');
    } finally {
      process.env.HOME = previousHome;
      await rm(tempHome, { force: true, recursive: true });
    }
  });

  it('uses the explicit globalDir instead of the discovered default', async () => {
    const previousHome = process.env.HOME;
    const tempHome = await makeTempDir('stencil-home');
    const explicitGlobalDir = await makeTempDir('stencil-explicit-global');

    try {
      process.env.HOME = tempHome;
      await saveTemplateInDir(
        path.join(tempHome, '.stencil'),
        'discovered-only',
        'Discovered body',
      );
      await saveTemplateInDir(explicitGlobalDir, 'explicit-only', 'Explicit body');

      const stencilWithExplicitGlobal = new Stencil({
        globalDir: explicitGlobalDir,
        projectDir,
      });

      await expect(stencilWithExplicitGlobal.get('discovered-only')).resolves.toBeNull();

      const explicitTemplate = await stencilWithExplicitGlobal.get('explicit-only');
      expect(explicitTemplate).not.toBeNull();
      expect(explicitTemplate?.source).toBe('global');
    } finally {
      process.env.HOME = previousHome;
      await rm(tempHome, { force: true, recursive: true });
      await rm(explicitGlobalDir, { force: true, recursive: true });
    }
  });

  it('disables global template lookup when globalDir is null', async () => {
    const previousHome = process.env.HOME;
    const tempHome = await makeTempDir('stencil-home');

    try {
      process.env.HOME = tempHome;
      await saveTemplateInDir(path.join(tempHome, '.stencil'), 'global-only', 'Global body');

      const projectOnlyStencil = new Stencil({
        globalDir: null,
        projectDir,
      });

      await expect(projectOnlyStencil.get('global-only')).resolves.toBeNull();
    } finally {
      process.env.HOME = previousHome;
      await rm(tempHome, { force: true, recursive: true });
    }
  });
});

describe('Stencil.delete()', () => {
  it('deletes an existing template and returns true', async () => {
    await stencil.create(makeFrontmatter('to-delete'), 'body');

    expect(await stencil.delete('to-delete')).toBe(true);
    expect(await stencil.get('to-delete')).toBeNull();
  });

  it('returns false when the template does not exist', async () => {
    expect(await stencil.delete('ghost')).toBe(false);
  });

  it('does not affect other templates', async () => {
    await stencil.create(makeFrontmatter('keeper'), 'keep me');
    await stencil.create(makeFrontmatter('goner'), 'delete me');

    await stencil.delete('goner');

    expect(await stencil.get('keeper')).not.toBeNull();
    expect(await stencil.get('goner')).toBeNull();
  });
});

describe('Stencil.update()', () => {
  it('updates body and frontmatter while preserving unspecified fields', async () => {
    await stencil.create(
      makeFrontmatter('update-me', {
        author: 'alice',
        placeholders: [{ description: 'Entity', name: 'entity', required: true }],
        tags: ['backend'],
      }),
      'Original body',
    );

    const updated = await stencil.update('update-me', {
      body: 'Updated body',
      frontmatter: {
        description: 'Updated description',
        tags: ['backend', 'api'],
      },
    });

    expect(updated.body).toBe('Updated body');
    expect(updated.frontmatter.description).toBe('Updated description');
    expect(updated.frontmatter.tags).toEqual(['backend', 'api']);
    expect(updated.frontmatter.author).toBe('alice');
    expect(updated.frontmatter.placeholders).toEqual([
      { description: 'Entity', name: 'entity', required: true },
    ]);
    expect(updated.frontmatter.version).toBe(1);
    expect(updated.source).toBe('project');
  });

  it('moves a template into a collection', async () => {
    await stencil.create(makeFrontmatter('move-into-collection'), 'Body');

    const updated = await stencil.update('move-into-collection', { collection: 'backend' });

    expect(updated.collection).toBe('backend');
    expect(updated.filePath).toContain(`${path.sep}collections${path.sep}backend${path.sep}`);
  });

  it('moves a template out of a collection with collection: null', async () => {
    await stencil.create(makeFrontmatter('move-out-of-collection'), 'Body', 'backend');

    const updated = await stencil.update('move-out-of-collection', { collection: null });

    expect(updated.collection).toBeUndefined();
    expect(updated.filePath).toContain(`${path.sep}templates${path.sep}`);
  });

  it('rejects invalid final frontmatter', async () => {
    await stencil.create(makeFrontmatter('invalid-update'), 'Body');

    await expect(
      stencil.update('invalid-update', {
        frontmatter: {
          description: '',
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TemplateValidationError);
      expect((error as TemplateValidationError).operation).toBe('update');
      expect((error as TemplateValidationError).message).toContain('Cannot update template');
      expect(
        (error as TemplateValidationError).issues.some((issue) => issue.severity === 'error'),
      ).toBe(true);
      return true;
    });
  });

  it('rejects updates for templates that exist only globally', async () => {
    const globalProjectDir = await makeTempDir('stencil-global-update');

    try {
      await saveTemplateInDir(
        path.join(globalProjectDir, '.stencil'),
        'global-update-only',
        'Global body',
      );
      const stencilWithGlobal = new Stencil({
        globalDir: path.join(globalProjectDir, '.stencil'),
        projectDir,
      });

      await expect(
        stencilWithGlobal.update('global-update-only', { body: 'Updated body' }),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(TemplateConflictError);
        expect((error as TemplateConflictError).code).toBe(
          StencilErrorCode.TEMPLATE_MUTATION_NOT_ALLOWED,
        );
        expect((error as TemplateConflictError).operation).toBe('update');
        expect((error as TemplateConflictError).templateName).toBe('global-update-only');
        return true;
      });
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });
});

describe('Stencil.copy()', () => {
  it('copies a project template under a new name', async () => {
    await stencil.create(makeFrontmatter('copy-source'), 'Copy body');

    const copied = await stencil.copy('copy-source', 'copy-target');

    expect(copied.frontmatter.name).toBe('copy-target');
    expect(copied.body).toBe('Copy body');
    expect(copied.source).toBe('project');
    expect((await stencil.get('copy-source'))?.frontmatter.name).toBe('copy-source');
  });

  it('copies a global template into project storage under a new name', async () => {
    const globalProjectDir = await makeTempDir('stencil-global-copy');

    try {
      await saveTemplateInDir(
        path.join(globalProjectDir, '.stencil'),
        'global-copy-source',
        'Global body',
      );
      const stencilWithGlobal = new Stencil({
        globalDir: path.join(globalProjectDir, '.stencil'),
        projectDir,
      });

      const copied = await stencilWithGlobal.copy('global-copy-source', 'project-copy');

      expect(copied.frontmatter.name).toBe('project-copy');
      expect(copied.body).toBe('Global body');
      expect(copied.source).toBe('project');
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });

  it('copies with collection, body, and frontmatter overrides', async () => {
    await stencil.create(makeFrontmatter('copy-overrides', { tags: ['draft'] }), 'Original body');

    const copied = await stencil.copy('copy-overrides', 'copy-overrides-target', {
      body: 'Overridden body',
      collection: 'docs',
      frontmatter: {
        description: 'Copied description',
        tags: ['published'],
      },
    });

    expect(copied.body).toBe('Overridden body');
    expect(copied.collection).toBe('docs');
    expect(copied.frontmatter.description).toBe('Copied description');
    expect(copied.frontmatter.tags).toEqual(['published']);
  });

  it('rejects invalid copied results', async () => {
    await stencil.create(makeFrontmatter('invalid-copy-source'), 'Body');

    await expect(
      stencil.copy('invalid-copy-source', 'invalid-copy-target', {
        frontmatter: { description: '' },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TemplateValidationError);
      expect((error as TemplateValidationError).operation).toBe('copy');
      expect(
        (error as TemplateValidationError).issues.some((issue) => issue.severity === 'error'),
      ).toBe(true);
      return true;
    });
  });

  it('rejects target collisions by default', async () => {
    await stencil.create(makeFrontmatter('copy-collision-source'), 'Source');
    await stencil.create(makeFrontmatter('copy-collision-target'), 'Target');

    await expect(stencil.copy('copy-collision-source', 'copy-collision-target')).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(TemplateConflictError);
        expect((error as TemplateConflictError).code).toBe(
          StencilErrorCode.TEMPLATE_ALREADY_EXISTS,
        );
        expect((error as TemplateConflictError).operation).toBe('copy');
        expect((error as TemplateConflictError).targetName).toBe('copy-collision-target');
        return true;
      },
    );
  });

  it('overwrites an existing project target only when overwrite is true', async () => {
    await stencil.create(makeFrontmatter('overwrite-source'), 'Source body');
    await stencil.create(makeFrontmatter('overwrite-target'), 'Old target body');

    const copied = await stencil.copy('overwrite-source', 'overwrite-target', {
      overwrite: true,
    });

    expect(copied.body).toBe('Source body');
    expect(copied.frontmatter.name).toBe('overwrite-target');
  });

  it('rejects overwrite when the colliding target is global-only', async () => {
    const globalProjectDir = await makeTempDir('stencil-global-copy-target');

    try {
      await stencil.create(makeFrontmatter('copy-global-source'), 'Source body');
      await saveTemplateInDir(
        path.join(globalProjectDir, '.stencil'),
        'copy-global-target',
        'Global target body',
      );

      const stencilWithGlobal = new Stencil({
        globalDir: path.join(globalProjectDir, '.stencil'),
        projectDir,
      });

      await expect(
        stencilWithGlobal.copy('copy-global-source', 'copy-global-target', {
          overwrite: true,
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(TemplateConflictError);
        expect((error as TemplateConflictError).code).toBe(
          StencilErrorCode.TEMPLATE_MUTATION_NOT_ALLOWED,
        );
        expect((error as TemplateConflictError).operation).toBe('copy');
        expect((error as TemplateConflictError).targetName).toBe('copy-global-target');
        return true;
      });
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });
});

describe('Stencil.rename()', () => {
  it('renames a project template and removes the old name', async () => {
    await stencil.create(makeFrontmatter('rename-source'), 'Rename body');

    const renamed = await stencil.rename('rename-source', 'rename-target');

    expect(renamed.frontmatter.name).toBe('rename-target');
    expect(await stencil.get('rename-source')).toBeNull();
    expect((await stencil.get('rename-target'))?.body).toBe('Rename body');
  });

  it('preserves body, frontmatter fields, and collection placement', async () => {
    await stencil.create(
      makeFrontmatter('rename-keep-fields', {
        author: 'alice',
        tags: ['backend'],
      }),
      'Keep this body',
      'backend',
    );

    const renamed = await stencil.rename('rename-keep-fields', 'rename-keep-fields-final');

    expect(renamed.body).toBe('Keep this body');
    expect(renamed.frontmatter.author).toBe('alice');
    expect(renamed.frontmatter.tags).toEqual(['backend']);
    expect(renamed.collection).toBe('backend');
    expect(renamed.filePath).toContain(`${path.sep}collections${path.sep}backend${path.sep}`);
  });

  it('rejects rename of a global-only template', async () => {
    const globalProjectDir = await makeTempDir('stencil-global-rename');

    try {
      await saveTemplateInDir(
        path.join(globalProjectDir, '.stencil'),
        'global-rename-only',
        'Global body',
      );
      const stencilWithGlobal = new Stencil({
        globalDir: path.join(globalProjectDir, '.stencil'),
        projectDir,
      });

      await expect(
        stencilWithGlobal.rename('global-rename-only', 'global-rename-target'),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(TemplateConflictError);
        expect((error as TemplateConflictError).code).toBe(
          StencilErrorCode.TEMPLATE_MUTATION_NOT_ALLOWED,
        );
        expect((error as TemplateConflictError).operation).toBe('rename');
        expect((error as TemplateConflictError).templateName).toBe('global-rename-only');
        return true;
      });
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });

  it('rejects collisions by default', async () => {
    await stencil.create(makeFrontmatter('rename-collision-source'), 'Source');
    await stencil.create(makeFrontmatter('rename-collision-target'), 'Target');

    await expect(
      stencil.rename('rename-collision-source', 'rename-collision-target'),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TemplateConflictError);
      expect((error as TemplateConflictError).code).toBe(StencilErrorCode.TEMPLATE_ALREADY_EXISTS);
      expect((error as TemplateConflictError).operation).toBe('rename');
      expect((error as TemplateConflictError).targetName).toBe('rename-collision-target');
      return true;
    });
  });

  it('allows overwrite only for project targets', async () => {
    await stencil.create(makeFrontmatter('rename-overwrite-source'), 'Source body');
    await stencil.create(makeFrontmatter('rename-overwrite-target'), 'Old target body');

    const renamed = await stencil.rename('rename-overwrite-source', 'rename-overwrite-target', {
      overwrite: true,
    });

    expect(renamed.frontmatter.name).toBe('rename-overwrite-target');
    expect(renamed.body).toBe('Source body');
    expect(await stencil.get('rename-overwrite-source')).toBeNull();
  });
});

describe('Stencil.validate()', () => {
  it('returns valid result for a well-formed template', async () => {
    await stencil.create(makeFrontmatter('valid-tmpl'), 'Body text');

    const result = await stencil.validate('valid-tmpl');
    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
  });

  it('returns invalid result when template has error-severity issues', async () => {
    await stencil.storage.saveTemplate({
      body: 'body',
      filePath: '',
      frontmatter: { description: '', name: 'broken', version: 0 },
      source: 'project',
    });

    const result = await stencil.validate('broken');
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.severity === 'error')).toBe(true);
  });

  it('returns failed result when template is not found', async () => {
    const result = await stencil.validate('nonexistent');
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.severity).toBe('error');
    expect(result.issues[0]?.message).toContain('nonexistent');
  });

  it('returns warnings but valid true for a template with warnings only', async () => {
    const frontmatter: TemplateFrontmatter = {
      description: 'Has warning',
      name: 'warn-tmpl',
      placeholders: [{ description: 'unused placeholder', name: 'unused', required: true }],
      version: 1,
    };

    await stencil.storage.saveTemplate({
      body: 'No placeholder token here',
      filePath: '',
      frontmatter,
      source: 'project',
    });

    const result = await stencil.validate('warn-tmpl');
    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.severity === 'warning')).toBe(true);
  });
});

describe('Stencil.resolve()', () => {
  it('resolves explicit placeholder values into the body', async () => {
    const frontmatter: TemplateFrontmatter = {
      description: 'REST endpoint generator',
      name: 'create-endpoint',
      placeholders: [{ description: 'Entity name', name: 'entity', required: true }],
      version: 1,
    };
    await stencil.create(frontmatter, 'Create endpoint for {{entity}}');

    const result = await stencil.resolve('create-endpoint', { entity: 'Invoice' });
    expect(result.resolvedBody).toBe('Create endpoint for Invoice');
    expect(result.unresolvedCount).toBe(0);
    expect(result.placeholders[0]).toMatchObject({
      name: 'entity',
      source: 'explicit',
      value: 'Invoice',
    });
  });

  it('uses default value when no explicit value is provided', async () => {
    const frontmatter: TemplateFrontmatter = {
      description: 'Template with default',
      name: 'with-default',
      placeholders: [
        {
          default: 'create, read, update, delete',
          description: 'Operations',
          name: 'ops',
          required: true,
        },
      ],
      version: 1,
    };
    await stencil.create(frontmatter, 'Operations: {{ops}}');

    const result = await stencil.resolve('with-default', {});
    expect(result.resolvedBody).toBe('Operations: create, read, update, delete');
    expect(result.placeholders[0]?.source).toBe('default');
  });

  it('resolves $ctx tokens from context providers', async () => {
    const pinned: ContextProvider = {
      name: 'Pinned',
      resolve: async () => ({ date: '2026-01-01' }),
    };
    const stencilWithCtx = new Stencil({ contextProviders: [pinned], projectDir });

    await stencilWithCtx.create(makeFrontmatter('ctx-template'), 'Generated on {{$ctx.date}}');

    const result = await stencilWithCtx.resolve('ctx-template', {});
    expect(result.resolvedBody).toBe('Generated on 2026-01-01');
  });

  it('resolves custom_context values from config files as $ctx variables', async () => {
    await writeStencilConfig(
      path.join(projectDir, '.stencil'),
      ['custom_context:', "  team_name: 'Platform'"].join('\n'),
    );
    await stencil.create(makeFrontmatter('config-context'), 'Team: {{$ctx.team_name}}');

    const result = await stencil.resolve('config-context', {});
    expect(result.resolvedBody).toBe('Team: Platform');
  });

  it('merges global and project custom_context with project precedence', async () => {
    const globalProjectDir = await makeTempDir('stencil-global-config');

    try {
      await writeStencilConfig(
        path.join(globalProjectDir, '.stencil'),
        ['custom_context:', "  team_name: 'Platform'", "  jira_project: 'PLAT'"].join('\n'),
      );
      await writeStencilConfig(
        path.join(projectDir, '.stencil'),
        ['custom_context:', "  jira_project: 'CORE'", "  release_train: 'spring-26'"].join('\n'),
      );

      const stencilWithGlobal = new Stencil({
        globalDir: path.join(globalProjectDir, '.stencil'),
        projectDir,
      });

      await stencilWithGlobal.create(
        makeFrontmatter('merged-config-context'),
        'Team {{$ctx.team_name}} / Jira {{$ctx.jira_project}} / Train {{$ctx.release_train}}',
      );

      const result = await stencilWithGlobal.resolve('merged-config-context', {});
      expect(result.resolvedBody).toBe('Team Platform / Jira CORE / Train spring-26');
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });

  it('merges auto-discovered global config with project config using project precedence', async () => {
    const previousHome = process.env.HOME;
    const tempHome = await makeTempDir('stencil-home');

    try {
      process.env.HOME = tempHome;
      await writeStencilConfig(
        path.join(tempHome, '.stencil'),
        ['custom_context:', "  team_name: 'Platform'", "  jira_project: 'PLAT'"].join('\n'),
      );
      await writeStencilConfig(
        path.join(projectDir, '.stencil'),
        ['custom_context:', "  jira_project: 'CORE'", "  release_train: 'spring-26'"].join('\n'),
      );

      const stencilWithDiscoveredGlobal = new Stencil({ projectDir });
      await stencilWithDiscoveredGlobal.create(
        makeFrontmatter('auto-global-config'),
        'Team {{$ctx.team_name}} / Jira {{$ctx.jira_project}} / Train {{$ctx.release_train}}',
      );

      const result = await stencilWithDiscoveredGlobal.resolve('auto-global-config', {});
      expect(result.resolvedBody).toBe('Team Platform / Jira CORE / Train spring-26');
    } finally {
      process.env.HOME = previousHome;
      await rm(tempHome, { force: true, recursive: true });
    }
  });

  it('disables auto-discovered global config when globalDir is null', async () => {
    const previousHome = process.env.HOME;
    const tempHome = await makeTempDir('stencil-home');

    try {
      process.env.HOME = tempHome;
      await writeStencilConfig(
        path.join(tempHome, '.stencil'),
        ['custom_context:', "  team_name: 'Platform'"].join('\n'),
      );

      const projectOnlyStencil = new Stencil({
        globalDir: null,
        projectDir,
      });
      await projectOnlyStencil.create(
        makeFrontmatter('project-only-config'),
        'Team: {{$ctx.team_name}}',
      );

      const result = await projectOnlyStencil.resolve('project-only-config', {});
      expect(result.resolvedBody).toBe('Team: {{$ctx.team_name}}');
      expect(result.placeholders).toEqual([]);
    } finally {
      process.env.HOME = previousHome;
      await rm(tempHome, { force: true, recursive: true });
    }
  });

  it('applies runtime config overrides after file-based config', async () => {
    await writeStencilConfig(
      path.join(projectDir, '.stencil'),
      ['custom_context:', "  team_name: 'Platform'"].join('\n'),
    );

    const stencilWithOverrides = new Stencil({
      config: {
        customContext: {
          team_name: 'Core',
        },
      },
      projectDir,
    });

    await stencilWithOverrides.create(
      makeFrontmatter('override-config-context'),
      'Team: {{$ctx.team_name}}',
    );

    const result = await stencilWithOverrides.resolve('override-config-context', {});
    expect(result.resolvedBody).toBe('Team: Core');
  });

  it('returns unresolvedCount when a required placeholder has no value', async () => {
    const frontmatter: TemplateFrontmatter = {
      description: 'Needs input',
      name: 'needs-input',
      placeholders: [{ description: 'Required value', name: 'required_val', required: true }],
      version: 1,
    };
    await stencil.create(frontmatter, 'Value: {{required_val}}');

    const result = await stencil.resolve('needs-input', {});
    expect(result.unresolvedCount).toBe(1);
    expect(result.resolvedBody).toBe('Value: {{required_val}}');
  });

  it('throws when template does not exist', async () => {
    await expect(stencil.resolve('nonexistent', {})).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TemplateNotFoundError);
      expect((error as TemplateNotFoundError).code).toBe(StencilErrorCode.TEMPLATE_NOT_FOUND);
      expect((error as TemplateNotFoundError).templateName).toBe('nonexistent');
      return true;
    });
  });

  it('throws when template has validation errors', async () => {
    await stencil.storage.saveTemplate({
      body: 'body',
      filePath: '',
      frontmatter: { description: '', name: 'invalid-tmpl', version: 0 },
      source: 'project',
    });

    await expect(stencil.resolve('invalid-tmpl', {})).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TemplateValidationError);
      expect((error as TemplateValidationError).operation).toBe('resolve');
      expect((error as TemplateValidationError).templateName).toBe('invalid-tmpl');
      return true;
    });
  });

  it('does not let warnings block resolution', async () => {
    const frontmatter: TemplateFrontmatter = {
      description: 'Has warning placeholder',
      name: 'warn-resolve',
      placeholders: [{ description: 'Unused', name: 'unused_field', required: false }],
      version: 1,
    };

    await stencil.storage.saveTemplate({
      body: 'No placeholder token',
      filePath: '',
      frontmatter,
      source: 'project',
    });

    const result = await stencil.resolve('warn-resolve', {});
    expect(result.resolvedBody).toBe('No placeholder token');
  });

  it('throws a typed config error when project config is invalid', async () => {
    await writeStencilConfig(
      path.join(projectDir, '.stencil'),
      ['custom_context:', '  retries: 3'].join('\n'),
    );

    await expect(stencil.init()).rejects.toBeInstanceOf(StencilConfigError);
  });
});

describe('Stencil.search()', () => {
  it('finds templates matching the query in the name', async () => {
    await stencil.create(makeFrontmatter('create-rest-endpoint'), 'body');
    await stencil.create(makeFrontmatter('security-review'), 'body');

    const results = await stencil.search('rest');
    expect(results).toHaveLength(1);
    expect(results[0]?.frontmatter.name).toBe('create-rest-endpoint');
  });

  it('finds templates matching the query in the description', async () => {
    await stencil.create(
      makeFrontmatter('my-template', { description: 'Generates a migration script' }),
      'body',
    );
    await stencil.create(makeFrontmatter('other-template'), 'body');

    const results = await stencil.search('migration');
    expect(results).toHaveLength(1);
    expect(results[0]?.frontmatter.name).toBe('my-template');
  });

  it('finds templates matching the query in tags', async () => {
    await stencil.create(makeFrontmatter('tagged-template', { tags: ['backend', 'java'] }), 'body');
    await stencil.create(makeFrontmatter('no-tags'), 'body');

    const results = await stencil.search('java');
    expect(results).toHaveLength(1);
    expect(results[0]?.frontmatter.name).toBe('tagged-template');
  });

  it('returns empty array when no templates match', async () => {
    await stencil.create(makeFrontmatter('some-template'), 'body');
    expect(await stencil.search('zzznomatch')).toEqual([]);
  });

  it('surfaces malformed discovered templates instead of silently skipping them', async () => {
    await stencil.create(makeFrontmatter('healthy-template'), 'body');
    const badTemplatePath = path.join(projectDir, '.stencil', 'templates', 'broken.md');
    await writeFile(badTemplatePath, '---\nname: [broken\n---\nbody', 'utf8');

    await expect(stencil.search('template')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).code).toBe(StencilErrorCode.FRONTMATTER_INVALID_YAML);
      expect((error as ParseError).filePath).toBe(badTemplatePath);
      return true;
    });
  });
});

describe('Stencil.collections', () => {
  it('exposes createCollection and listCollections', async () => {
    await stencil.collections.createCollection('backend');
    const collections = await stencil.collections.listCollections();
    expect(collections).toContain('backend');
  });

  it('lists templates in a collection', async () => {
    await stencil.create(makeFrontmatter('endpoint'), 'body', 'backend');
    const inBackend = await stencil.collections.listTemplatesInCollection('backend');
    expect(inBackend).toHaveLength(1);
    expect(inBackend[0]?.frontmatter.name).toBe('endpoint');
  });
});

describe('Stencil globalDir support', () => {
  it('shows templates from globalDir in list and get', async () => {
    const globalProjectDir = await makeTempDir('stencil-global');

    try {
      const globalStorage = new LocalStorageProvider(path.join(globalProjectDir, '.stencil'));
      await globalStorage.saveTemplate({
        body: 'Global body',
        filePath: '',
        frontmatter: { description: 'Global template', name: 'global-tmpl', version: 1 },
        source: 'global',
      });

      const stencilWithGlobal = new Stencil({
        globalDir: path.join(globalProjectDir, '.stencil'),
        projectDir,
      });

      expect(await stencilWithGlobal.get('global-tmpl')).not.toBeNull();

      const all = await stencilWithGlobal.list();
      expect(all.some((template) => template.frontmatter.name === 'global-tmpl')).toBe(true);
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });

  it('prefers project templates over global templates with the same name', async () => {
    const globalProjectDir = await makeTempDir('stencil-global-override');

    try {
      const globalStorage = new LocalStorageProvider(path.join(globalProjectDir, '.stencil'));
      await globalStorage.saveTemplate({
        body: 'Global version',
        filePath: '',
        frontmatter: { description: 'Global version', name: 'shared-name', version: 1 },
        source: 'global',
      });

      const stencilWithGlobal = new Stencil({
        globalDir: path.join(globalProjectDir, '.stencil'),
        projectDir,
      });

      await stencilWithGlobal.create(makeFrontmatter('shared-name'), 'Project version');

      const fetched = await stencilWithGlobal.get('shared-name');
      expect(fetched?.body).toBe('Project version');
      expect(fetched?.source).toBe('project');
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });

  it('applies project config over global config for default_collection', async () => {
    const globalProjectDir = await makeTempDir('stencil-global-default-config');

    try {
      await writeStencilConfig(
        path.join(globalProjectDir, '.stencil'),
        ["default_collection: 'review'"].join('\n'),
      );
      await writeStencilConfig(
        path.join(projectDir, '.stencil'),
        ["default_collection: 'backend'"].join('\n'),
      );

      const stencilWithGlobal = new Stencil({
        globalDir: path.join(globalProjectDir, '.stencil'),
        projectDir,
      });

      const created = await stencilWithGlobal.create(makeFrontmatter('config-precedence'), 'Body');
      expect(created.collection).toBe('backend');
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });
});

describe('Stencil end-to-end happy path', () => {
  it('runs init, create, list, get, validate, resolve, and delete', async () => {
    await stencil.init();
    await expect(stat(path.join(projectDir, '.stencil', 'templates'))).resolves.toBeDefined();

    const frontmatter: TemplateFrontmatter = {
      description: 'Generate a REST endpoint with validation and tests',
      name: 'create-rest-endpoint',
      placeholders: [
        {
          default: 'create, read, update, delete',
          description: 'CRUD operations',
          name: 'operations',
          required: true,
        },
        { description: 'Domain entity name', name: 'entity_name', required: true },
      ],
      tags: ['backend', 'rest'],
      version: 1,
    };

    const created = await stencil.create(
      frontmatter,
      'Create REST endpoint for {{entity_name}} with ops: {{operations}}',
    );

    expect(created.frontmatter.name).toBe('create-rest-endpoint');
    expect(created.filePath).toBeTruthy();

    const all = await stencil.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.frontmatter.name).toBe('create-rest-endpoint');

    const fetched = await stencil.get('create-rest-endpoint');
    expect(fetched).not.toBeNull();
    expect(fetched?.frontmatter.description).toBe(
      'Generate a REST endpoint with validation and tests',
    );

    const validation = await stencil.validate('create-rest-endpoint');
    expect(validation.valid).toBe(true);

    const pinned: ContextProvider = {
      name: 'Pinned',
      resolve: async () => ({ project_name: 'test-project' }),
    };
    const stencilWithCtx = new Stencil({ contextProviders: [pinned], projectDir });
    const result = await stencilWithCtx.resolve('create-rest-endpoint', {
      entity_name: 'Invoice',
    });

    expect(result.resolvedBody).toBe(
      'Create REST endpoint for Invoice with ops: create, read, update, delete',
    );
    expect(result.unresolvedCount).toBe(0);

    const entityPlaceholder = result.placeholders.find(
      (placeholder) => placeholder.name === 'entity_name',
    );
    const operationPlaceholder = result.placeholders.find(
      (placeholder) => placeholder.name === 'operations',
    );
    expect(entityPlaceholder?.source).toBe('explicit');
    expect(operationPlaceholder?.source).toBe('default');

    expect(await stencil.delete('create-rest-endpoint')).toBe(true);
    expect(await stencil.get('create-rest-endpoint')).toBeNull();
    expect(await stencil.list()).toHaveLength(0);
  });

  it('runs create, update, copy, rename, validate, list, and delete coherently', async () => {
    await stencil.init();

    const created = await stencil.create(
      makeFrontmatter('workflow-template', {
        tags: ['draft'],
      }),
      'Initial {{item}} body',
    );
    expect(created.frontmatter.name).toBe('workflow-template');

    const updated = await stencil.update('workflow-template', {
      body: 'Updated {{item}} body',
      collection: 'backend',
      frontmatter: {
        description: 'Updated workflow template',
        tags: ['backend'],
      },
    });
    expect(updated.collection).toBe('backend');
    expect(updated.frontmatter.description).toBe('Updated workflow template');

    const copied = await stencil.copy('workflow-template', 'workflow-template-copy', {
      frontmatter: {
        description: 'Copied workflow template',
      },
    });
    expect(copied.frontmatter.name).toBe('workflow-template-copy');

    const renamed = await stencil.rename('workflow-template-copy', 'workflow-template-final');
    expect(renamed.frontmatter.name).toBe('workflow-template-final');

    const original = await stencil.get('workflow-template');
    const finalCopy = await stencil.get('workflow-template-final');
    expect(original?.collection).toBe('backend');
    expect(finalCopy?.frontmatter.description).toBe('Copied workflow template');

    const names = (await stencil.list()).map((template) => template.frontmatter.name);
    expect(names).toEqual(['workflow-template', 'workflow-template-final']);

    const validation = await stencil.validate('workflow-template-final');
    expect(validation.valid).toBe(true);

    expect(await stencil.delete('workflow-template')).toBe(true);
    expect(await stencil.delete('workflow-template-final')).toBe(true);
    expect(await stencil.get('workflow-template')).toBeNull();
    expect(await stencil.get('workflow-template-final')).toBeNull();
  });
});
