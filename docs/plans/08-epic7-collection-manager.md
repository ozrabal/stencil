# Plan: Epic 7 — Collection Manager

**Goal:** Implement `CollectionManager` in `collections.ts` — a thin orchestration layer over `LocalStorageProvider` for collection CRUD — and create `collections.test.ts` with a full test suite.

**Prerequisites:** Epics 1–6 must be complete. Verify before starting:

```bash
cd packages/core && npm run typecheck && npm test
```

Zero errors and all existing tests (parser, validator, context, resolver, storage suites) must be passing.

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

`collections.ts` contains a stubbed `CollectionManager` class:

- `listCollections()` returns `Promise.resolve([])`
- `createCollection()`, `moveToCollection()`, `removeCollection()`, `listTemplatesInCollection()` all throw `Error('Not implemented')`

There are no collection tests.

### Target state

| Concern                        | Current | Target                                                                                               |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------- |
| `listCollections()`            | `[]`    | Read `collections/` subdirectory names directly from the filesystem                                  |
| `createCollection(name)`       | Throws  | `mkdir -p` the collection directory; idempotent                                                      |
| `moveToCollection(name, coll)` | Throws  | `getTemplate` → delete old file → `saveTemplate` with new collection                                 |
| `removeCollection(name)`       | Throws  | Move all templates in collection to uncategorized, then `rm -rf` the collection directory            |
| `listTemplatesInCollection(n)` | Throws  | Delegate to `storage.listTemplates({ collection: n })`                                               |
| `collections.test.ts`          | Missing | Full suite — all five operations, including empty/non-existent edge cases and end-to-end round trips |

### Design decision: `CollectionManager` accepts `LocalStorageProvider`

The architecture spec shows `constructor(private storage: StorageProvider)`. However, three operations require direct filesystem access to `projectDir`:

- `listCollections()` — must read directory names to include empty collections created by `createCollection()`
- `createCollection()` — must create a directory
- `removeCollection()` — must remove the directory after moving templates out

Since `StorageProvider` has no directory-level methods, and since `LocalStorageProvider` is the only concrete storage implementation in MVP, the constructor is typed to accept `LocalStorageProvider` directly. This is more honest than casting internally.

To expose the project directory cleanly, a `getProjectDir(): string` getter is added to `LocalStorageProvider`.

### Operations summary

| Method                         | Implementation strategy                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `listCollections()`            | `readdir(<projectDir>/collections/)` → filter for directories → return names; returns `[]` if dir missing                               |
| `createCollection(name)`       | `mkdir(<projectDir>/collections/<name>, { recursive: true })`; idempotent                                                               |
| `moveToCollection(tmpl, col)`  | `storage.getTemplate(name)` → throw if null → `storage.deleteTemplate(name)` → `storage.saveTemplate({ ...template, collection: col })` |
| `removeCollection(name)`       | `storage.listTemplates({ collection: name })` → for each: delete + re-save uncategorized → `rm -rf <projectDir>/collections/<name>`     |
| `listTemplatesInCollection(n)` | `storage.listTemplates({ collection: n })`                                                                                              |

### Behavioural rules

- **`listCollections()` includes empty collections**: It reads the filesystem directory, not template metadata. A collection directory created with `createCollection()` but containing no templates still appears.
- **`createCollection()` is idempotent**: `mkdir({ recursive: true })` never throws if the directory already exists.
- **`moveToCollection()` throws on missing template**: Returns a descriptive error if `storage.getTemplate()` returns `null`.
- **`removeCollection()` is idempotent**: If the collection directory doesn't exist, `rm({ force: true })` is a no-op. If the collection has no templates, it just removes the empty directory.
- **`removeCollection()` moves project templates only**: `listTemplates({ collection: name })` returns templates from both project and global dirs (filtered by collection), but `saveTemplate()` writes to `projectDir` only. Global templates in a collection are not affected — they remain in the global dir as-is.
- **`moveToCollection()` only moves project templates**: `deleteTemplate()` only searches `projectDir`. If the template exists only in `globalDir`, the move is rejected (template not found in project).
- **Directory name safety**: Collection names come from `readdir()` with `withFileTypes` (returning real directory names from the filesystem), not from user input directly to the path. `createCollection` and `removeCollection` accept the name as a parameter — callers are responsible for validation (the validator in Epic 3 enforces kebab-case on template names; collection names follow the same convention at the adapter layer).

### Impact on other files

| File                                     | Change                                      |
| ---------------------------------------- | ------------------------------------------- |
| `packages/core/src/storage.ts`           | Add `getProjectDir(): string` public getter |
| `packages/core/src/collections.ts`       | Full implementation replaces stub           |
| `packages/core/test/collections.test.ts` | New file — full test suite                  |
| All other `src/` files                   | No changes                                  |

---

## Steps

### Step 1 — Verify baseline

Before touching any files, confirm the starting state is clean.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all existing tests pass (parser + validator + context + resolver + storage suites).

---

### Step 2 — Add `getProjectDir()` to `LocalStorageProvider`

`CollectionManager` needs access to `projectDir` for direct filesystem operations. Add a public getter to the existing `LocalStorageProvider` class.

**File:** `packages/core/src/storage.ts`

Locate the class definition and add the getter after the constructor:

```typescript
  constructor(
    private readonly projectDir: string,
    private readonly globalDir?: string,
  ) {}

  /** Returns the absolute path to the project's stencil directory. */
  getProjectDir(): string {
    return this.projectDir;
  }
```

No other changes to `storage.ts`.

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors. The getter is public, so TypeScript must accept it without issues.

---

### Step 3 — Implement `collections.ts`

Replace the entire stub with the full implementation.

**File:** `packages/core/src/collections.ts`

**What to write:**

```typescript
// CollectionManager — thin orchestration layer over LocalStorageProvider.
// Architecture §3.8
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { LocalStorageProvider } from './storage.js';
import type { Template } from './types.js';

/**
 * Manages template collections (subdirectory-based grouping).
 * Thin layer over LocalStorageProvider for collection CRUD.
 *
 * Collections map to subdirectories:
 *   <projectDir>/collections/<collection-name>/<template-name>.md
 */
export class CollectionManager {
  constructor(private readonly storage: LocalStorageProvider) {}

  /**
   * Returns all collection names in the project directory.
   * Derived from subdirectory names under <projectDir>/collections/.
   * Includes empty collections created by createCollection().
   * Returns [] if the collections directory does not exist.
   */
  async listCollections(): Promise<string[]> {
    const collectionsDir = path.join(this.storage.getProjectDir(), 'collections');
    try {
      const entries = await readdir(collectionsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      // collections/ directory does not exist — no collections
      return [];
    }
  }

  /**
   * Creates a new collection directory.
   * Idempotent: calling twice for the same name is safe.
   */
  async createCollection(name: string): Promise<void> {
    const collectionDir = path.join(this.storage.getProjectDir(), 'collections', name);
    await mkdir(collectionDir, { recursive: true });
  }

  /**
   * Moves a template into a collection.
   * Deletes the template from its current location and re-saves it under the new collection.
   * Throws if the template does not exist in the project directory.
   */
  async moveToCollection(templateName: string, collectionName: string): Promise<void> {
    const template = await this.storage.getTemplate(templateName);
    if (template === null) {
      throw new Error(
        `Template "${templateName}" not found. Cannot move a template that does not exist.`,
      );
    }

    // Delete from current location (project dir only)
    const deleted = await this.storage.deleteTemplate(templateName);
    if (!deleted) {
      throw new Error(
        `Template "${templateName}" exists in the global directory only and cannot be moved.`,
      );
    }

    // Re-save with new collection
    await this.storage.saveTemplate({ ...template, collection: collectionName });
  }

  /**
   * Removes a collection by moving all its templates to uncategorized,
   * then deleting the collection directory.
   *
   * Templates from the global directory that happen to be in this collection
   * are not affected — only project-level templates are moved.
   *
   * Idempotent: if the collection directory does not exist, this is a no-op.
   */
  async removeCollection(name: string): Promise<void> {
    // Move all project templates in this collection to uncategorized
    const templates = await this.storage.listTemplates({ collection: name, source: 'project' });
    for (const template of templates) {
      await this.storage.deleteTemplate(template.frontmatter.name);
      await this.storage.saveTemplate({ ...template, collection: undefined });
    }

    // Remove the collection directory (now empty)
    const collectionDir = path.join(this.storage.getProjectDir(), 'collections', name);
    await rm(collectionDir, { force: true, recursive: true });
  }

  /**
   * Lists all templates in the specified collection.
   * Returns templates from both project and global directories.
   * Returns [] if the collection does not exist or is empty.
   */
  async listTemplatesInCollection(collectionName: string): Promise<Template[]> {
    return this.storage.listTemplates({ collection: collectionName });
  }
}
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 4 — Create `collections.test.ts`

Create a new test file. Tests use real temporary directories — no mocking.

**File:** `packages/core/test/collections.test.ts`

**Coverage requirements:**

| Method                        | Cases required                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `listCollections()`           | Empty when no collections dir; includes empty collection; sorted alphabetically; no duplicates    |
| `createCollection()`          | Creates directory; idempotent (no throw on second call); appears in `listCollections()`           |
| `moveToCollection()`          | Uncategorized → collection; collection A → collection B; throws on missing template               |
| `removeCollection()`          | Templates moved to uncategorized; directory removed; empty collection removed; idempotent on miss |
| `listTemplatesInCollection()` | Returns correct templates; returns `[]` for non-existent; excludes other collections              |

**What to write:**

```typescript
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CollectionManager } from '../src/collections.js';
import { LocalStorageProvider } from '../src/storage.js';
import type { Template } from '../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────

let tmpDir: string;
let storage: LocalStorageProvider;
let cm: CollectionManager;

beforeEach(async () => {
  tmpDir = await makeTempDir();
  storage = new LocalStorageProvider(tmpDir);
  cm = new CollectionManager(storage);
});

afterEach(async () => {
  await rm(tmpDir, { force: true, recursive: true });
});

async function makeTempDir(): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `stencil-cm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

function makeTemplate(name: string, collection?: string): Template {
  return {
    body: `Body of ${name}`,
    collection,
    filePath: '',
    frontmatter: {
      description: `Description of ${name}`,
      name,
      version: 1,
    },
    source: 'project',
  };
}

// ── listCollections ───────────────────────────────────────────────────────

describe('CollectionManager.listCollections()', () => {
  it('returns [] when no collections directory exists', async () => {
    expect(await cm.listCollections()).toEqual([]);
  });

  it('returns [] when collections directory is empty', async () => {
    await mkdir(path.join(tmpDir, 'collections'), { recursive: true });
    expect(await cm.listCollections()).toEqual([]);
  });

  it('returns collection names derived from subdirectories', async () => {
    await storage.saveTemplate(makeTemplate('tmpl-a', 'backend'));
    await storage.saveTemplate(makeTemplate('tmpl-b', 'review'));

    const collections = await cm.listCollections();
    expect(collections).toContain('backend');
    expect(collections).toContain('review');
    expect(collections).toHaveLength(2);
  });

  it('includes empty collections created with createCollection()', async () => {
    await cm.createCollection('empty-collection');
    const collections = await cm.listCollections();
    expect(collections).toContain('empty-collection');
  });

  it('returns collection names sorted alphabetically', async () => {
    await cm.createCollection('zebra');
    await cm.createCollection('alpha');
    await cm.createCollection('mango');

    const collections = await cm.listCollections();
    expect(collections).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('does not include files — only directories', async () => {
    // saveTemplate creates the directory, not a plain file inside collections/
    await storage.saveTemplate(makeTemplate('tmpl', 'backend'));

    const collections = await cm.listCollections();
    expect(collections).toEqual(['backend']);
    expect(collections).not.toContain('tmpl.md');
  });
});

// ── createCollection ──────────────────────────────────────────────────────

describe('CollectionManager.createCollection()', () => {
  it('creates the collection directory', async () => {
    await cm.createCollection('new-collection');

    const collections = await cm.listCollections();
    expect(collections).toContain('new-collection');
  });

  it('is idempotent — calling twice does not throw', async () => {
    await cm.createCollection('my-coll');
    await expect(cm.createCollection('my-coll')).resolves.toBeUndefined();
  });

  it('created collection is initially empty', async () => {
    await cm.createCollection('fresh');
    const templates = await cm.listTemplatesInCollection('fresh');
    expect(templates).toEqual([]);
  });
});

// ── moveToCollection ──────────────────────────────────────────────────────

describe('CollectionManager.moveToCollection()', () => {
  it('moves an uncategorized template into a collection', async () => {
    await storage.saveTemplate(makeTemplate('my-tmpl'));
    expect(await storage.templateExists('my-tmpl')).toBe(true);

    await cm.moveToCollection('my-tmpl', 'backend');

    const fetched = await storage.getTemplate('my-tmpl');
    expect(fetched).not.toBeNull();
    expect(fetched!.collection).toBe('backend');
    expect(fetched!.frontmatter.name).toBe('my-tmpl');
  });

  it('moves a template from one collection to another', async () => {
    await storage.saveTemplate(makeTemplate('endpoint', 'backend'));

    await cm.moveToCollection('endpoint', 'review');

    const fetched = await storage.getTemplate('endpoint');
    expect(fetched!.collection).toBe('review');
  });

  it('removes the template from its original location', async () => {
    await storage.saveTemplate(makeTemplate('movable'));
    await cm.moveToCollection('movable', 'backend');

    // Template must still be accessible (now at new location)
    const fetched = await storage.getTemplate('movable');
    expect(fetched!.collection).toBe('backend');

    // No duplicate — only one template with that name
    const all = await storage.listTemplates();
    expect(all.filter((t) => t.frontmatter.name === 'movable')).toHaveLength(1);
  });

  it('preserves all frontmatter fields after the move', async () => {
    const original: Template = {
      body: 'Use {{entity}} for {{$ctx.project_name}}.',
      collection: undefined,
      filePath: '',
      frontmatter: {
        author: 'alice',
        description: 'Full featured template',
        name: 'full-template',
        placeholders: [{ description: 'The entity', name: 'entity', required: true }],
        tags: ['backend', 'rest'],
        version: 3,
      },
      source: 'project',
    };
    await storage.saveTemplate(original);

    await cm.moveToCollection('full-template', 'backend');

    const fetched = await storage.getTemplate('full-template');
    expect(fetched!.frontmatter.author).toBe('alice');
    expect(fetched!.frontmatter.tags).toEqual(['backend', 'rest']);
    expect(fetched!.frontmatter.version).toBe(3);
    expect(fetched!.frontmatter.placeholders).toHaveLength(1);
    expect(fetched!.body).toBe(original.body);
  });

  it('throws if the template does not exist', async () => {
    await expect(cm.moveToCollection('nonexistent', 'backend')).rejects.toThrow('nonexistent');
  });

  it('creates the target collection directory automatically if it does not exist', async () => {
    await storage.saveTemplate(makeTemplate('auto-dir-tmpl'));

    await cm.moveToCollection('auto-dir-tmpl', 'new-collection');

    const collections = await cm.listCollections();
    expect(collections).toContain('new-collection');
  });
});

// ── removeCollection ──────────────────────────────────────────────────────

describe('CollectionManager.removeCollection()', () => {
  it('moves all templates from the collection to uncategorized', async () => {
    await storage.saveTemplate(makeTemplate('tmpl-a', 'to-remove'));
    await storage.saveTemplate(makeTemplate('tmpl-b', 'to-remove'));

    await cm.removeCollection('to-remove');

    const tmplA = await storage.getTemplate('tmpl-a');
    const tmplB = await storage.getTemplate('tmpl-b');

    expect(tmplA).not.toBeNull();
    expect(tmplA!.collection).toBeUndefined();

    expect(tmplB).not.toBeNull();
    expect(tmplB!.collection).toBeUndefined();
  });

  it('removes the collection directory', async () => {
    await cm.createCollection('dead-collection');
    expect(await cm.listCollections()).toContain('dead-collection');

    await cm.removeCollection('dead-collection');

    expect(await cm.listCollections()).not.toContain('dead-collection');
  });

  it('templates are accessible as uncategorized after collection removal', async () => {
    await storage.saveTemplate(makeTemplate('orphan', 'doomed'));
    await cm.removeCollection('doomed');

    const all = await storage.listTemplates();
    const orphan = all.find((t) => t.frontmatter.name === 'orphan');
    expect(orphan).toBeDefined();
    expect(orphan!.collection).toBeUndefined();
  });

  it('is idempotent — removing a non-existent collection does not throw', async () => {
    await expect(cm.removeCollection('ghost')).resolves.toBeUndefined();
  });

  it('does not affect templates in other collections', async () => {
    await storage.saveTemplate(makeTemplate('keeper', 'safe-collection'));
    await storage.saveTemplate(makeTemplate('victim', 'dead-collection'));

    await cm.removeCollection('dead-collection');

    const keeper = await storage.getTemplate('keeper');
    expect(keeper).not.toBeNull();
    expect(keeper!.collection).toBe('safe-collection');
  });

  it('removes all templates from the collection before removing directory', async () => {
    await storage.saveTemplate(makeTemplate('a', 'col'));
    await storage.saveTemplate(makeTemplate('b', 'col'));
    await storage.saveTemplate(makeTemplate('c', 'col'));

    await cm.removeCollection('col');

    const inCollection = await cm.listTemplatesInCollection('col');
    expect(inCollection).toHaveLength(0);

    const all = await storage.listTemplates();
    const names = all.map((t) => t.frontmatter.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
    expect(names).toContain('c');
  });
});

// ── listTemplatesInCollection ─────────────────────────────────────────────

describe('CollectionManager.listTemplatesInCollection()', () => {
  it('returns templates in the specified collection', async () => {
    await storage.saveTemplate(makeTemplate('backend-a', 'backend'));
    await storage.saveTemplate(makeTemplate('backend-b', 'backend'));
    await storage.saveTemplate(makeTemplate('review-a', 'review'));

    const result = await cm.listTemplatesInCollection('backend');
    expect(result).toHaveLength(2);
    const names = result.map((t) => t.frontmatter.name);
    expect(names).toContain('backend-a');
    expect(names).toContain('backend-b');
  });

  it('returns [] for a non-existent collection', async () => {
    expect(await cm.listTemplatesInCollection('ghost')).toEqual([]);
  });

  it('returns [] for an empty collection created with createCollection()', async () => {
    await cm.createCollection('hollow');
    expect(await cm.listTemplatesInCollection('hollow')).toEqual([]);
  });

  it('does not include templates from other collections', async () => {
    await storage.saveTemplate(makeTemplate('target', 'target-col'));
    await storage.saveTemplate(makeTemplate('other', 'other-col'));
    await storage.saveTemplate(makeTemplate('uncategorized'));

    const result = await cm.listTemplatesInCollection('target-col');
    expect(result).toHaveLength(1);
    expect(result[0]!.frontmatter.name).toBe('target');
  });

  it('includes templates from global directory in the same collection', async () => {
    const globalDir = path.join(
      os.tmpdir(),
      `stencil-cm-global-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(globalDir, { recursive: true });

    try {
      const storageWithGlobal = new LocalStorageProvider(tmpDir, globalDir);
      const cmWithGlobal = new CollectionManager(storageWithGlobal);

      // Save a global template in the same collection
      const globalStorage = new LocalStorageProvider(globalDir);
      const globalTemplate: Template = {
        body: 'Global body',
        collection: 'shared',
        filePath: '',
        frontmatter: { description: 'Global template', name: 'global-tmpl', version: 1 },
        source: 'global',
      };
      await globalStorage.saveTemplate(globalTemplate);

      // Save a project template in the same collection
      await storageWithGlobal.saveTemplate(makeTemplate('project-tmpl', 'shared'));

      const result = await cmWithGlobal.listTemplatesInCollection('shared');
      const names = result.map((t) => t.frontmatter.name);
      expect(names).toContain('project-tmpl');
      expect(names).toContain('global-tmpl');
    } finally {
      await rm(globalDir, { force: true, recursive: true });
    }
  });
});

// ── End-to-end round trip ─────────────────────────────────────────────────

describe('CollectionManager — end-to-end', () => {
  it('full lifecycle: create → add templates → move → remove', async () => {
    // Create a collection
    await cm.createCollection('backend');
    expect(await cm.listCollections()).toContain('backend');

    // Add templates directly to the collection
    await storage.saveTemplate(makeTemplate('endpoint', 'backend'));
    await storage.saveTemplate(makeTemplate('migration', 'backend'));

    // Verify collection contents
    let inBackend = await cm.listTemplatesInCollection('backend');
    expect(inBackend).toHaveLength(2);

    // Create another collection and move a template
    await cm.createCollection('review');
    await cm.moveToCollection('endpoint', 'review');

    inBackend = await cm.listTemplatesInCollection('backend');
    expect(inBackend).toHaveLength(1);
    expect(inBackend[0]!.frontmatter.name).toBe('migration');

    const inReview = await cm.listTemplatesInCollection('review');
    expect(inReview).toHaveLength(1);
    expect(inReview[0]!.frontmatter.name).toBe('endpoint');

    // Remove the backend collection
    await cm.removeCollection('backend');
    expect(await cm.listCollections()).not.toContain('backend');

    // migration template should now be uncategorized
    const migration = await storage.getTemplate('migration');
    expect(migration).not.toBeNull();
    expect(migration!.collection).toBeUndefined();

    // All templates still accessible
    const allTemplates = await storage.listTemplates();
    const names = allTemplates.map((t) => t.frontmatter.name);
    expect(names).toContain('migration');
    expect(names).toContain('endpoint');
  });
});
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 5 — Run the full test suite

```bash
cd packages/core && npm test
```

**Expected outcome:**

- All previously passing tests (parser, validator, context, resolver, storage) still pass.
- All new `collections.test.ts` tests pass.
- Tests use real temp directories — actual file I/O happens on disk.

**If tests fail:**

| Symptom                                                          | Likely cause                                                                      | Fix                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `listCollections()` includes `.md` file names                    | `readdir` not filtering by `isDirectory()`                                        | Confirm `entry.isDirectory()` filter is applied                                                   |
| `createCollection()` throws on second call                       | `mkdir` called without `{ recursive: true }`                                      | Confirm `recursive: true` is set                                                                  |
| `moveToCollection()` leaves duplicate templates                  | Old file not deleted before re-saving                                             | Confirm `deleteTemplate()` is called before `saveTemplate()`                                      |
| `moveToCollection()` throws on template in global dir            | `getTemplate()` finds global template, but `deleteTemplate()` returns false       | Confirm the "global only" guard throws with a clear message                                       |
| `removeCollection()` throws on non-existent dir                  | `rm` without `{ force: true }`                                                    | Confirm `rm(dir, { force: true, recursive: true })` is used                                       |
| `removeCollection()` leaves templates inaccessible               | Templates deleted but not re-saved as uncategorized                               | Confirm the loop: `deleteTemplate()` then `saveTemplate({ ...t, collection: undefined })`         |
| `listTemplatesInCollection()` returns global templates           | Expected — `listTemplates({ collection })` includes both project and global       | This is correct behaviour; adjust test expectations if needed                                     |
| `removeCollection()` picks up global templates to move           | Filter `{ collection: name, source: 'project' }` missing in the templates query   | Confirm both filters are applied in `removeCollection()`                                          |
| TypeScript error: `getProjectDir` not found on `StorageProvider` | Attempting to call `getProjectDir()` through the `StorageProvider` interface type | Confirm `CollectionManager` constructor is typed as `LocalStorageProvider`, not `StorageProvider` |

---

### Step 6 — Verify typecheck and final state

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all tests pass (parser + validator + context + resolver + storage + collections suites).

This is the exit criterion for Epic 7.

---

## Exit Criteria Checklist

- [ ] `getProjectDir()` getter added to `LocalStorageProvider`
- [ ] `CollectionManager` constructor accepts `LocalStorageProvider`
- [ ] `listCollections()` reads subdirectory names from `<projectDir>/collections/`
- [ ] `listCollections()` returns `[]` when collections directory does not exist
- [ ] `listCollections()` includes empty collections created by `createCollection()`
- [ ] `listCollections()` returns names sorted alphabetically
- [ ] `createCollection(name)` creates the directory with `mkdir({ recursive: true })`
- [ ] `createCollection(name)` is idempotent — no throw on duplicate calls
- [ ] `moveToCollection(name, coll)` deletes old file and re-saves with new collection
- [ ] `moveToCollection(name, coll)` preserves all frontmatter and body content
- [ ] `moveToCollection(name, coll)` throws if template does not exist
- [ ] `moveToCollection(name, coll)` creates the target collection directory if needed
- [ ] `removeCollection(name)` moves all project templates to uncategorized
- [ ] `removeCollection(name)` removes the collection directory
- [ ] `removeCollection(name)` is idempotent — no throw on non-existent collection
- [ ] `removeCollection(name)` does not affect templates in other collections
- [ ] `listTemplatesInCollection(name)` returns all templates in that collection
- [ ] `listTemplatesInCollection(name)` returns `[]` for non-existent or empty collection
- [ ] `npm run typecheck` exits with zero errors
- [ ] `npm test` passes — all tests green, no regressions in prior suites
