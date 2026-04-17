# Plan: Epic 2 — Parser

**Goal:** Implement `parseTemplate()` so it correctly splits frontmatter from body, parses YAML, applies defaults, detects collection, and returns a typed `Template`. Define `ParseError` and `TemplateNotFoundError` with line-number support.

**Prerequisite:** Epic 1 (type alignment) must be complete. Verify before starting:

```bash
cd packages/core && npm run typecheck
```

Zero errors expected.

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

`parser.ts` is a stub. It ignores the `raw` string, constructs a hardcoded empty `TemplateFrontmatter`, and returns a `Template` with `source: 'project'` and no `collection`. No error handling exists.

### Target state

| Concern                | Current                                     | Target                                                           |
| ---------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| Frontmatter extraction | None — returns hardcoded empty object       | Splits on `---` delimiters; extracts YAML block                  |
| YAML parsing           | None                                        | Uses `yaml` package (already a dependency)                       |
| Placeholder defaults   | None                                        | `required` defaults to `true` when not set in YAML               |
| Collection detection   | None                                        | Parses `/collections/<name>/` from `filePath`                    |
| `source` parameter     | Hardcoded `'project'`                       | Accepted as a parameter (storage layer passes it)                |
| Error handling         | None                                        | `ParseError` (malformed), `TemplateNotFoundError` (missing file) |
| Tests                  | 1 stub test (property-existence check only) | Full coverage: happy path + all error paths                      |

### Architecture spec reference

Section §3.3 defines the parser algorithm:

```text
1. Read file contents as UTF-8 string         ← done by StorageProvider; parser receives raw string
2. Detect frontmatter boundaries:
   - First line must be "---"
   - Scan for closing "---"
   - If not found → ParseError("Missing frontmatter")
3. Extract YAML string between boundaries
4. Parse YAML into object using yaml library
5. Map parsed object to TemplateFrontmatter
   - Apply defaults: placeholder.required = true if not specified
6. Extract body = everything after closing "---", trimmed
7. Detect collection from file path:
   - If path contains /collections/<name>/ → collection = <name>
   - Otherwise → collection = undefined
8. Return Template { frontmatter, body, filePath, collection, source }
```

### Impact on other files

| File                                | Impact                                                |
| ----------------------------------- | ----------------------------------------------------- |
| `packages/core/src/parser.ts`       | Full implementation replaces stub                     |
| `packages/core/test/parser.test.ts` | Stub test replaced with full suite                    |
| `packages/core/src/index.ts`        | Add exports for `ParseError`, `TemplateNotFoundError` |
| All other `src/` files              | No changes — stubs remain as-is                       |

---

## Steps

### Step 1 — Verify Epic 1 baseline

Before touching any files, confirm the starting state is clean.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected output: zero TypeScript errors, all existing tests pass (3 stub tests).

If typecheck fails, Epic 1 is not complete. Do not proceed until it passes.

---

### Step 2 — Implement `parser.ts`

Replace the entire stub with the full implementation. This includes error classes and the `parseTemplate` function.

**File:** `packages/core/src/parser.ts`

**What to write:**

```typescript
// Template file parsing: extracts YAML frontmatter and body from a raw .md string.
import { parse as parseYaml, YAMLParseError } from 'yaml';
import type {
  PlaceholderDefinition,
  PlaceholderType,
  Template,
  TemplateFrontmatter,
  TemplateSource,
} from './types.js';

// ── Error types ───────────────────────────────────────

/**
 * Thrown when a template file does not exist on disk.
 * Raised by StorageProvider, not by parseTemplate itself.
 */
export class TemplateNotFoundError extends Error {
  constructor(public readonly filePath: string) {
    super(`Template not found: ${filePath}`);
    this.name = 'TemplateNotFoundError';
  }
}

/**
 * Thrown when a template file cannot be parsed:
 * missing frontmatter delimiters, invalid YAML, or non-object frontmatter.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

// ── Internal constants ────────────────────────────────

const DELIMITER = '---';

/**
 * Matches /collections/<name>/ (or backslash equivalents on Windows)
 * anywhere in a file path. Capture group 1 is the collection name.
 */
const COLLECTION_PATH_RE = /[/\\]collections[/\\]([^/\\]+)[/\\]/;

const VALID_PLACEHOLDER_TYPES = new Set<string>([
  'string',
  'number',
  'boolean',
  'enum',
  'file_path',
]);

// ── Public API ────────────────────────────────────────

/**
 * Parses a raw template string into a typed Template object.
 *
 * @param filePath  Absolute path to the .md file (used for collection detection and error messages).
 * @param raw       Full file contents as a UTF-8 string.
 * @param source    Where this template came from. Defaults to 'project'.
 * @throws {ParseError} If frontmatter delimiters are missing or YAML is invalid.
 */
export function parseTemplate(
  filePath: string,
  raw: string,
  source: TemplateSource = 'project',
): Template {
  const lines = raw.split('\n');

  // Step 2a: first line must be exactly "---"
  if (lines[0]?.trim() !== DELIMITER) {
    throw new ParseError('Missing frontmatter: file must start with ---', 1);
  }

  // Step 2b: scan for closing "---"
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === DELIMITER) {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    throw new ParseError('Missing closing --- for frontmatter block');
  }

  // Step 3–4: extract and parse the YAML block
  const yamlBlock = lines.slice(1, closingIndex).join('\n');
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBlock);
  } catch (err) {
    if (err instanceof YAMLParseError) {
      // YAMLParseError.linePos is an array of { line, col } (1-indexed)
      const lineNum = err.linePos?.[0]?.line;
      throw new ParseError(`Invalid YAML in frontmatter: ${err.message}`, lineNum);
    }
    throw new ParseError('Failed to parse frontmatter YAML');
  }

  // Step 5: validate shape and map to TemplateFrontmatter
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ParseError('Frontmatter must be a YAML mapping (key-value object)');
  }

  const frontmatter = mapFrontmatter(parsed as Record<string, unknown>);

  // Step 6: extract body (everything after closing ---, trimmed)
  const body = lines
    .slice(closingIndex + 1)
    .join('\n')
    .trim();

  // Step 7: detect collection from file path
  const collection = detectCollection(filePath);

  // Step 8: return Template
  return { body, collection, filePath, frontmatter, source };
}

// ── Internal helpers ──────────────────────────────────

function detectCollection(filePath: string): string | undefined {
  const match = COLLECTION_PATH_RE.exec(filePath);
  return match?.[1];
}

function mapFrontmatter(raw: Record<string, unknown>): TemplateFrontmatter {
  const placeholders = Array.isArray(raw['placeholders'])
    ? raw['placeholders'].map((p, i) => mapPlaceholder(p, i))
    : undefined;

  return {
    author: typeof raw['author'] === 'string' ? raw['author'] : undefined,
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    placeholders,
    tags: Array.isArray(raw['tags'])
      ? raw['tags'].filter((t): t is string => typeof t === 'string')
      : undefined,
    version: typeof raw['version'] === 'number' ? raw['version'] : 0,
  };
}

function mapPlaceholder(raw: unknown, index: number): PlaceholderDefinition {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ParseError(`placeholders[${index}] must be a YAML mapping`);
  }
  const p = raw as Record<string, unknown>;

  return {
    default: typeof p['default'] === 'string' ? p['default'] : undefined,
    description: typeof p['description'] === 'string' ? p['description'] : '',
    name: typeof p['name'] === 'string' ? p['name'] : '',
    options: Array.isArray(p['options'])
      ? p['options'].filter((o): o is string => typeof o === 'string')
      : undefined,
    // Architecture §3.3 default: required = true when not specified
    required: typeof p['required'] === 'boolean' ? p['required'] : true,
    type: isPlaceholderType(p['type']) ? p['type'] : undefined,
  };
}

function isPlaceholderType(value: unknown): value is PlaceholderType {
  return typeof value === 'string' && VALID_PLACEHOLDER_TYPES.has(value);
}
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Zero errors expected. The stub test in `test/parser.test.ts` still passes (it only checks property existence).

---

### Step 3 — Update `index.ts` to export error classes

Adapters and callers need to import `ParseError` and `TemplateNotFoundError` from the package's public API.

**File:** `packages/core/src/index.ts`

First read the current file, then add the named exports for the error classes.

The current `index.ts` likely uses `export * from './parser.js'`. Because the new `parser.ts` already exports `ParseError` and `TemplateNotFoundError` at the module level, `export *` will re-export them automatically.

**Check:** Read `packages/core/src/index.ts` and confirm it contains `export * from './parser.js'` (or equivalent). If it does — no change needed for this step. If it uses named re-exports, add `ParseError` and `TemplateNotFoundError` explicitly.

**Validation:**

```bash
cd packages/core && npm run typecheck
```

---

### Step 4 — Replace stub test with the full test suite

Replace the single stub test with comprehensive tests covering all paths defined in the Epic 2 exit criteria.

**File:** `packages/core/test/parser.test.ts`

**What to write:**

```typescript
import { describe, expect, it } from 'vitest';
import { ParseError, TemplateNotFoundError, parseTemplate } from '../src/parser.js';

// ── Helpers ───────────────────────────────────────────

function makeRaw(frontmatter: string, body = ''): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

const MINIMAL_FM = `name: my-template\ndescription: A test template\nversion: 1`;

// ── Happy path ────────────────────────────────────────

describe('parseTemplate — happy path', () => {
  it('returns a Template with correct shape for a minimal valid template', () => {
    const result = parseTemplate(
      '/project/.stencil/templates/my-template.md',
      makeRaw(MINIMAL_FM, 'Hello world'),
    );
    expect(result.filePath).toBe('/project/.stencil/templates/my-template.md');
    expect(result.source).toBe('project');
    expect(result.collection).toBeUndefined();
    expect(result.frontmatter.name).toBe('my-template');
    expect(result.frontmatter.description).toBe('A test template');
    expect(result.frontmatter.version).toBe(1);
    expect(result.body).toBe('Hello world');
  });

  it('parses all optional frontmatter fields', () => {
    const fm = [
      'name: full-template',
      'description: Full featured template',
      'version: 3',
      'author: piotr',
      'tags: [backend, rest]',
    ].join('\n');
    const result = parseTemplate('/fake/full-template.md', makeRaw(fm, 'body'));
    expect(result.frontmatter.author).toBe('piotr');
    expect(result.frontmatter.tags).toEqual(['backend', 'rest']);
    expect(result.frontmatter.version).toBe(3);
  });

  it('passes the source parameter through to the Template', () => {
    const result = parseTemplate('/fake/t.md', makeRaw(MINIMAL_FM), 'global');
    expect(result.source).toBe('global');
  });

  it('defaults source to "project" when not provided', () => {
    const result = parseTemplate('/fake/t.md', makeRaw(MINIMAL_FM));
    expect(result.source).toBe('project');
  });

  it('trims leading and trailing whitespace from the body', () => {
    const result = parseTemplate('/fake/t.md', makeRaw(MINIMAL_FM, '\n\n  Hello  \n\n'));
    expect(result.body).toBe('Hello');
  });

  it('returns an empty string body when there is no content after closing ---', () => {
    const result = parseTemplate('/fake/t.md', `---\n${MINIMAL_FM}\n---`);
    expect(result.body).toBe('');
  });
});

// ── Placeholder defaults ──────────────────────────────

describe('parseTemplate — placeholder defaults', () => {
  it('sets required=true when placeholder does not specify required', () => {
    const fm = [
      ...MINIMAL_FM.split('\n'),
      'placeholders:',
      '  - name: entity_name',
      '    description: The entity name',
    ].join('\n');
    const result = parseTemplate('/fake/t.md', makeRaw(fm));
    expect(result.frontmatter.placeholders?.[0]?.required).toBe(true);
  });

  it('preserves required=false when explicitly set', () => {
    const fm = [
      ...MINIMAL_FM.split('\n'),
      'placeholders:',
      '  - name: auth_required',
      '    description: Whether auth is needed',
      '    required: false',
    ].join('\n');
    const result = parseTemplate('/fake/t.md', makeRaw(fm));
    expect(result.frontmatter.placeholders?.[0]?.required).toBe(false);
  });

  it('parses placeholder with default value', () => {
    const fm = [
      ...MINIMAL_FM.split('\n'),
      'placeholders:',
      '  - name: operations',
      '    description: CRUD operations',
      '    required: true',
      "    default: 'create, read'",
    ].join('\n');
    const result = parseTemplate('/fake/t.md', makeRaw(fm));
    expect(result.frontmatter.placeholders?.[0]?.default).toBe('create, read');
  });

  it('parses multiple placeholders', () => {
    const fm = [
      ...MINIMAL_FM.split('\n'),
      'placeholders:',
      '  - name: entity_name',
      '    description: Entity name',
      '  - name: operations',
      '    description: Operations',
      '    required: false',
      "    default: 'create'",
    ].join('\n');
    const result = parseTemplate('/fake/t.md', makeRaw(fm));
    expect(result.frontmatter.placeholders).toHaveLength(2);
    expect(result.frontmatter.placeholders?.[0]?.required).toBe(true);
    expect(result.frontmatter.placeholders?.[1]?.required).toBe(false);
    expect(result.frontmatter.placeholders?.[1]?.default).toBe('create');
  });
});

// ── Collection detection ──────────────────────────────

describe('parseTemplate — collection detection', () => {
  it('detects collection name from /collections/<name>/ in file path', () => {
    const result = parseTemplate(
      '/project/.stencil/collections/backend/create-rest-endpoint.md',
      makeRaw(MINIMAL_FM),
    );
    expect(result.collection).toBe('backend');
  });

  it('detects collection with nested subdirectory path', () => {
    const result = parseTemplate(
      '/home/user/.stencil/collections/review/security-review.md',
      makeRaw(MINIMAL_FM),
    );
    expect(result.collection).toBe('review');
  });

  it('returns undefined collection for templates/ path', () => {
    const result = parseTemplate('/project/.stencil/templates/quick-fix.md', makeRaw(MINIMAL_FM));
    expect(result.collection).toBeUndefined();
  });

  it('returns undefined collection when path has no /collections/ segment', () => {
    const result = parseTemplate('/fake/my-template.md', makeRaw(MINIMAL_FM));
    expect(result.collection).toBeUndefined();
  });
});

// ── Error: missing frontmatter ────────────────────────

describe('parseTemplate — missing --- delimiter errors', () => {
  it('throws ParseError when file does not start with ---', () => {
    expect(() => parseTemplate('/fake/t.md', 'No frontmatter here')).toThrow(ParseError);
  });

  it('throws ParseError with descriptive message when opening --- is missing', () => {
    expect(() => parseTemplate('/fake/t.md', 'name: foo\n---\nbody')).toThrow(
      /Missing frontmatter/,
    );
  });

  it('includes line number 1 in the error when opening --- is missing', () => {
    try {
      parseTemplate('/fake/t.md', 'no delimiter');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).line).toBe(1);
    }
  });

  it('throws ParseError when closing --- is absent', () => {
    expect(() => parseTemplate('/fake/t.md', `---\nname: foo`)).toThrow(ParseError);
  });

  it('throws ParseError with descriptive message when closing --- is missing', () => {
    expect(() => parseTemplate('/fake/t.md', `---\nname: foo`)).toThrow(/closing ---/);
  });
});

// ── Error: invalid YAML ───────────────────────────────

describe('parseTemplate — malformed YAML errors', () => {
  it('throws ParseError for invalid YAML indentation', () => {
    const raw = `---\nname: foo\n  bad: indentation: here\n---\nbody`;
    expect(() => parseTemplate('/fake/t.md', raw)).toThrow(ParseError);
  });

  it('throws ParseError with "YAML" in the message for a YAML syntax error', () => {
    const raw = `---\n: invalid key\n---\nbody`;
    expect(() => parseTemplate('/fake/t.md', raw)).toThrow(/YAML/i);
  });

  it('throws ParseError when frontmatter is a YAML list, not a mapping', () => {
    const raw = `---\n- item1\n- item2\n---\nbody`;
    expect(() => parseTemplate('/fake/t.md', raw)).toThrow(ParseError);
  });
});

// ── TemplateNotFoundError ─────────────────────────────

describe('TemplateNotFoundError', () => {
  it('is an instance of Error', () => {
    const err = new TemplateNotFoundError('/some/path.md');
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes filePath property', () => {
    const err = new TemplateNotFoundError('/some/path.md');
    expect(err.filePath).toBe('/some/path.md');
  });

  it('has name "TemplateNotFoundError"', () => {
    const err = new TemplateNotFoundError('/some/path.md');
    expect(err.name).toBe('TemplateNotFoundError');
  });

  it('includes the file path in the message', () => {
    const err = new TemplateNotFoundError('/some/path.md');
    expect(err.message).toContain('/some/path.md');
  });
});

// ── ParseError ────────────────────────────────────────

describe('ParseError', () => {
  it('is an instance of Error', () => {
    const err = new ParseError('something went wrong');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name "ParseError"', () => {
    const err = new ParseError('something went wrong');
    expect(err.name).toBe('ParseError');
  });

  it('stores the optional line number', () => {
    const err = new ParseError('bad yaml', 5);
    expect(err.line).toBe(5);
  });

  it('line is undefined when not provided', () => {
    const err = new ParseError('bad yaml');
    expect(err.line).toBeUndefined();
  });
});
```

**Validation:**

```bash
cd packages/core && npm run typecheck && npm test
```

All tests must pass. Zero TypeScript errors.

---

### Step 5 — Verify `index.ts` exports `ParseError` and `TemplateNotFoundError`

Check that consumers can import the error classes from the package root.

```bash
cd packages/core
```

Read `src/index.ts`. If it uses `export * from './parser.js'`, the error classes are already re-exported — no changes needed.

If named exports are used, add:

```typescript
export { ParseError, TemplateNotFoundError } from './parser.js';
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

---

### Step 6 — Final exit criteria check

Run the full validation suite and confirm every exit criterion is met:

```bash
cd packages/core

# 1. Zero TypeScript errors
npm run typecheck

# 2. All tests pass
npm test

# 3. Spot-check: parseTemplate handles all required cases
# (covered by the test suite above — no separate script needed)
```

**Exit criteria checklist:**

| Criterion                                                      | Verified by                         |
| -------------------------------------------------------------- | ----------------------------------- |
| `parseTemplate` splits `---` boundaries correctly              | `happy path` tests                  |
| YAML frontmatter parsed into typed `TemplateFrontmatter`       | `happy path` + `placeholder` tests  |
| `placeholder.required` defaults to `true` when unset           | `placeholder defaults` tests        |
| `collection` detected from `/collections/<name>/` path segment | `collection detection` tests        |
| `TemplateNotFoundError` thrown for missing files               | `TemplateNotFoundError` class tests |
| `ParseError` thrown for missing opening `---`                  | `missing --- delimiter` tests       |
| `ParseError` thrown for missing closing `---`                  | `missing --- delimiter` tests       |
| `ParseError` thrown for invalid YAML                           | `malformed YAML` tests              |
| `ParseError.line` carries line number where available          | `ParseError` class tests            |
| `npm run typecheck` passes with zero errors                    | Step 2 + Step 3 validations         |

---

## Implementation Notes

### Why `parseTemplate` takes `raw: string` instead of reading the file itself

The architecture algorithm lists "Read file contents" as step 1, but the storage layer (`LocalStorageProvider`, Epic 6) is responsible for filesystem I/O. The parser receives the already-read string. This keeps the parser:

- **Pure** — no side effects, no I/O
- **Testable** — no mocking of `fs` required
- **Reusable** — any source of raw template text (disk, network, in-memory) can use it

`TemplateNotFoundError` is defined here because it belongs to the parser's public error contract, even though it is thrown by the storage layer.

### Why `source` defaults to `'project'`

In the majority of calls, the template comes from the project directory. Epic 6 will explicitly pass `'global'` for templates found in `globalDir`. Defaulting to `'project'` keeps test fixtures concise.

### `version` mapped to `0` when YAML value is missing or wrong type

`0` is deliberately invalid per rule V4 (`version` must be a positive integer). This means a template with a missing `version` field will pass through `parseTemplate` without error and then fail `validateTemplate` (Epic 3) with a proper `ValidationIssue`. The parser does not duplicate validation logic.

### YAML `YAMLParseError.linePos` is the offset within the YAML block, not the template file

The `line` field on `ParseError` for YAML errors reflects the line within the frontmatter block (starting at 1 = the line after the opening `---`). This is the most useful context for the user since they need to fix the YAML.
