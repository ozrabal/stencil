# Plan: Epic 1 — Type Alignment

**Goal:** Make `types.ts` match architecture §3.2 exactly. Fix every file that imports from `types.ts` so the project typechecks cleanly after the change.

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

### Current `types.ts` vs. architecture spec — diff summary

| Item                                | Current state                                           | Target state                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlaceholderDefinition.key`         | `key: string`                                           | renamed to `name: string`                                                                                                                   |
| `TemplateFrontmatter.version`       | `version?: string`                                      | `version: number` (required)                                                                                                                |
| `TemplateFrontmatter.description`   | `description?: string`                                  | `description: string` (required)                                                                                                            |
| `TemplateFrontmatter.author`        | missing                                                 | `author?: string`                                                                                                                           |
| `PlaceholderDefinition.description` | `description?: string`                                  | `description: string` (required)                                                                                                            |
| `PlaceholderDefinition.required`    | `required?: boolean`                                    | `required: boolean` (required)                                                                                                              |
| `PlaceholderSource` type            | `'env' \| 'git' \| 'prompt' \| 'static'`                | removed; replaced by `PlaceholderType`                                                                                                      |
| `PlaceholderType`                   | missing                                                 | `'string' \| 'number' \| 'boolean' \| 'enum' \| 'file_path'`                                                                                |
| `PlaceholderDefinition.type`        | `source?: PlaceholderSource`                            | `type?: PlaceholderType`                                                                                                                    |
| `PlaceholderDefinition.options`     | missing                                                 | `options?: string[]`                                                                                                                        |
| `Template.collection`               | missing                                                 | `collection?: string`                                                                                                                       |
| `Template.source`                   | missing                                                 | `source: TemplateSource`                                                                                                                    |
| `TemplateSource`                    | missing                                                 | `'project' \| 'global' \| 'remote'`                                                                                                         |
| `ResolvedContext`                   | `type ResolvedContext = Record<string, string>`         | removed (was unused externally)                                                                                                             |
| `RenderResult`                      | `{ content: string; unresolvedPlaceholders: string[] }` | removed; replaced by `ResolutionResult`                                                                                                     |
| `ResolutionInput`                   | missing                                                 | `{ explicit: Record<string, string>; context: Record<string, string> }`                                                                     |
| `ResolvedPlaceholder`               | missing                                                 | `{ name: string; value: string; source: 'explicit' \| 'context' \| 'default' \| 'unresolved' }`                                             |
| `ResolutionResult`                  | missing                                                 | `{ resolvedBody: string; placeholders: ResolvedPlaceholder[]; unresolvedCount: number }`                                                    |
| `ValidationSeverity`                | missing                                                 | `'error' \| 'warning'`                                                                                                                      |
| `ValidationIssue`                   | missing                                                 | `{ severity: ValidationSeverity; message: string; field?: string; line?: number }`                                                          |
| `ValidationResult` (in `types.ts`)  | missing                                                 | `{ valid: boolean; issues: ValidationIssue[] }`                                                                                             |
| `StorageProvider`                   | old 4-method low-level interface                        | new 5-method high-level interface                                                                                                           |
| `ListOptions`                       | missing                                                 | `{ collection?: string; tags?: string[]; searchQuery?: string; source?: TemplateSource }`                                                   |
| `ContextProvider.resolve`           | `resolve(key: string): Promise<string \| undefined>`    | `resolve(): Promise<Record<string, string>>` + `name: string`                                                                               |
| `StencilConfig`                     | missing                                                 | `{ version: number; defaultCollection?: string; customContext?: Record<string, string>; placeholderStart: string; placeholderEnd: string }` |

### Cascading impact on other source files

Every stub file in `packages/core/src/` imports from `types.ts`. The type changes will cause compiler errors in:

| File             | Broken because                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `validator.ts`   | Defines its own local `ValidationResult { errors: string[] }` — conflicts with new type in `types.ts`; uses old `Template` shape |
| `resolver.ts`    | Imports `RenderResult` (being removed) and `ContextProvider` (signature changes); function signature must change                 |
| `context.ts`     | Implements `ContextProvider` with `resolve(key: string)` — wrong after change; missing `name` property                           |
| `storage.ts`     | Implements old `StorageProvider` — all 4 method signatures become invalid                                                        |
| `collections.ts` | Imports `StorageProvider` — will typecheck after step 4 if stubs are aligned                                                     |

### Cascading impact on test files

| Test file                | Broken because                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/validator.test.ts` | Uses `result.errors` (field removed); constructs `Template` with minimal frontmatter that no longer satisfies new required fields                                |
| `test/resolver.test.ts`  | Checks `result.content` and `result.unresolvedPlaceholders` (replaced by `resolvedBody`, `placeholders`, `unresolvedCount`); `resolveTemplate` signature changes |
| `test/parser.test.ts`    | Constructs `Template` indirectly via `parseTemplate` — will work as long as the stub still compiles                                                              |

---

## Steps

### Step 1 — Rewrite `types.ts` to match architecture §3.2

Replace the entire file with the type definitions from the architecture document. No logic, only types.

**File:** `packages/core/src/types.ts`

**What to write:**

```typescript
// All shared type definitions for @stencil-pm/core
// Matches architecture spec §3.2 exactly.

// ── Template ──────────────────────────────────────────

export interface TemplateFrontmatter {
  name: string; // kebab-case unique identifier
  description: string; // human-readable summary
  version: number; // template version, starts at 1
  author?: string;
  tags?: string[];
  placeholders?: PlaceholderDefinition[];
}

export interface PlaceholderDefinition {
  name: string; // snake_case identifier
  description: string; // shown during interactive fill
  required: boolean; // default: true
  default?: string; // default value if not provided
  type?: PlaceholderType; // Phase 3: validation type
  options?: string[]; // Phase 3: allowed values for enum
}

export type PlaceholderType = 'string' | 'number' | 'boolean' | 'enum' | 'file_path';

export interface Template {
  frontmatter: TemplateFrontmatter;
  body: string; // raw body with {{placeholder}} tokens
  filePath: string; // absolute path to the .md file
  collection?: string; // collection name (from directory)
  source: TemplateSource; // where this template came from
}

export type TemplateSource = 'project' | 'global' | 'remote';

// ── Resolution ────────────────────────────────────────

export interface ResolutionInput {
  /** Values explicitly passed by the user (e.g., CLI args) */
  explicit: Record<string, string>;
  /** Context variables auto-resolved from environment */
  context: Record<string, string>;
}

export interface ResolvedPlaceholder {
  name: string;
  value: string;
  source: 'explicit' | 'context' | 'default' | 'unresolved';
}

export interface ResolutionResult {
  resolvedBody: string; // body with all placeholders filled
  placeholders: ResolvedPlaceholder[]; // resolution details per placeholder
  unresolvedCount: number; // how many remain unresolved
}

// ── Validation ────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  field?: string; // frontmatter field path
  line?: number; // line number in template file
}

export interface ValidationResult {
  valid: boolean; // true if no errors (warnings OK)
  issues: ValidationIssue[];
}

// ── Storage ───────────────────────────────────────────

export interface StorageProvider {
  listTemplates(options?: ListOptions): Promise<Template[]>;
  getTemplate(name: string): Promise<Template | null>;
  saveTemplate(template: Template): Promise<void>;
  deleteTemplate(name: string): Promise<boolean>;
  templateExists(name: string): Promise<boolean>;
}

export interface ListOptions {
  collection?: string;
  tags?: string[];
  searchQuery?: string;
  source?: TemplateSource;
}

// ── Context ───────────────────────────────────────────

export interface ContextProvider {
  /**
   * Returns all context variables this provider can resolve.
   * Keys are without the $ctx. prefix (e.g., "project_name", not "$ctx.project_name").
   */
  resolve(): Promise<Record<string, string>>;

  /** Human-readable name for this provider (e.g., "Git", "VS Code") */
  name: string;
}

// ── Configuration ─────────────────────────────────────

export interface StencilConfig {
  version: number;
  defaultCollection?: string;
  customContext?: Record<string, string>;
  placeholderStart: string; // default: "{{"
  placeholderEnd: string; // default: "}}"
}
```

**Validation:** `npm run typecheck` will now fail with errors in the other source files — this is expected. Proceed to fix them in order.

---

### Step 2 — Fix `validator.ts`

The stub has a local `ValidationResult` definition that conflicts with the one now exported from `types.ts`. The stub must:

- Remove the local `ValidationResult`
- Import `ValidationResult`, `ValidationIssue`, and `Template` from `types.ts`
- Update the return value of `validateTemplate` to use `issues: []` instead of `errors: []`
- Add the `validateFrontmatter` stub required by the epic

**File:** `packages/core/src/validator.ts`

**What to write:**

```typescript
// Validation logic for templates and placeholder definitions.
import type { Template, ValidationResult } from './types.js';

/**
 * Validates a parsed template for required fields and structural correctness.
 * Full rule set implemented in Epic 3.
 */
export function validateTemplate(_template: Template): ValidationResult {
  // TODO: implement validation rules (Epic 3)
  return { valid: true, issues: [] };
}

/**
 * Validates raw (pre-parse) frontmatter data.
 * Used before full parsing to catch YAML-level issues.
 * Full implementation in Epic 3.
 */
export function validateFrontmatter(_raw: unknown): ValidationResult {
  // TODO: implement pre-parse validation (Epic 3)
  return { valid: true, issues: [] };
}
```

**Validation:** `npm run typecheck` — error count should drop. `validator.ts` should be clean.

---

### Step 3 — Fix `resolver.ts`

The stub imports `RenderResult` (removed) and `ContextProvider` (changed). The function signature must change to accept `ResolutionInput` and return `ResolutionResult`.

**File:** `packages/core/src/resolver.ts`

**What to write:**

```typescript
// Placeholder resolution: substitutes {{placeholder}} tokens with resolved values.
import type { ResolutionInput, ResolutionResult, Template } from './types.js';

/**
 * Resolves all placeholders in a template body using the provided inputs.
 * Full resolution pipeline implemented in Epic 5.
 */
export function resolveTemplate(_template: Template, _input: ResolutionInput): ResolutionResult {
  // TODO: implement placeholder resolution pipeline (Epic 5)
  return { resolvedBody: '', placeholders: [], unresolvedCount: 0 };
}
```

**Validation:** `npm run typecheck` — `resolver.ts` should be clean.

---

### Step 4 — Fix `context.ts`

The stub implements the old `ContextProvider` interface: `resolve(key: string): Promise<string | undefined>`. The new interface requires `resolve(): Promise<Record<string, string>>` with no argument, plus a `name: string` property.

The current class `EnvContextProvider` is not in the architecture spec (which defines `SystemContextProvider`, `GitContextProvider`, `ProjectContextProvider`). For this epic (type alignment only), update the stubs to satisfy the new interface without implementing any logic.

**File:** `packages/core/src/context.ts`

**What to write:**

```typescript
// ContextProvider implementations (stubs — full logic in Epic 4).
import type { ContextProvider } from './types.js';

/**
 * Resolves system-level context variables: date, os, cwd.
 * Full implementation in Epic 4.
 */
export class SystemContextProvider implements ContextProvider {
  readonly name = 'System';

  resolve(): Promise<Record<string, string>> {
    // TODO: implement (Epic 4)
    return Promise.resolve({});
  }
}

/**
 * Resolves git context variables: current_branch, git_user.
 * Full implementation in Epic 4.
 */
export class GitContextProvider implements ContextProvider {
  readonly name = 'Git';

  resolve(): Promise<Record<string, string>> {
    // TODO: implement via child_process (Epic 4)
    return Promise.resolve({});
  }
}

/**
 * Resolves project context variables: project_name, language.
 * Full implementation in Epic 4.
 */
export class ProjectContextProvider implements ContextProvider {
  readonly name = 'Project';

  resolve(): Promise<Record<string, string>> {
    // TODO: implement (Epic 4)
    return Promise.resolve({});
  }
}
```

**Note:** `EnvContextProvider` is removed. It was not in the architecture spec. If it is referenced anywhere outside this package, that is a separate concern for the adapter layer.

**Validation:** `npm run typecheck` — `context.ts` should be clean.

---

### Step 5 — Fix `storage.ts`

The stub implements the old `StorageProvider` (4 low-level file methods). The new interface has 5 high-level template-object methods with different signatures.

**File:** `packages/core/src/storage.ts`

**What to write:**

```typescript
// LocalStorageProvider — filesystem-based StorageProvider (stub).
// Full implementation in Epic 6.
import type { ListOptions, StorageProvider, Template } from './types.js';

/**
 * Local filesystem-based storage provider.
 * Reads and writes templates as .md files under a project directory.
 * Full implementation in Epic 6.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly projectDir: string,
    private readonly globalDir?: string,
  ) {}

  listTemplates(_options?: ListOptions): Promise<Template[]> {
    // TODO: implement recursive .md scan (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }

  getTemplate(_name: string): Promise<Template | null> {
    // TODO: implement (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }

  saveTemplate(_template: Template): Promise<void> {
    // TODO: implement serialize + mkdir + write (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }

  deleteTemplate(_name: string): Promise<boolean> {
    // TODO: implement (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }

  templateExists(_name: string): Promise<boolean> {
    // TODO: implement (Epic 6)
    return Promise.reject(new Error('Not implemented'));
  }
}
```

**Validation:** `npm run typecheck` — `storage.ts` should be clean.

---

### Step 6 — Fix `collections.ts`

The stub uses `Collection` and `StorageProvider`. `Collection` is still a valid type (it was not changed — it stays as-is from the current file). However, `StorageProvider` signature changed so if the stub passes any method calls it could break. The current stub only accepts `_storage` as a parameter without calling it, so it should typecheck fine after `storage.ts` is fixed.

Check: does `Collection` still exist in `types.ts`? No — it was removed! The current `Collection` interface (`{ description?: string; name: string; templates: Template[] }`) is not in architecture §3.2. The architecture describes collection management as a `CollectionManager` class (Epic 7), not a `Collection` type.

**Action:** Remove the `Collection` import and type reference from `collections.ts`. Update the stub to align with the Epic 7 `CollectionManager` shape (stub only — no implementation).

**File:** `packages/core/src/collections.ts`

**What to write:**

```typescript
// CollectionManager — thin layer over StorageProvider for collection operations.
// Full implementation in Epic 7.
import type { StorageProvider, Template } from './types.js';

/**
 * Manages template collections (subdirectory-based grouping).
 * Full implementation in Epic 7.
 */
export class CollectionManager {
  constructor(private readonly storage: StorageProvider) {}

  listCollections(): Promise<string[]> {
    // TODO: derive collection names from StorageProvider (Epic 7)
    void this.storage;
    return Promise.resolve([]);
  }

  createCollection(_name: string): Promise<void> {
    // TODO: implement (Epic 7)
    return Promise.reject(new Error('Not implemented'));
  }

  moveToCollection(_templateName: string, _collectionName: string): Promise<void> {
    // TODO: implement (Epic 7)
    return Promise.reject(new Error('Not implemented'));
  }

  removeCollection(_name: string): Promise<void> {
    // TODO: implement (Epic 7)
    return Promise.reject(new Error('Not implemented'));
  }

  listTemplatesInCollection(_collectionName: string): Promise<Template[]> {
    // TODO: implement (Epic 7)
    return Promise.reject(new Error('Not implemented'));
  }
}
```

**Validation:** `npm run typecheck` — `collections.ts` should be clean.

---

### Step 7 — Update stale tests

The three existing test stubs will fail to typecheck (and fail at runtime) because they were written against the old types. Update each to compile cleanly against the new types. These tests remain stubs — they do not assert real behaviour (that comes in Epics 2–8).

#### 7a — `test/validator.test.ts`

Old test accesses `result.errors` and constructs a `Template` with minimal fields that no longer satisfy the new required fields.

**File:** `packages/core/test/validator.test.ts`

**What to write:**

```typescript
import { describe, expect, it } from 'vitest';
import { validateTemplate } from '../src/validator.js';
import type { Template } from '../src/types.js';

describe('validateTemplate', () => {
  it('should return a ValidationResult with valid and issues fields', () => {
    const template: Template = {
      body: 'Hello {{entity_name}}',
      filePath: '/fake/path.md',
      source: 'project',
      frontmatter: {
        name: 'test-template',
        description: 'A test template',
        version: 1,
      },
    };
    const result = validateTemplate(template);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
```

#### 7b — `test/resolver.test.ts`

Old test checks `result.content` and `result.unresolvedPlaceholders`; uses old `resolveTemplate(template, [])` signature.

**File:** `packages/core/test/resolver.test.ts`

**What to write:**

```typescript
import { describe, expect, it } from 'vitest';
import { resolveTemplate } from '../src/resolver.js';
import type { ResolutionInput, Template } from '../src/types.js';

describe('resolveTemplate', () => {
  it('should return a ResolutionResult with resolvedBody, placeholders, unresolvedCount', () => {
    const template: Template = {
      body: 'Hello world',
      filePath: '/fake/path.md',
      source: 'project',
      frontmatter: {
        name: 'test-template',
        description: 'A test template',
        version: 1,
      },
    };
    const input: ResolutionInput = { explicit: {}, context: {} };
    const result = resolveTemplate(template, input);
    expect(result).toHaveProperty('resolvedBody');
    expect(result).toHaveProperty('placeholders');
    expect(result).toHaveProperty('unresolvedCount');
  });
});
```

#### 7c — `test/parser.test.ts`

The `parseTemplate` stub returns a `Template` with `frontmatter: { name: '' }` and no `source` field, so it will fail typecheck once `Template.source` is required. The test itself only checks property existence — it does not construct a `Template` directly, so the test assertions are fine. However, the stub implementation in `parser.ts` must be updated to return a valid `Template`.

**File:** `packages/core/src/parser.ts` — update the stub return value only:

```typescript
// Template file parsing: extracts frontmatter and body from a template file.
import type { Template, TemplateFrontmatter } from './types.js';

/**
 * Parses a raw template string into a Template object.
 * Expected format:
 *   ---
 *   <yaml frontmatter>
 *   ---
 *   <body>
 *
 * Full implementation in Epic 2.
 */
export function parseTemplate(filePath: string, raw: string): Template {
  // TODO: implement YAML frontmatter extraction using the `yaml` package (Epic 2)
  const frontmatter: TemplateFrontmatter = {
    name: '',
    description: '',
    version: 1,
  };
  const body = raw;

  return { body, filePath, frontmatter, source: 'project' };
}
```

The test in `test/parser.test.ts` needs no content changes — it only checks property presence and will pass.

**Validation:** `npm run typecheck` — zero errors. `npm test` — all three stub tests pass.

---

### Step 8 — Verify `index.ts` exports

Confirm that `index.ts` re-exports everything adapters need. The current barrel re-exports all modules with `export * from './...'`. After the changes, `Collection` is gone from `types.ts` and `EnvContextProvider` is gone from `context.ts`. Check no external code in the monorepo imports these names.

**Check:**

```bash
grep -r "Collection\b" packages/ --include="*.ts" | grep -v "node_modules"
grep -r "EnvContextProvider" packages/ --include="*.ts" | grep -v "node_modules"
grep -r "RenderResult" packages/ --include="*.ts" | grep -v "node_modules"
grep -r "ResolvedContext" packages/ --include="*.ts" | grep -v "node_modules"
grep -r "PlaceholderSource" packages/ --include="*.ts" | grep -v "node_modules"
```

If any hits appear outside `packages/core/src/types.ts` (which you just rewrote), fix those files. The adapters (`packages/claude-code-plugin`, etc.) are stubs at this stage and unlikely to reference these types yet.

No changes to `index.ts` are required — `export *` automatically picks up new exports and drops removed ones.

---

## Exit Criteria Checklist

Run these commands and confirm all pass before closing the epic:

```bash
cd packages/core

# 1. No TypeScript errors across all source files
npm run typecheck

# 2. All three stub tests pass
npm test

# 3. Spot-check: all architecture §3.2 types are exported
node --input-type=module <<'EOF'
import * as t from './src/types.js';
const required = [
  'TemplateFrontmatter','PlaceholderDefinition','PlaceholderType',
  'Template','TemplateSource',
  'ResolutionInput','ResolvedPlaceholder','ResolutionResult',
  'ValidationSeverity','ValidationIssue','ValidationResult',
  'StorageProvider','ListOptions',
  'ContextProvider',
  'StencilConfig',
];
const missing = required.filter(n => !(n in t));
if (missing.length) { console.error('MISSING:', missing); process.exit(1); }
console.log('All required types exported.');
EOF
```

> Note: The spot-check script imports `.js` from the compiled `src/` path — run `npm run build` first if needed, or adjust the import path to run against TypeScript source via `tsx`/`ts-node`.

---

## Types Removed (intentional breaking changes)

These types existed in the old `types.ts` but are NOT in the architecture spec. They were removed as part of this epic:

| Removed type        | Reason                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PlaceholderSource` | Replaced by `PlaceholderType`; old values (`env`, `git`, `prompt`, `static`) had different semantics       |
| `Collection`        | Collection management moves to `CollectionManager` class (Epic 7); no shared `Collection` data type needed |
| `ResolvedContext`   | Was a type alias for `Record<string, string>`; inlined in `ResolutionInput`                                |
| `RenderResult`      | Replaced by `ResolutionResult` with richer structure                                                       |

Any adapter code using these names will fail to compile — this is expected and correct.
