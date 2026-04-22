# Plan: Epic 6 — Storage (`LocalStorageProvider`)

**Goal:** Implement `LocalStorageProvider` in `storage.ts` — the filesystem-based `StorageProvider` — and create `storage.test.ts` with a full test suite covering all five operations, a round-trip test, collection placement, and global/project precedence.

**Prerequisites:** Epics 1–5 must be complete. Verify before starting:

```bash
cd packages/core && npm run typecheck && npm test
```

Zero errors and all existing tests (parser, validator, context, resolver) passing expected.

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

`storage.ts` is a complete stub — every method throws `Error('Not implemented')`. There are no storage tests.

### Target state

| Concern            | Current | Target                                                                                                                                                     |
| ------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listTemplates()`  | Throws  | Recursive scan of `templates/` and `collections/*/`, parse each `.md`, apply `ListOptions` filters, project wins on name collision, sort collection → name |
| `getTemplate()`    | Throws  | Search project dir first, then global dir; parse and return first match                                                                                    |
| `saveTemplate()`   | Throws  | Serialize to YAML frontmatter + body, `mkdir -p`, write to correct path                                                                                    |
| `deleteTemplate()` | Throws  | Locate file by template name, delete it, return `boolean`                                                                                                  |
| `templateExists()` | Throws  | `stat()`-based existence check without full parse                                                                                                          |
| `storage.test.ts`  | Missing | Full suite — round-trip, collection placement, precedence, ListOptions filters                                                                             |

### Directory structure (architecture §3.7)

Both `projectDir` and `globalDir` point directly to their respective `.stencil/` directories (not the project root).

```text
<stencilDir>/                    ← projectDir or globalDir
  templates/                     ← uncategorized templates
    <name>.md
  collections/                   ← collection-organized templates
    <collection-name>/
      <name>.md
```

`parseTemplate()` (already implemented in Epic 2) detects collection from the path via `/collections/<name>/` regex — no extra logic needed in the storage layer.

### Serialization format

```text
---
name: my-template
description: A description
version: 1
---

Body text with {{placeholder}} tokens.
```

Uses `yaml.stringify()` from the existing `yaml` dependency to produce the frontmatter block.

### Key behavioural rules (architecture §3.7)

- **Project wins on name collision**: When `projectDir` and `globalDir` both contain a template with the same `frontmatter.name`, the project template is returned and the global one is excluded.
- **Save always targets projectDir**: `saveTemplate()` writes to `projectDir` only — never to `globalDir`.
- **Sort order**: `listTemplates()` results sorted by collection (alphabetical, `undefined` sorts as `''`) then by name (alphabetical).
- **Skip unparseable files**: `listTemplates()` silently skips any `.md` file that fails to parse; it never throws due to a single bad file.
- **Symlinks**: Not followed — `readdir` entries with `withFileTypes` check `isDirectory()` / `isFile()` directly, so symlinks to directories are not traversed.
- **Path safety**: File paths are built exclusively with `path.join(baseDir, ...)` using validated template names (kebab-case enforced by the validator) and collection names (directory names from `readdir`). No user-supplied path segments reach the filesystem uncontrolled.

### Impact on other files

| File                                 | Change                            |
| ------------------------------------ | --------------------------------- |
| `packages/core/src/storage.ts`       | Full implementation replaces stub |
| `packages/core/test/storage.test.ts` | New file — full test suite        |
| All other `src/` files               | No changes                        |

---

## Steps

### Step 1 — Verify baseline

Before touching any files, confirm the starting state is clean.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all existing tests pass (parser + validator + context + resolver suites). If any fail, fix them before proceeding.

---

### Step 2 — Implement `storage.ts`

Replace the entire stub with the full implementation.

**File:** `packages/core/src/storage.ts`

**What to write:**

```typescript
// LocalStorageProvider — filesystem-based StorageProvider.
// Architecture §3.7
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

import { parseTemplate } from './parser.js';
import type {
  ListOptions,
  PlaceholderDefinition,
  StorageProvider,
  Template,
  TemplateFrontmatter,
  TemplateSource,
} from './types.js';

// ── LocalStorageProvider ────────────────────────────────────────────────────

/**
 * Filesystem-based StorageProvider.
 * Reads and writes templates as .md files within a .stencil/ directory.
 *
 * Directory layout (within projectDir / globalDir):
 *   templates/<name>.md                   ← uncategorized
 *   collections/<collection>/<name>.md    ← in a collection
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly projectDir: string,
    private readonly globalDir?: string,
  ) {}

  async listTemplates(options?: ListOptions): Promise<Template[]> {
    const projectTemplates = await loadTemplatesFromDir(this.projectDir, 'project');
    const globalTemplates = this.globalDir
      ? await loadTemplatesFromDir(this.globalDir, 'global')
      : [];

    // Project wins on name collision
    const projectNames = new Set(projectTemplates.map((t) => t.frontmatter.name));
    const merged = [
      ...projectTemplates,
      ...globalTemplates.filter((t) => !projectNames.has(t.frontmatter.name)),
    ];

    // Apply ListOptions filters
    let filtered = merged;

    if (options?.collection !== undefined) {
      filtered = filtered.filter((t) => t.collection === options.collection);
    }

    if (options?.source !== undefined) {
      filtered = filtered.filter((t) => t.source === options.source);
    }

    if (options?.tags && options.tags.length > 0) {
      const filterTags = new Set(options.tags);
      filtered = filtered.filter((t) =>
        t.frontmatter.tags?.some((tag) => filterTags.has(tag)),
      );
    }

    if (options?.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.frontmatter.name.toLowerCase().includes(query) ||
          t.frontmatter.description.toLowerCase().includes(query) ||
          t.frontmatter.tags?.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    // Sort: collection alphabetical (undefined → ''), then name alphabetical
    filtered.sort((a, b) => {
      const collA = a.collection ?? '';
      const collB = b.collection ?? '';
      if (collA !== collB) return collA.localeCompare(collB);
      return a.frontmatter.name.localeCompare(b.frontmatter.name);
    });

    return filtered;
  }

  async getTemplate(name: string): Promise<null | Template> {
    const fromProject = await findAndParseTemplate(name, this.projectDir, 'project');
    if (fromProject) return fromProject;
    if (this.globalDir) {
      return findAndParseTemplate(name, this.globalDir, 'global');
    }
    return null;
  }

  async saveTemplate(template: Template): Promise<void> {
    const filePath = resolveTemplatePath(this.projectDir, template);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, serializeTemplate(template), 'utf8');
  }

  async deleteTemplate(name: string): Promise<boolean> {
    const filePath = await findTemplatePath(name, this.projectDir);
    if (!filePath) return false;
    await rm(filePath);
    return true;
  }

  async templateExists(name: string): Promise<boolean> {
    const filePath = await findTemplatePath(name, this.projectDir);
    return filePath !== null;
  }
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Loads all parseable .md templates from a stencil directory.
 * Silently skips files that fail to parse.
 */
async function loadTemplatesFromDir(
  baseDir: string,
  source: TemplateSource,
): Promise<Template[]> {
  const templates: Template[] = [];

  // Scan templates/ (uncategorized)
  const templatesDir = path.join(baseDir, 'templates');
  try {
    const entries = await readdir(templatesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = path.join(templatesDir, entry.name);
      try {
        const raw = await readFile(filePath, 'utf8');
        templates.push(parseTemplate(filePath, raw, source));
      } catch {
        // skip unparseable files — listTemplates must not throw for a single bad file
      }
    }
  } catch {
    // templates/ dir does not exist — that is valid (empty stencil dir)
  }

  // Scan collections/<name>/ subdirectories
  const collectionsDir = path.join(baseDir, 'collections');
  try {
    const collectionEntries = await readdir(collectionsDir, { withFileTypes: true });
    for (const collEntry of collectionEntries) {
      if (!collEntry.isDirectory()) continue;
      const collDir = path.join(collectionsDir, collEntry.name);
      try {
        const fileEntries = await readdir(collDir, { withFileTypes: true });
        for (const fileEntry of fileEntries) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith('.md')) continue;
          const filePath = path.join(collDir, fileEntry.name);
          try {
            const raw = await readFile(filePath, 'utf8');
            templates.push(parseTemplate(filePath, raw, source));
          } catch {
            // skip unparseable files
          }
        }
      } catch {
        // skip unreadable collection subdirectory
      }
    }
  } catch {
    // collections/ dir does not exist — valid
  }

  return templates;
}

/**
 * Finds the absolute path of a template file by name within a stencil directory.
 * Checks templates/ first, then collections/*/.
 * Returns null if not found.
 */
async function findTemplatePath(name: string, baseDir: string): Promise<null | string> {
  const templatesPath = path.join(baseDir, 'templates', `${name}.md`);
  if (await fileExists(templatesPath)) return templatesPath;

  const collectionsDir = path.join(baseDir, 'collections');
  try {
    const entries = await readdir(collectionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(collectionsDir, entry.name, `${name}.md`);
      if (await fileExists(candidate)) return candidate;
    }
  } catch {
    // collections/ does not exist
  }

  return null;
}

/**
 * Finds and parses a template by name from a stencil directory.
 * Returns null if not found.
 */
async function findAndParseTemplate(
  name: string,
  baseDir: string,
  source: TemplateSource,
): Promise<null | Template> {
  const filePath = await findTemplatePath(name, baseDir);
  if (!filePath) return null;
  const raw = await readFile(filePath, 'utf8');
  return parseTemplate(filePath, raw, source);
}

/**
 * Resolves the absolute file path where a template should be saved
 * within projectDir, based on its collection (if any).
 */
function resolveTemplatePath(baseDir: string, template: Template): string {
  const { name } = template.frontmatter;
  if (template.collection) {
    return path.join(baseDir, 'collections', template.collection, `${name}.md`);
  }
  return path.join(baseDir, 'templates', `${name}.md`);
}

/**
 * Serializes a Template object to the canonical .md file format:
 *   ---
 *   <YAML frontmatter>
 *   ---
 *
 *   <body>
 */
function serializeTemplate(template: Template): string {
  const yamlBlock = stringifyYaml(buildFrontmatterObject(template.frontmatter)).trimEnd();
  return `---\n${yamlBlock}\n---\n\n${template.body}`;
}

/**
 * Builds a plain object from TemplateFrontmatter for YAML serialization.
 * Fields are ordered to match the spec and optional fields are omitted when undefined.
 */
function buildFrontmatterObject(fm: TemplateFrontmatter): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    name: fm.name,
    description: fm.description,
    version: fm.version,
  };

  if (fm.author !== undefined) obj.author = fm.author;
  if (fm.tags !== undefined) obj.tags = fm.tags;
  if (fm.placeholders !== undefined) {
    obj.placeholders = fm.placeholders.map(buildPlaceholderObject);
  }

  return obj;
}

/**
 * Builds a plain object from PlaceholderDefinition for YAML serialization.
 * Omits optional fields when undefined.
 */
function buildPlaceholderObject(p: PlaceholderDefinition): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    name: p.name,
    description: p.description,
    required: p.required,
  };

  if (p.default !== undefined) obj.default = p.default;
  if (p.type !== undefined) obj.type = p.type;
  if (p.options !== undefined) obj.options = p.options;

  return obj;
}

/**
 * Returns true if the given file path exists and is accessible.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 3 — Create `storage.test.ts`

Create a new test file. Tests use real temporary directories on disk — no mocking of the filesystem.

**File:** `packages/core/test/storage.test.ts`

**Coverage requirements:**

| Area                                | Tests required                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Round-trip                          | save → templateExists → getTemplate → listTemplates → deleteTemplate                    |
| Collection placement                | template with `collection` saved to `collections/<name>/` path                          |
| Uncategorized placement             | template without `collection` saved to `templates/` path                                |
| Global dir precedence               | project template shadows global template with same name in `listTemplates`              |
| `getTemplate` precedence            | project returned before global when both have same name                                 |
| `getTemplate` fallback              | global returned when not in project                                                     |
| `listTemplates` empty               | returns `[]` when stencil dir is empty or missing                                       |
| `listTemplates` filter: collection  | only templates matching `collection` returned                                           |
| `listTemplates` filter: source      | only templates from matching source returned                                            |
| `listTemplates` filter: tags        | only templates with at least one matching tag returned                                  |
| `listTemplates` filter: searchQuery | matches name, description, tags (case-insensitive)                                      |
| `listTemplates` sort order          | uncategorized ('') sorts before named collections; names alphabetical within collection |
| `deleteTemplate` returns true       | when template exists                                                                    |
| `deleteTemplate` returns false      | when template does not exist                                                            |
| `templateExists` true/false         | correctly reflects presence                                                             |
| Serialization round-trip            | parsed template equals original after save + get                                        |
| Unknown `.md` files                 | non-template .md files in templates/ are skipped without throwing                       |

**What to write:**

```typescript
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalStorageProvider } from '../src/storage.js';
import type { Template } from '../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

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

// ── Round-trip ────────────────────────────────────────────────────────────

describe('LocalStorageProvider — round-trip', () => {
  it('save → templateExists → getTemplate → listTemplates → deleteTemplate', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const template = makeTemplate({ name: 'my-template' });

    // Not present before save
    expect(await storage.templateExists('my-template')).toBe(false);
    expect(await storage.getTemplate('my-template')).toBeNull();

    // Save
    await storage.saveTemplate(template);

    // Exists after save
    expect(await storage.templateExists('my-template')).toBe(true);

    // getTemplate returns the saved template
    const fetched = await storage.getTemplate('my-template');
    expect(fetched).not.toBeNull();
    expect(fetched!.frontmatter.name).toBe('my-template');
    expect(fetched!.frontmatter.description).toBe('Description of my-template');
    expect(fetched!.frontmatter.version).toBe(1);
    expect(fetched!.body).toBe(template.body);

    // listTemplates includes the template
    const list = await storage.listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]!.frontmatter.name).toBe('my-template');

    // Delete
    expect(await storage.deleteTemplate('my-template')).toBe(true);
    expect(await storage.templateExists('my-template')).toBe(false);
    expect(await storage.getTemplate('my-template')).toBeNull();

    // Second delete returns false
    expect(await storage.deleteTemplate('my-template')).toBe(false);
  });
});

// ── Placement ─────────────────────────────────────────────────────────────

describe('LocalStorageProvider — file placement', () => {
  it('saves uncategorized template to templates/<name>.md', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'flat-template' }));

    const expectedPath = path.join(tmpDir, 'templates', 'flat-template.md');
    const files = await readdir(path.join(tmpDir, 'templates'));
    expect(files).toContain('flat-template.md');

    const fetched = await storage.getTemplate('flat-template');
    expect(fetched!.filePath).toBe(expectedPath);
    expect(fetched!.collection).toBeUndefined();
  });

  it('saves collection template to collections/<collection>/<name>.md', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const template = makeTemplate({ name: 'endpoint', collection: 'backend' });
    await storage.saveTemplate(template);

    const expectedPath = path.join(tmpDir, 'collections', 'backend', 'endpoint.md');
    const files = await readdir(path.join(tmpDir, 'collections', 'backend'));
    expect(files).toContain('endpoint.md');

    const fetched = await storage.getTemplate('endpoint');
    expect(fetched!.filePath).toBe(expectedPath);
    expect(fetched!.collection).toBe('backend');
  });

  it('creates intermediate directories automatically on save', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const template = makeTemplate({ name: 'deep-template', collection: 'deep-collection' });
    // No mkdir called manually — storage must create the path
    await expect(storage.saveTemplate(template)).resolves.toBeUndefined();
    expect(await storage.templateExists('deep-template')).toBe(true);
  });
});

// ── Serialization round-trip ──────────────────────────────────────────────

describe('LocalStorageProvider — serialization', () => {
  it('preserves all frontmatter fields after save + get', async () => {
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
            required: true,
          },
        ],
        tags: ['backend', 'rest'],
        version: 2,
      },
      source: 'project',
    };

    await storage.saveTemplate(template);
    const fetched = await storage.getTemplate('rich-template');

    expect(fetched!.frontmatter.name).toBe('rich-template');
    expect(fetched!.frontmatter.description).toBe('A rich template');
    expect(fetched!.frontmatter.version).toBe(2);
    expect(fetched!.frontmatter.author).toBe('alice');
    expect(fetched!.frontmatter.tags).toEqual(['backend', 'rest']);
    expect(fetched!.frontmatter.placeholders).toHaveLength(1);
    expect(fetched!.frontmatter.placeholders![0]!.name).toBe('entity_name');
    expect(fetched!.frontmatter.placeholders![0]!.default).toBe('User');
    expect(fetched!.body).toBe(template.body);
    expect(fetched!.collection).toBe('backend');
  });
});

// ── Global dir precedence ─────────────────────────────────────────────────

describe('LocalStorageProvider — global dir precedence', () => {
  it('project template shadows global template with same name in listTemplates', async () => {
    const globalDir = await makeTempDir();
    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);

      // Write same name to both dirs directly
      const globalTemplate = makeTemplate({ name: 'shared' });
      const projectTemplate: Template = {
        ...makeTemplate({ name: 'shared' }),
        frontmatter: { description: 'Project version', name: 'shared', version: 99 },
      };

      await new LocalStorageProvider(globalDir).saveTemplate(globalTemplate);
      await storage.saveTemplate(projectTemplate);

      const list = await storage.listTemplates();
      const shared = list.filter((t) => t.frontmatter.name === 'shared');

      expect(shared).toHaveLength(1);
      expect(shared[0]!.frontmatter.version).toBe(99);
      expect(shared[0]!.source).toBe('project');
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('returns global template when not in project', async () => {
    const globalDir = await makeTempDir();
    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);
      await new LocalStorageProvider(globalDir).saveTemplate(makeTemplate({ name: 'global-only' }));

      const fetched = await storage.getTemplate('global-only');
      expect(fetched).not.toBeNull();
      expect(fetched!.source).toBe('global');
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('prefers project over global in getTemplate', async () => {
    const globalDir = await makeTempDir();
    try {
      const storage = new LocalStorageProvider(tmpDir, globalDir);
      await new LocalStorageProvider(globalDir).saveTemplate(makeTemplate({ name: 'clash' }));
      const projectVersion: Template = {
        ...makeTemplate({ name: 'clash' }),
        frontmatter: { description: 'project', name: 'clash', version: 7 },
      };
      await storage.saveTemplate(projectVersion);

      const fetched = await storage.getTemplate('clash');
      expect(fetched!.source).toBe('project');
      expect(fetched!.frontmatter.version).toBe(7);
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });
});

// ── listTemplates — empty / missing dirs ──────────────────────────────────

describe('LocalStorageProvider — listTemplates edge cases', () => {
  it('returns [] when stencil dir has no templates/ or collections/', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    expect(await storage.listTemplates()).toEqual([]);
  });

  it('returns [] when stencil dir does not exist', async () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');
    const storage = new LocalStorageProvider(nonExistent);
    expect(await storage.listTemplates()).toEqual([]);
  });

  it('skips malformed .md files without throwing', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const templatesDir = path.join(tmpDir, 'templates');
    await mkdir(templatesDir, { recursive: true });
    await writeFile(path.join(templatesDir, 'broken.md'), 'no frontmatter here', 'utf8');
    await storage.saveTemplate(makeTemplate({ name: 'valid-template' }));

    const list = await storage.listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]!.frontmatter.name).toBe('valid-template');
  });

  it('ignores non-.md files in templates/ directory', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const templatesDir = path.join(tmpDir, 'templates');
    await mkdir(templatesDir, { recursive: true });
    await writeFile(path.join(templatesDir, 'readme.txt'), 'not a template', 'utf8');
    await writeFile(path.join(templatesDir, 'config.json'), '{}', 'utf8');
    await storage.saveTemplate(makeTemplate({ name: 'real-template' }));

    const list = await storage.listTemplates();
    expect(list).toHaveLength(1);
  });
});

// ── listTemplates — filters ───────────────────────────────────────────────

describe('LocalStorageProvider — listTemplates filters', () => {
  it('filters by collection', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'uncategorized' }));
    await storage.saveTemplate(makeTemplate({ name: 'backend-tmpl', collection: 'backend' }));
    await storage.saveTemplate(makeTemplate({ name: 'review-tmpl', collection: 'review' }));

    const result = await storage.listTemplates({ collection: 'backend' });
    expect(result).toHaveLength(1);
    expect(result[0]!.frontmatter.name).toBe('backend-tmpl');
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
      expect(projectOnly.every((t) => t.source === 'project')).toBe(true);

      const globalOnly = await storage.listTemplates({ source: 'global' });
      expect(globalOnly.every((t) => t.source === 'global')).toBe(true);
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });

  it('filters by tags — returns templates with at least one matching tag', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const tagged: Template = {
      ...makeTemplate({ name: 'tagged' }),
      frontmatter: { description: 'Tagged', name: 'tagged', tags: ['rest', 'backend'], version: 1 },
    };
    const untagged = makeTemplate({ name: 'untagged' });
    await storage.saveTemplate(tagged);
    await storage.saveTemplate(untagged);

    const result = await storage.listTemplates({ tags: ['rest'] });
    expect(result).toHaveLength(1);
    expect(result[0]!.frontmatter.name).toBe('tagged');
  });

  it('filters by searchQuery — case-insensitive match on name', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'create-endpoint' }));
    await storage.saveTemplate(makeTemplate({ name: 'write-adr' }));

    const result = await storage.listTemplates({ searchQuery: 'ENDPOINT' });
    expect(result).toHaveLength(1);
    expect(result[0]!.frontmatter.name).toBe('create-endpoint');
  });

  it('filters by searchQuery — matches description', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const t: Template = {
      ...makeTemplate({ name: 'some-template' }),
      frontmatter: { description: 'Generates a REST handler', name: 'some-template', version: 1 },
    };
    await storage.saveTemplate(t);
    await storage.saveTemplate(makeTemplate({ name: 'other' }));

    const result = await storage.listTemplates({ searchQuery: 'rest handler' });
    expect(result).toHaveLength(1);
    expect(result[0]!.frontmatter.name).toBe('some-template');
  });

  it('filters by searchQuery — matches tags', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    const t: Template = {
      ...makeTemplate({ name: 'tagged-template' }),
      frontmatter: {
        description: 'Tagged',
        name: 'tagged-template',
        tags: ['security'],
        version: 1,
      },
    };
    await storage.saveTemplate(t);
    await storage.saveTemplate(makeTemplate({ name: 'plain' }));

    const result = await storage.listTemplates({ searchQuery: 'security' });
    expect(result).toHaveLength(1);
    expect(result[0]!.frontmatter.name).toBe('tagged-template');
  });
});

// ── listTemplates — sort order ────────────────────────────────────────────

describe('LocalStorageProvider — listTemplates sort order', () => {
  it('sorts uncategorized templates (empty collection) before named collections', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'z-uncategorized' }));
    await storage.saveTemplate(makeTemplate({ name: 'a-backend', collection: 'backend' }));

    const list = await storage.listTemplates();
    expect(list[0]!.collection).toBeUndefined(); // uncategorized first ('' < 'backend')
    expect(list[1]!.collection).toBe('backend');
  });

  it('sorts templates alphabetically by name within the same collection', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'zebra', collection: 'col' }));
    await storage.saveTemplate(makeTemplate({ name: 'apple', collection: 'col' }));
    await storage.saveTemplate(makeTemplate({ name: 'mango', collection: 'col' }));

    const list = await storage.listTemplates({ collection: 'col' });
    expect(list.map((t) => t.frontmatter.name)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('sorts collections alphabetically, then names within each', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'z-review', collection: 'review' }));
    await storage.saveTemplate(makeTemplate({ name: 'a-backend', collection: 'backend' }));
    await storage.saveTemplate(makeTemplate({ name: 'a-review', collection: 'review' }));

    const list = await storage.listTemplates();
    const names = list.map((t) => t.frontmatter.name);
    expect(names).toEqual(['a-backend', 'a-review', 'z-review']);
  });
});

// ── deleteTemplate ────────────────────────────────────────────────────────

describe('LocalStorageProvider — deleteTemplate', () => {
  it('returns true and removes the file when template exists', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'to-delete' }));
    expect(await storage.deleteTemplate('to-delete')).toBe(true);
    expect(await storage.templateExists('to-delete')).toBe(false);
  });

  it('returns false when template does not exist', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    expect(await storage.deleteTemplate('nonexistent')).toBe(false);
  });

  it('deletes templates in collections', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'col-template', collection: 'mygroup' }));
    expect(await storage.deleteTemplate('col-template')).toBe(true);
    expect(await storage.templateExists('col-template')).toBe(false);
  });
});

// ── templateExists ────────────────────────────────────────────────────────

describe('LocalStorageProvider — templateExists', () => {
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

// ── getTemplate ───────────────────────────────────────────────────────────

describe('LocalStorageProvider — getTemplate', () => {
  it('returns null for missing template', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    expect(await storage.getTemplate('missing')).toBeNull();
  });

  it('returns correct source tag for project template', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'proj-tmpl' }));
    const result = await storage.getTemplate('proj-tmpl');
    expect(result!.source).toBe('project');
  });

  it('returns correct collection for collection template', async () => {
    const storage = new LocalStorageProvider(tmpDir);
    await storage.saveTemplate(makeTemplate({ name: 'col-tmpl', collection: 'docs' }));
    const result = await storage.getTemplate('col-tmpl');
    expect(result!.collection).toBe('docs');
  });
});
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 4 — Run the full test suite

```bash
cd packages/core && npm test
```

**Expected outcome:**

- All previously passing tests (parser, validator, context, resolver) still pass.
- All new `storage.test.ts` tests pass.
- Tests use real temp directories — actual file I/O happens on disk.

**If tests fail:**

| Symptom                                              | Likely cause                                                                | Fix                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `fileExists` returns wrong result                    | `stat()` resolves for directories too                                       | Use `(await stat(p)).isFile()` instead of bare `stat()` if false positives arise                 |
| Collection not detected by parser                    | `parseTemplate` uses path regex; verify `filePath` passed to it is absolute | Use `path.join(baseDir, ...)` not `path.resolve()` — both work for absolute baseDirs             |
| `listTemplates` returns duplicates                   | Global templates not filtered against project names set                     | Confirm `projectNames` Set is built before merge                                                 |
| Sort test fails                                      | `undefined` collection compared as `'undefined'` string                     | Use `?? ''` when computing sort key                                                              |
| Serialization round-trip fails for `required: false` | `yaml.stringify` emits `required: false`; ensure parser reads it correctly  | Parser in `mapPlaceholder` already handles `boolean` type — verify it's not defaulting to `true` |
| `writeFile` fails with ENOENT                        | Parent directory not created before write                                   | Confirm `mkdir(..., { recursive: true })` runs before `writeFile`                                |
| Temp dir cleanup fails                               | `rm` called before `afterEach` completes                                    | Use `await rm(...)` in `afterEach`                                                               |

---

### Step 5 — Verify typecheck and final state

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all tests pass (parser + validator + context + resolver + storage suites).

This is the exit criterion for Epic 6.

---

## Exit Criteria Checklist

- [ ] `listTemplates()` returns `[]` on empty or missing stencil dir without throwing
- [ ] `listTemplates()` scans both `templates/` and `collections/*/` subdirectories
- [ ] `listTemplates()` skips unparseable `.md` files silently
- [ ] `listTemplates()` ignores non-`.md` files in template directories
- [ ] `listTemplates()` project template wins on name collision with global
- [ ] `listTemplates()` applies `collection` filter correctly
- [ ] `listTemplates()` applies `source` filter correctly
- [ ] `listTemplates()` applies `tags` filter (at-least-one match)
- [ ] `listTemplates()` applies `searchQuery` filter (case-insensitive, name + description + tags)
- [ ] `listTemplates()` sort order: uncategorized first, then collections alphabetically, names alphabetically within each group
- [ ] `getTemplate()` returns project template before global on name collision
- [ ] `getTemplate()` returns global template when not present in project
- [ ] `getTemplate()` returns `null` for unknown name
- [ ] `saveTemplate()` writes to `templates/<name>.md` for uncategorized templates
- [ ] `saveTemplate()` writes to `collections/<collection>/<name>.md` for collection templates
- [ ] `saveTemplate()` creates intermediate directories with `mkdir -p`
- [ ] `saveTemplate()` serializes all frontmatter fields (name, description, version, author, tags, placeholders)
- [ ] `saveTemplate()` followed by `getTemplate()` returns equivalent template (round-trip)
- [ ] `deleteTemplate()` returns `true` and removes file when template exists
- [ ] `deleteTemplate()` returns `false` when template does not exist
- [ ] `deleteTemplate()` works for both uncategorized and collection templates
- [ ] `templateExists()` returns `false` before save, `true` after save
- [ ] `npm run typecheck` exits with zero errors
- [ ] `npm test` passes — all tests green, no regressions in prior suites
