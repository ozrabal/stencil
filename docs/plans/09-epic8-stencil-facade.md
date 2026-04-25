# Plan: Epic 8 — Public API Facade (`Stencil` class)

**Goal:** Implement the `Stencil` facade in `stencil.ts` — the single entry point that wires all core modules together — add `StencilOptions` to `types.ts`, update `index.ts` exports, and create `stencil.test.ts` with a full integration test suite.

**Prerequisites:** Epics 1–7 must be complete. Verify before starting:

```bash
cd packages/core && npm run typecheck && npm test
```

Zero errors and all existing tests (parser, validator, context, resolver, storage, collections suites) must be passing.

**Validation command (run after each step):**

```bash
cd packages/core && npm run typecheck
```

**Full test run (run after all steps):**

```bash
cd packages/core && npm test
```

---

## Context: What Changes and Why

### Current state

- `index.ts` re-exports all modules (`collections`, `context`, `parser`, `resolver`, `storage`, `types`, `validator`) but has no `Stencil` class.
- `types.ts` has `StencilConfig` but is missing `StencilOptions`.
- No `stencil.ts` file exists.
- No integration test exists.

### Target state

| Concern                    | Current                 | Target                                                       |
| -------------------------- | ----------------------- | ------------------------------------------------------------ |
| `StencilOptions` type      | Missing from `types.ts` | Added to `types.ts`                                          |
| `Stencil` class            | Does not exist          | New `stencil.ts` — full facade wiring all modules            |
| `Stencil.init()`           | N/A                     | Creates `.stencil/templates/` directory if missing           |
| `Stencil.resolve()`        | N/A                     | Full pipeline: get → validate → resolveAll context → resolve |
| `Stencil.create()`         | N/A                     | Validates then saves; returns saved `Template`               |
| `Stencil.list()` / `get()` | N/A                     | Delegates to `LocalStorageProvider`                          |
| `Stencil.delete()`         | N/A                     | Delegates to `LocalStorageProvider`                          |
| `Stencil.validate()`       | N/A                     | Gets template, runs `validateTemplate()`                     |
| `Stencil.search()`         | N/A                     | Delegates to `listTemplates({ searchQuery })`                |
| `index.ts`                 | No `Stencil` export     | Exports `Stencil` from `./stencil.js`                        |
| `test/stencil.test.ts`     | Missing                 | Full integration suite — all methods, real temp directory    |

### Module wiring

The `Stencil` constructor instantiates all subsystems in dependency order:

```text
StencilOptions.projectDir + ".stencil"
  → LocalStorageProvider(stencilDir, globalDir)
      → CollectionManager(storage)
  → ContextEngine()
      .register(SystemContextProvider)
      .register(GitContextProvider)
      .register(ProjectContextProvider)
      .register(...options.contextProviders)   ← adapter-provided, override built-ins
```

### Key design decisions

**`projectDir` vs `stencilDir` distinction:**

- `StencilOptions.projectDir` is the project root (e.g. `/home/user/myproject`).
- `LocalStorageProvider` requires the `.stencil/` subdirectory as its root.
- The `Stencil` constructor appends `.stencil` internally: `stencilDir = path.join(options.projectDir, '.stencil')`.
- `StencilOptions.globalDir` is already the stencil directory (e.g. `~/.stencil`), passed through as-is.

**`Stencil.resolve()` error strategy:**

- Template not found → throws `Error` with a clear message including the template name.
- Template has validation errors → throws `Error` listing all error messages. Warnings are allowed — they don't block resolution.
- Adapters are responsible for catching and presenting these errors to the user.

**`Stencil.create()` return value:**

- After `storage.saveTemplate()`, the facade calls `storage.getTemplate()` to retrieve the saved template with its correct `filePath`. This ensures callers always receive a fully populated `Template` object.

**`Stencil.validate()` when template not found:**

- Returns `{ valid: false, issues: [{ severity: 'error', message: '...' }] }` rather than throwing. This is consistent with the validator's own return shape and allows callers to treat the result uniformly.

**Context provider registration order:**

- Built-in providers (System, Git, Project) registered first.
- `options.contextProviders` registered last — later-registered providers override earlier ones on key collision (per architecture §3.6). This allows adapters to override built-in variables.

**Exposed sub-components:**

- `context`, `storage`, and `collections` are exposed as `readonly` properties so adapters can reach subsystem functionality directly when needed.
- Parser, validator, and resolver are stateless module-level functions — they are not exposed as properties. Callers import them directly from the package.

### Impact on other files

| File                                 | Change                                 |
| ------------------------------------ | -------------------------------------- |
| `packages/core/src/types.ts`         | Add `StencilOptions` interface         |
| `packages/core/src/stencil.ts`       | New file — `Stencil` class             |
| `packages/core/src/index.ts`         | Add `export * from './stencil.js'`     |
| `packages/core/test/stencil.test.ts` | New file — full integration test suite |
| All other `src/` files               | No changes                             |

---

## Steps

### Step 1 — Verify baseline

Before touching any files, confirm the starting state is clean.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all existing tests pass (parser + validator + context + resolver + storage + collections suites).

---

### Step 2 — Add `StencilOptions` to `types.ts`

`StencilOptions` is the constructor argument for the `Stencil` facade. It belongs in `types.ts` alongside the other interfaces so adapters can import it independently.

**File:** `packages/core/src/types.ts`

Append the following block at the end of the file, after the `StencilConfig` interface:

```typescript
// ── Public API ─────────────────────────────────────────

export interface StencilOptions {
  /** Path to the project root directory (Stencil appends .stencil/ internally). */
  projectDir: string;
  /** Path to the global templates directory (e.g. ~/.stencil/). Optional. */
  globalDir?: string;
  /** Partial config overrides. */
  config?: Partial<StencilConfig>;
  /** Additional context providers registered by the adapter. Override built-ins on collision. */
  contextProviders?: ContextProvider[];
}
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 3 — Create `stencil.ts`

Create the `Stencil` facade class. This is a new file.

**File:** `packages/core/src/stencil.ts`

**What to write:**

```typescript
// Stencil — high-level facade wiring all core modules.
// Architecture §3.9
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { CollectionManager } from './collections.js';
import {
  ContextEngine,
  GitContextProvider,
  ProjectContextProvider,
  SystemContextProvider,
} from './context.js';
import { resolveTemplate } from './resolver.js';
import { LocalStorageProvider } from './storage.js';
import type {
  ListOptions,
  ResolutionResult,
  Template,
  TemplateFrontmatter,
  ValidationResult,
  StencilOptions,
} from './types.js';
import { validateTemplate } from './validator.js';

/**
 * High-level facade for @stencil-pm/core.
 *
 * Instantiate once per adapter session:
 *   const stencil = new Stencil({ projectDir: '/path/to/project' });
 *   await stencil.init();
 *
 * The facade wires together storage, context resolution, validation,
 * and placeholder resolution into cohesive high-level operations.
 */
export class Stencil {
  /** Registered context providers and context resolution. */
  readonly context: ContextEngine;
  /** Template file storage (project + optional global directory). */
  readonly storage: LocalStorageProvider;
  /** Collection CRUD operations. */
  readonly collections: CollectionManager;

  private readonly stencilDir: string;

  constructor(options: StencilOptions) {
    this.stencilDir = path.join(options.projectDir, '.stencil');
    this.storage = new LocalStorageProvider(this.stencilDir, options.globalDir);

    this.context = new ContextEngine();
    this.context.register(new SystemContextProvider());
    this.context.register(new GitContextProvider());
    this.context.register(new ProjectContextProvider());
    for (const provider of options.contextProviders ?? []) {
      this.context.register(provider);
    }

    this.collections = new CollectionManager(this.storage);
  }

  /**
   * Initializes the .stencil/ directory structure.
   * Creates .stencil/templates/ if it does not already exist.
   * Safe to call multiple times (idempotent).
   */
  async init(): Promise<void> {
    await mkdir(path.join(this.stencilDir, 'templates'), { recursive: true });
  }

  /**
   * Runs the full resolution pipeline for a named template:
   *   1. Fetch template from storage
   *   2. Validate — throws if there are any error-severity issues
   *   3. Resolve all context variables from registered providers
   *   4. Substitute placeholders using explicit values + context + defaults
   *
   * @param templateName - The kebab-case template name
   * @param explicitValues - User-provided placeholder values (highest priority)
   * @throws Error if the template is not found or has validation errors
   */
  async resolve(
    templateName: string,
    explicitValues: Record<string, string>,
  ): Promise<ResolutionResult> {
    const template = await this.storage.getTemplate(templateName);
    if (template === null) {
      throw new Error(`Template not found: "${templateName}"`);
    }

    const validation = validateTemplate(template);
    if (!validation.valid) {
      const errorMessages = validation.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.message)
        .join('; ');
      throw new Error(`Template "${templateName}" has validation errors: ${errorMessages}`);
    }

    const context = await this.context.resolveAll();
    return resolveTemplate(template, { context, explicit: explicitValues });
  }

  /**
   * Creates and saves a new template.
   * Validates the template before saving — throws if there are error-severity issues.
   * Returns the saved template with the correct filePath populated.
   *
   * @param frontmatter - Template metadata
   * @param body - Template body with {{placeholder}} tokens
   * @param collection - Optional collection name (maps to .stencil/collections/<name>/)
   * @throws Error if validation fails
   */
  async create(
    frontmatter: TemplateFrontmatter,
    body: string,
    collection?: string,
  ): Promise<Template> {
    const template: Template = {
      body,
      collection,
      filePath: '',
      frontmatter,
      source: 'project',
    };

    const validation = validateTemplate(template);
    if (!validation.valid) {
      const errorMessages = validation.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.message)
        .join('; ');
      throw new Error(`Cannot create template: ${errorMessages}`);
    }

    await this.storage.saveTemplate(template);

    // Re-fetch to obtain the real filePath set by storage
    const saved = await this.storage.getTemplate(frontmatter.name);
    return saved ?? template;
  }

  /**
   * Lists all templates, optionally filtered by collection, tags, source, or search query.
   */
  async list(options?: ListOptions): Promise<Template[]> {
    return this.storage.listTemplates(options);
  }

  /**
   * Returns a single template by name, or null if not found.
   * Project templates take precedence over global templates on name collision.
   */
  async get(name: string): Promise<Template | null> {
    return this.storage.getTemplate(name);
  }

  /**
   * Deletes a template by name from the project directory.
   * Returns true if the template was found and deleted, false otherwise.
   */
  async delete(name: string): Promise<boolean> {
    return this.storage.deleteTemplate(name);
  }

  /**
   * Validates a template by name against all 10 validation rules.
   * If the template is not found, returns a failed ValidationResult (does not throw).
   */
  async validate(templateName: string): Promise<ValidationResult> {
    const template = await this.storage.getTemplate(templateName);
    if (template === null) {
      return {
        issues: [{ message: `Template not found: "${templateName}"`, severity: 'error' }],
        valid: false,
      };
    }
    return validateTemplate(template);
  }

  /**
   * Searches templates by a query string.
   * Matches against name, description, and tags (case-insensitive substring match).
   * Returns an empty array if no templates match.
   */
  async search(query: string): Promise<Template[]> {
    return this.storage.listTemplates({ searchQuery: query });
  }
}
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 4 — Update `index.ts`

Add the `stencil.ts` module to the public API re-exports.

**File:** `packages/core/src/index.ts`

Replace the entire file content with:

```typescript
// Public API for @stencil-pm/core
export * from './collections.js';
export * from './context.js';
export * from './parser.js';
export * from './resolver.js';
export * from './stencil.js';
export * from './storage.js';
export * from './types.js';
export * from './validator.js';
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors. The `Stencil` class and `StencilOptions` interface are now accessible to any consumer importing `@stencil-pm/core`.

---

### Step 5 — Create `stencil.test.ts`

Create the integration test file. Tests use a real temporary directory — no mocking. The test suite covers all eight `Stencil` methods and the full end-to-end happy path.

**File:** `packages/core/test/stencil.test.ts`

**Coverage requirements:**

| Method / area           | Cases required                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `constructor`           | Exposes `context`, `storage`, `collections` as readonly properties                                 |
| `init()`                | Creates `.stencil/templates/`; idempotent (no throw on second call)                                |
| `create()`              | Saves template; returns template with correct filePath; throws on invalid frontmatter              |
| `list()`                | Returns all templates; respects `collection` filter; respects `searchQuery` filter                 |
| `get()`                 | Returns template by name; returns null for unknown name                                            |
| `delete()`              | Returns true and removes template; returns false for unknown name                                  |
| `validate()`            | Returns valid result for valid template; invalid result for bad template; handles not-found        |
| `resolve()`             | Full pipeline with explicit values; falls back to defaults; throws on not-found; throws on invalid |
| `search()`              | Matches by name; matches by description; returns empty array for no match                          |
| `collections`           | `createCollection` and `listCollections` accessible through the exposed property                   |
| End-to-end happy path   | init → create → list → get → validate → resolve → delete                                           |
| Custom context provider | Adapter-registered provider overrides built-in values                                              |

**What to write:**

```typescript
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Stencil } from '../src/stencil.js';
import type { ContextProvider, TemplateFrontmatter } from '../src/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── constructor ────────────────────────────────────────────────────────────

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
      projectDir,
      contextProviders: [customProvider],
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
      projectDir,
      contextProviders: [overrideProvider],
    });

    const ctx = await stencilWithOverride.context.resolveAll();
    expect(ctx['date']).toBe('overridden-date');
  });
});

// ── init() ────────────────────────────────────────────────────────────────

describe('Stencil.init()', () => {
  it('creates the .stencil/templates/ directory', async () => {
    await stencil.init();

    const { stat } = await import('node:fs/promises');
    const stats = await stat(path.join(projectDir, '.stencil', 'templates'));
    expect(stats.isDirectory()).toBe(true);
  });

  it('is idempotent — calling twice does not throw', async () => {
    await stencil.init();
    await expect(stencil.init()).resolves.toBeUndefined();
  });

  it('does not throw if .stencil/templates already exists', async () => {
    await mkdir(path.join(projectDir, '.stencil', 'templates'), { recursive: true });
    await expect(stencil.init()).resolves.toBeUndefined();
  });
});

// ── create() ──────────────────────────────────────────────────────────────

describe('Stencil.create()', () => {
  it('saves a template and returns it with a populated filePath', async () => {
    const fm = makeFrontmatter('my-template');
    const template = await stencil.create(fm, 'Hello world');

    expect(template.frontmatter.name).toBe('my-template');
    expect(template.body).toBe('Hello world');
    expect(template.filePath).toBeTruthy();
    expect(template.source).toBe('project');
  });

  it('creates a template in a collection', async () => {
    const fm = makeFrontmatter('endpoint');
    const template = await stencil.create(fm, 'Endpoint body', 'backend');

    expect(template.collection).toBe('backend');
    expect(template.filePath).toContain('backend');
  });

  it('returned template is retrievable via get()', async () => {
    await stencil.create(makeFrontmatter('retrievable'), 'Body text');

    const fetched = await stencil.get('retrievable');
    expect(fetched).not.toBeNull();
    expect(fetched!.frontmatter.name).toBe('retrievable');
  });

  it('throws if frontmatter is invalid (missing description)', async () => {
    const badFm: TemplateFrontmatter = { description: '', name: 'bad-template', version: 1 };
    await expect(stencil.create(badFm, 'body')).rejects.toThrow();
  });

  it('throws if name is not kebab-case', async () => {
    const badFm = makeFrontmatter('BadName');
    await expect(stencil.create(badFm, 'body')).rejects.toThrow();
  });

  it('preserves all frontmatter fields', async () => {
    const fm: TemplateFrontmatter = {
      author: 'alice',
      description: 'Full featured',
      name: 'full-template',
      placeholders: [{ description: 'Entity name', name: 'entity', required: true }],
      tags: ['backend'],
      version: 2,
    };

    const created = await stencil.create(fm, 'Entity: {{entity}}');

    expect(created.frontmatter.author).toBe('alice');
    expect(created.frontmatter.tags).toEqual(['backend']);
    expect(created.frontmatter.version).toBe(2);
    expect(created.frontmatter.placeholders).toHaveLength(1);
  });
});

// ── list() ────────────────────────────────────────────────────────────────

describe('Stencil.list()', () => {
  it('returns empty array when no templates exist', async () => {
    expect(await stencil.list()).toEqual([]);
  });

  it('returns all created templates', async () => {
    await stencil.create(makeFrontmatter('tmpl-a'), 'Body A');
    await stencil.create(makeFrontmatter('tmpl-b'), 'Body B');

    const templates = await stencil.list();
    expect(templates).toHaveLength(2);
    const names = templates.map((t) => t.frontmatter.name);
    expect(names).toContain('tmpl-a');
    expect(names).toContain('tmpl-b');
  });

  it('filters by collection', async () => {
    await stencil.create(makeFrontmatter('backend-tmpl'), 'body', 'backend');
    await stencil.create(makeFrontmatter('review-tmpl'), 'body', 'review');

    const backendOnly = await stencil.list({ collection: 'backend' });
    expect(backendOnly).toHaveLength(1);
    expect(backendOnly[0]!.frontmatter.name).toBe('backend-tmpl');
  });

  it('filters by searchQuery (name match)', async () => {
    await stencil.create(makeFrontmatter('rest-endpoint'), 'body');
    await stencil.create(makeFrontmatter('security-review'), 'body');

    const results = await stencil.list({ searchQuery: 'rest' });
    expect(results).toHaveLength(1);
    expect(results[0]!.frontmatter.name).toBe('rest-endpoint');
  });

  it('filters by tags', async () => {
    await stencil.create(makeFrontmatter('tagged', { tags: ['backend'] }), 'body');
    await stencil.create(makeFrontmatter('untagged'), 'body');

    const tagged = await stencil.list({ tags: ['backend'] });
    expect(tagged).toHaveLength(1);
    expect(tagged[0]!.frontmatter.name).toBe('tagged');
  });
});

// ── get() ─────────────────────────────────────────────────────────────────

describe('Stencil.get()', () => {
  it('returns the template with correct fields', async () => {
    await stencil.create(makeFrontmatter('fetch-me'), 'Fetch body');

    const template = await stencil.get('fetch-me');
    expect(template).not.toBeNull();
    expect(template!.frontmatter.name).toBe('fetch-me');
    expect(template!.body).toBe('Fetch body');
  });

  it('returns null for an unknown template name', async () => {
    expect(await stencil.get('does-not-exist')).toBeNull();
  });
});

// ── delete() ──────────────────────────────────────────────────────────────

describe('Stencil.delete()', () => {
  it('deletes an existing template and returns true', async () => {
    await stencil.create(makeFrontmatter('to-delete'), 'body');

    const result = await stencil.delete('to-delete');
    expect(result).toBe(true);
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

// ── validate() ────────────────────────────────────────────────────────────

describe('Stencil.validate()', () => {
  it('returns valid result for a well-formed template', async () => {
    await stencil.create(makeFrontmatter('valid-tmpl'), 'Body text');

    const result = await stencil.validate('valid-tmpl');
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('returns invalid result when template has error-severity issues', async () => {
    // Bypass create() validation by writing directly to storage
    await stencil.storage.saveTemplate({
      body: 'body',
      filePath: '',
      frontmatter: { description: '', name: 'broken', version: 0 },
      source: 'project',
    });

    const result = await stencil.validate('broken');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('returns failed result (not throw) when template is not found', async () => {
    const result = await stencil.validate('nonexistent');
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.severity).toBe('error');
    expect(result.issues[0]!.message).toContain('nonexistent');
  });

  it('returns warnings but valid:true for a template with warnings only', async () => {
    // Template with a declared placeholder not referenced in body (V9 warning)
    const fm: TemplateFrontmatter = {
      description: 'Has warning',
      name: 'warn-tmpl',
      placeholders: [{ description: 'unused placeholder', name: 'unused', required: true }],
      version: 1,
    };
    await stencil.storage.saveTemplate({
      body: 'No placeholder token here',
      filePath: '',
      frontmatter: fm,
      source: 'project',
    });

    const result = await stencil.validate('warn-tmpl');
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
  });
});

// ── resolve() ─────────────────────────────────────────────────────────────

describe('Stencil.resolve()', () => {
  it('resolves explicit placeholder values into the body', async () => {
    const fm: TemplateFrontmatter = {
      description: 'REST endpoint generator',
      name: 'create-endpoint',
      placeholders: [{ description: 'Entity name', name: 'entity', required: true }],
      version: 1,
    };
    await stencil.create(fm, 'Create endpoint for {{entity}}');

    const result = await stencil.resolve('create-endpoint', { entity: 'Invoice' });
    expect(result.resolvedBody).toBe('Create endpoint for Invoice');
    expect(result.unresolvedCount).toBe(0);
    expect(result.placeholders[0]).toMatchObject({
      name: 'entity',
      source: 'explicit',
      value: 'Invoice',
    });
  });

  it('uses default value when no explicit value provided', async () => {
    const fm: TemplateFrontmatter = {
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
    await stencil.create(fm, 'Operations: {{ops}}');

    const result = await stencil.resolve('with-default', {});
    expect(result.resolvedBody).toBe('Operations: create, read, update, delete');
    expect(result.placeholders[0]!.source).toBe('default');
  });

  it('resolves $ctx.* tokens from context providers', async () => {
    const pinned: ContextProvider = {
      name: 'Pinned',
      resolve: async () => ({ date: '2026-01-01' }),
    };
    const stencilWithCtx = new Stencil({ projectDir, contextProviders: [pinned] });

    await stencilWithCtx.create(makeFrontmatter('ctx-template'), 'Generated on {{$ctx.date}}');

    const result = await stencilWithCtx.resolve('ctx-template', {});
    expect(result.resolvedBody).toBe('Generated on 2026-01-01');
  });

  it('returns unresolvedCount > 0 when required placeholder has no value', async () => {
    const fm: TemplateFrontmatter = {
      description: 'Needs input',
      name: 'needs-input',
      placeholders: [{ description: 'Required value', name: 'required_val', required: true }],
      version: 1,
    };
    await stencil.create(fm, 'Value: {{required_val}}');

    const result = await stencil.resolve('needs-input', {});
    expect(result.unresolvedCount).toBe(1);
    expect(result.resolvedBody).toBe('Value: {{required_val}}');
  });

  it('throws when template does not exist', async () => {
    await expect(stencil.resolve('nonexistent', {})).rejects.toThrow('nonexistent');
  });

  it('throws when template has validation errors', async () => {
    // Write an invalid template directly to storage (bypassing create() validation)
    await stencil.storage.saveTemplate({
      body: 'body',
      filePath: '',
      frontmatter: { description: '', name: 'invalid-tmpl', version: 0 },
      source: 'project',
    });

    await expect(stencil.resolve('invalid-tmpl', {})).rejects.toThrow();
  });

  it('warnings do not block resolution', async () => {
    // Declared placeholder not used in body (V9 = warning only)
    const fm: TemplateFrontmatter = {
      description: 'Has warning placeholder',
      name: 'warn-resolve',
      placeholders: [{ description: 'Unused', name: 'unused_field', required: false }],
      version: 1,
    };
    await stencil.storage.saveTemplate({
      body: 'No placeholder token',
      filePath: '',
      frontmatter: fm,
      source: 'project',
    });

    // Should resolve successfully despite the V9 warning
    const result = await stencil.resolve('warn-resolve', {});
    expect(result.resolvedBody).toBe('No placeholder token');
  });
});

// ── search() ──────────────────────────────────────────────────────────────

describe('Stencil.search()', () => {
  it('finds templates matching the query in the name', async () => {
    await stencil.create(makeFrontmatter('create-rest-endpoint'), 'body');
    await stencil.create(makeFrontmatter('security-review'), 'body');

    const results = await stencil.search('rest');
    expect(results).toHaveLength(1);
    expect(results[0]!.frontmatter.name).toBe('create-rest-endpoint');
  });

  it('finds templates matching the query in the description', async () => {
    await stencil.create(
      makeFrontmatter('my-template', { description: 'Generates a migration script' }),
      'body',
    );
    await stencil.create(makeFrontmatter('other-template'), 'body');

    const results = await stencil.search('migration');
    expect(results).toHaveLength(1);
    expect(results[0]!.frontmatter.name).toBe('my-template');
  });

  it('finds templates matching the query in tags', async () => {
    await stencil.create(makeFrontmatter('tagged-template', { tags: ['backend', 'java'] }), 'body');
    await stencil.create(makeFrontmatter('no-tags'), 'body');

    const results = await stencil.search('java');
    expect(results).toHaveLength(1);
    expect(results[0]!.frontmatter.name).toBe('tagged-template');
  });

  it('returns empty array when no templates match', async () => {
    await stencil.create(makeFrontmatter('some-template'), 'body');
    expect(await stencil.search('zzznomatch')).toEqual([]);
  });

  it('returns all templates when query matches all', async () => {
    await stencil.create(makeFrontmatter('alpha'), 'body');
    await stencil.create(makeFrontmatter('beta'), 'body');

    // Empty list — no query → we use list() for that; search with broad term
    await stencil.create(
      makeFrontmatter('gamma', { description: 'shared-tag description' }),
      'body',
    );

    const results = await stencil.search('shared-tag');
    expect(results).toHaveLength(1);
  });
});

// ── collections property ──────────────────────────────────────────────────

describe('Stencil.collections', () => {
  it('createCollection and listCollections are accessible via the exposed property', async () => {
    await stencil.collections.createCollection('backend');
    const collections = await stencil.collections.listCollections();
    expect(collections).toContain('backend');
  });

  it('templates created with a collection appear in listTemplatesInCollection', async () => {
    await stencil.create(makeFrontmatter('endpoint'), 'body', 'backend');
    const inBackend = await stencil.collections.listTemplatesInCollection('backend');
    expect(inBackend).toHaveLength(1);
    expect(inBackend[0]!.frontmatter.name).toBe('endpoint');
  });
});

// ── globalDir support ─────────────────────────────────────────────────────

describe('Stencil — globalDir support', () => {
  it('templates from globalDir are visible in list() and get()', async () => {
    const globalProjectDir = await makeTempDir('stencil-global');

    try {
      // Write a template directly to the global stencil dir
      const globalStorage = new (await import('../src/storage.js')).LocalStorageProvider(
        path.join(globalProjectDir, '.stencil'),
      );
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

      const fetched = await stencilWithGlobal.get('global-tmpl');
      expect(fetched).not.toBeNull();

      const all = await stencilWithGlobal.list();
      expect(all.some((t) => t.frontmatter.name === 'global-tmpl')).toBe(true);
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });

  it('project template takes precedence over global template with same name', async () => {
    const globalProjectDir = await makeTempDir('stencil-global-override');

    try {
      const globalStorage = new (await import('../src/storage.js')).LocalStorageProvider(
        path.join(globalProjectDir, '.stencil'),
      );
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
      expect(fetched!.body).toBe('Project version');
      expect(fetched!.source).toBe('project');
    } finally {
      await rm(globalProjectDir, { force: true, recursive: true });
    }
  });
});

// ── End-to-end happy path ─────────────────────────────────────────────────

describe('Stencil — end-to-end happy path', () => {
  it('full lifecycle: init → create → list → get → validate → resolve → delete', async () => {
    // Step 1: init
    await stencil.init();
    const { stat } = await import('node:fs/promises');
    await expect(stat(path.join(projectDir, '.stencil', 'templates'))).resolves.toBeDefined();

    // Step 2: create
    const fm: TemplateFrontmatter = {
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
      fm,
      'Create REST endpoint for {{entity_name}} with ops: {{operations}}',
    );

    expect(created.frontmatter.name).toBe('create-rest-endpoint');
    expect(created.filePath).toBeTruthy();

    // Step 3: list
    const all = await stencil.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.frontmatter.name).toBe('create-rest-endpoint');

    // Step 4: get
    const fetched = await stencil.get('create-rest-endpoint');
    expect(fetched).not.toBeNull();
    expect(fetched!.frontmatter.description).toBe(
      'Generate a REST endpoint with validation and tests',
    );

    // Step 5: validate
    const validation = await stencil.validate('create-rest-endpoint');
    expect(validation.valid).toBe(true);

    // Step 6: resolve — provide entity_name; operations falls back to default
    const pinned: ContextProvider = {
      name: 'Pinned',
      resolve: async () => ({ project_name: 'test-project' }),
    };
    const stencilWithCtx = new Stencil({ contextProviders: [pinned], projectDir });
    const result = await stencilWithCtx.resolve('create-rest-endpoint', { entity_name: 'Invoice' });

    expect(result.resolvedBody).toBe(
      'Create REST endpoint for Invoice with ops: create, read, update, delete',
    );
    expect(result.unresolvedCount).toBe(0);

    const entityPlaceholder = result.placeholders.find((p) => p.name === 'entity_name');
    const opPlaceholder = result.placeholders.find((p) => p.name === 'operations');
    expect(entityPlaceholder!.source).toBe('explicit');
    expect(opPlaceholder!.source).toBe('default');

    // Step 7: delete
    const deleted = await stencil.delete('create-rest-endpoint');
    expect(deleted).toBe(true);
    expect(await stencil.get('create-rest-endpoint')).toBeNull();
    expect(await stencil.list()).toHaveLength(0);
  });
});
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 6 — Run the full test suite

```bash
cd packages/core && npm test
```

**Expected outcome:**

- All previously passing tests (parser + validator + context + resolver + storage + collections) still pass.
- All new `stencil.test.ts` tests pass.
- Tests use real temp directories — actual file I/O happens on disk.

**If tests fail:**

| Symptom                                                                  | Likely cause                                                                   | Fix                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `Stencil.resolve()` does not throw on missing template                   | `getTemplate()` returns null but code does not check                           | Confirm `if (template === null) throw new Error(...)` guard is present            |
| `Stencil.resolve()` throws on templates with warnings only               | Code checks `issues.length > 0` instead of filtering by `severity === 'error'` | Confirm only error-severity issues block resolution                               |
| `Stencil.create()` does not throw on invalid frontmatter                 | `validateTemplate()` called but result not checked before saving               | Confirm `if (!validation.valid) throw ...` before `saveTemplate()`                |
| `Stencil.create()` returns wrong `filePath`                              | Returning the pre-save template object with `filePath: ''`                     | Confirm `storage.getTemplate()` is called after saving to retrieve the real path  |
| `Stencil.validate()` throws on missing template instead of returning     | Error path throws instead of returning a failed `ValidationResult`             | Confirm the null-check returns `{ valid: false, issues: [...] }` without throwing |
| `init()` throws on second call                                           | `mkdir` called without `{ recursive: true }`                                   | Confirm `mkdir(path, { recursive: true })` is used                                |
| Context provider override test fails                                     | Built-in providers registered after adapter providers                          | Confirm adapter providers from `options.contextProviders` are registered last     |
| `search()` returns wrong results                                         | Passing `query` to a filter that doesn't exist, or `searchQuery` key wrong     | Confirm `storage.listTemplates({ searchQuery: query })` is called                 |
| TypeScript error: `stencilDir` used before assignment                    | Constructor field initialization order issue                                   | Confirm `this.stencilDir` is assigned before `this.storage` in the constructor    |
| `stencil.test.ts` dynamic import warning (`import('../src/storage.js')`) | Some bundler configurations flag dynamic imports in tests                      | Convert to static import at the top of the test file if lint rule blocks it       |

---

### Step 7 — Verify typecheck and final state

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all tests pass (parser + validator + context + resolver + storage + collections + stencil/integration suites).

This is the exit criterion for Epic 8.

---

## Exit Criteria Checklist

- [ ] `StencilOptions` interface added to `types.ts` with `projectDir`, `globalDir?`, `config?`, `contextProviders?`
- [ ] `stencil.ts` created with `Stencil` class
- [ ] Constructor accepts `StencilOptions` and wires `LocalStorageProvider`, `ContextEngine`, `CollectionManager`
- [ ] Constructor registers `SystemContextProvider`, `GitContextProvider`, `ProjectContextProvider`
- [ ] Constructor registers adapter-provided `contextProviders` last (override built-ins on collision)
- [ ] `context`, `storage`, `collections` exposed as `readonly` properties
- [ ] `init()` creates `.stencil/templates/` with `{ recursive: true }` — idempotent
- [ ] `resolve()` throws if template not found
- [ ] `resolve()` throws if template has error-severity validation issues
- [ ] `resolve()` does NOT throw for templates with warning-only issues
- [ ] `resolve()` calls `context.resolveAll()` and passes result to `resolveTemplate()`
- [ ] `create()` validates before saving — throws on error-severity issues
- [ ] `create()` returns template with real `filePath` (fetched from storage after save)
- [ ] `list()` delegates to `storage.listTemplates()` and passes options through
- [ ] `get()` delegates to `storage.getTemplate()`
- [ ] `delete()` delegates to `storage.deleteTemplate()`
- [ ] `validate()` returns `{ valid: false, ... }` (does not throw) when template is not found
- [ ] `validate()` returns warnings with `valid: true` when only warning-severity issues exist
- [ ] `search()` delegates to `storage.listTemplates({ searchQuery: query })`
- [ ] `index.ts` updated to include `export * from './stencil.js'`
- [ ] `npm run typecheck` exits with zero errors
- [ ] `npm test` passes — all tests green, no regressions in prior suites
