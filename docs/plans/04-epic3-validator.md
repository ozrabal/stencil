# Plan: Epic 3 — Validator

**Goal:** Implement `validateTemplate()` with the full 10-rule set from architecture §3.4, and implement `validateFrontmatter()` for pre-parse use. Return structured `ValidationResult` with typed `ValidationIssue[]`.

**Prerequisite:** Epic 2 (parser) must be complete. Verify before starting:

```bash
cd packages/core && npm run typecheck && npm test
```

Zero errors and all tests passing expected.

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

`validator.ts` is a two-function stub. Both `validateTemplate` and `validateFrontmatter` ignore their arguments and return `{ issues: [], valid: true }`. The single test in `test/validator.test.ts` only checks that those two properties exist on the return value.

### Target state

| Concern                              | Current                                             | Target                                                              |
| ------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------- |
| `validateTemplate` implementation    | Stub — returns `{ valid: true, issues: [] }` always | Full 10-rule set (V1–V10); returns errors and warnings              |
| `validateFrontmatter` implementation | Stub                                                | Validates raw YAML-parsed object for frontmatter rules (V1–V7, V10) |
| `valid` semantics                    | Always `true`                                       | `true` only when there are no `'error'`-severity issues             |
| Placeholder body cross-checks        | None                                                | V8 (undeclared tokens in body), V9 (unused declared placeholders)   |
| Tests                                | 1 stub test                                         | Full suite; every rule exercised by at least one test               |

### Validation rules

| ID  | Check                                  | Severity | Regex / condition                                             | Scope                    |
| --- | -------------------------------------- | -------- | ------------------------------------------------------------- | ------------------------ |
| V1  | `name` present                         | Error    | Non-empty string                                              | frontmatter              |
| V2  | `name` is kebab-case                   | Error    | `/^[a-z0-9]+(-[a-z0-9]+)*$/`                                  | frontmatter              |
| V3  | `description` present                  | Error    | Non-empty string                                              | frontmatter              |
| V4  | `version` is positive integer          | Error    | `Number.isInteger(v) && v >= 1`                               | frontmatter              |
| V5  | `placeholders[].name` is snake_case    | Error    | `/^[a-z0-9]+(_[a-z0-9]+)*$/`                                  | frontmatter placeholders |
| V6  | `placeholders[].description` present   | Error    | Non-empty string                                              | frontmatter placeholders |
| V7  | No duplicate placeholder names         | Error    | Unique `name` values across all placeholders                  | frontmatter placeholders |
| V8  | Body references undeclared placeholder | Warning  | `{{token}}` in body, `token` not in frontmatter, not `$ctx.*` | body + frontmatter       |
| V9  | Declared placeholder not used in body  | Warning  | Placeholder in frontmatter but no `{{name}}` in body          | body + frontmatter       |
| V10 | `required` placeholder has `default`   | Warning  | `required === true && default !== undefined`                  | frontmatter placeholders |

Rules V8 and V9 require both a body and frontmatter — they are checked only in `validateTemplate`, not in `validateFrontmatter`.

### Impact on other files

| File                                   | Impact                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| `packages/core/src/validator.ts`       | Full implementation replaces stub                         |
| `packages/core/test/validator.test.ts` | Stub test replaced with full suite                        |
| `packages/core/src/index.ts`           | No change — already uses `export * from './validator.js'` |
| All other `src/` files                 | No changes                                                |

---

## Steps

### Step 1 — Verify Epic 2 baseline

Before touching any files, confirm the starting state is clean.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected output: zero TypeScript errors, all existing tests pass (parser test suite from Epic 2 + stub validator test).

If typecheck fails, do not proceed until it passes.

---

### Step 2 — Implement `validator.ts`

Replace the entire stub with the full implementation.

**File:** `packages/core/src/validator.ts`

**What to write:**

```typescript
// Validation logic for templates and placeholder definitions.
import type { Template, ValidationIssue, ValidationResult } from './types.js';

// ── Regex constants ────────────────────────────────────
// Architecture §3.4
const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SNAKE_CASE_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

// ── Public API ────────────────────────────────────────

/**
 * Validates a fully parsed Template against all 10 rules (V1–V10).
 *
 * Returns a ValidationResult with:
 *   - valid: true  → no Error-severity issues (warnings are allowed)
 *   - valid: false → at least one Error-severity issue exists
 */
export function validateTemplate(template: Template): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { frontmatter, body } = template;

  // ── V1: name present ──────────────────────────────────
  if (!frontmatter.name || frontmatter.name.trim() === '') {
    issues.push({
      field: 'name',
      message: 'Template name is required',
      severity: 'error',
    });
  } else if (!KEBAB_CASE_RE.test(frontmatter.name)) {
    // ── V2: name is kebab-case ───────────────────────────
    issues.push({
      field: 'name',
      message: `Template name must be kebab-case (e.g. "my-template"), got: "${frontmatter.name}"`,
      severity: 'error',
    });
  }

  // ── V3: description present ───────────────────────────
  if (!frontmatter.description || frontmatter.description.trim() === '') {
    issues.push({
      field: 'description',
      message: 'Template description is required',
      severity: 'error',
    });
  }

  // ── V4: version is positive integer ──────────────────
  if (!Number.isInteger(frontmatter.version) || frontmatter.version < 1) {
    issues.push({
      field: 'version',
      message: `Template version must be a positive integer, got: ${frontmatter.version}`,
      severity: 'error',
    });
  }

  const placeholders = frontmatter.placeholders ?? [];
  const seenNames = new Set<string>();

  for (let i = 0; i < placeholders.length; i++) {
    const p = placeholders[i];

    // ── V5: placeholder name is snake_case ───────────────
    if (!p.name || p.name.trim() === '' || !SNAKE_CASE_RE.test(p.name)) {
      issues.push({
        field: `placeholders[${i}].name`,
        message: `Placeholder name must be snake_case (e.g. "entity_name"), got: "${p.name}"`,
        severity: 'error',
      });
    }

    // ── V6: placeholder description present ──────────────
    if (!p.description || p.description.trim() === '') {
      issues.push({
        field: `placeholders[${i}].description`,
        message: `Placeholder "${p.name}" is missing a description`,
        severity: 'error',
      });
    }

    // ── V7: no duplicate placeholder names ───────────────
    if (p.name) {
      if (seenNames.has(p.name)) {
        issues.push({
          field: `placeholders[${i}].name`,
          message: `Duplicate placeholder name: "${p.name}"`,
          severity: 'error',
        });
      } else {
        seenNames.add(p.name);
      }
    }

    // ── V10: required placeholder has default ─────────────
    if (p.required === true && p.default !== undefined) {
      issues.push({
        field: `placeholders[${i}]`,
        message: `Placeholder "${p.name}" is marked required but has a default value (effectively optional)`,
        severity: 'warning',
      });
    }
  }

  // ── Body cross-checks (V8 and V9) ─────────────────────
  const bodyTokens = extractBodyTokens(body);
  const declaredNames = new Set(placeholders.map((p) => p.name).filter(Boolean));

  // V8: body references undeclared placeholder (ignore $ctx.*)
  for (const token of bodyTokens) {
    if (token.startsWith('$ctx.')) continue;
    if (!declaredNames.has(token)) {
      issues.push({
        message: `Body references undeclared placeholder: "{{${token}}}"`,
        severity: 'warning',
      });
    }
  }

  // V9: declared placeholder not used in body
  for (const p of placeholders) {
    if (p.name && !bodyTokens.has(p.name)) {
      issues.push({
        field: 'placeholders',
        message: `Placeholder "${p.name}" is declared but not referenced in the body`,
        severity: 'warning',
      });
    }
  }

  return {
    issues,
    valid: issues.every((issue) => issue.severity !== 'error'),
  };
}

/**
 * Validates raw (pre-parse) frontmatter data.
 * Accepts an unknown value (the result of YAML.parse) and checks it
 * against frontmatter-only rules V1–V7 and V10.
 * Rules V8 and V9 require the template body and are not checked here.
 */
export function validateFrontmatter(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push({
      message: 'Frontmatter must be a YAML mapping (key-value object)',
      severity: 'error',
    });
    return { issues, valid: false };
  }

  const fm = raw as Record<string, unknown>;

  // ── V1: name present ──────────────────────────────────
  if (!fm['name'] || typeof fm['name'] !== 'string' || fm['name'].trim() === '') {
    issues.push({
      field: 'name',
      message: 'Template name is required',
      severity: 'error',
    });
  } else if (!KEBAB_CASE_RE.test(fm['name'])) {
    // ── V2: name is kebab-case ───────────────────────────
    issues.push({
      field: 'name',
      message: `Template name must be kebab-case (e.g. "my-template"), got: "${fm['name']}"`,
      severity: 'error',
    });
  }

  // ── V3: description present ───────────────────────────
  if (
    !fm['description'] ||
    typeof fm['description'] !== 'string' ||
    fm['description'].trim() === ''
  ) {
    issues.push({
      field: 'description',
      message: 'Template description is required',
      severity: 'error',
    });
  }

  // ── V4: version is positive integer ──────────────────
  if (!Number.isInteger(fm['version']) || (fm['version'] as number) < 1) {
    issues.push({
      field: 'version',
      message: `Template version must be a positive integer, got: ${fm['version']}`,
      severity: 'error',
    });
  }

  // ── Placeholder rules V5, V6, V7, V10 ────────────────
  if (Array.isArray(fm['placeholders'])) {
    const seenNames = new Set<string>();

    for (let i = 0; i < fm['placeholders'].length; i++) {
      const p = fm['placeholders'][i];

      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        issues.push({
          field: `placeholders[${i}]`,
          message: `Placeholder at index ${i} must be an object`,
          severity: 'error',
        });
        continue;
      }

      const placeholder = p as Record<string, unknown>;
      const pName = typeof placeholder['name'] === 'string' ? placeholder['name'] : '';

      // V5
      if (!pName || !SNAKE_CASE_RE.test(pName)) {
        issues.push({
          field: `placeholders[${i}].name`,
          message: `Placeholder name must be snake_case (e.g. "entity_name"), got: "${pName}"`,
          severity: 'error',
        });
      }

      // V6
      if (
        !placeholder['description'] ||
        typeof placeholder['description'] !== 'string' ||
        (placeholder['description'] as string).trim() === ''
      ) {
        issues.push({
          field: `placeholders[${i}].description`,
          message: `Placeholder "${pName}" is missing a description`,
          severity: 'error',
        });
      }

      // V7
      if (pName) {
        if (seenNames.has(pName)) {
          issues.push({
            field: `placeholders[${i}].name`,
            message: `Duplicate placeholder name: "${pName}"`,
            severity: 'error',
          });
        } else {
          seenNames.add(pName);
        }
      }

      // V10
      if (placeholder['required'] === true && placeholder['default'] !== undefined) {
        issues.push({
          field: `placeholders[${i}]`,
          message: `Placeholder "${pName}" is marked required but has a default value (effectively optional)`,
          severity: 'warning',
        });
      }
    }
  }

  return {
    issues,
    valid: issues.every((issue) => issue.severity !== 'error'),
  };
}

// ── Internal helpers ──────────────────────────────────

/**
 * Extracts all {{token}} references from a body string.
 * Returns a Set of trimmed token strings (e.g. "entity_name", "$ctx.date").
 */
function extractBodyTokens(body: string): Set<string> {
  const tokens = new Set<string>();
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const token = match[1]?.trim();
    if (token) tokens.add(token);
  }
  return tokens;
}
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Zero errors expected. The existing stub test in `test/validator.test.ts` must still pass (valid template still returns `valid: true` with `issues: []`).

---

### Step 3 — Replace stub tests with the full test suite

Replace the single stub test with comprehensive tests covering every rule and both functions.

**File:** `packages/core/test/validator.test.ts`

**What to write:**

```typescript
import { describe, expect, it } from 'vitest';
import { validateFrontmatter, validateTemplate } from '../src/validator.js';
import type { Template } from '../src/types.js';

// ── Helpers ───────────────────────────────────────────

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    body: 'Hello {{entity_name}}',
    filePath: '/fake/path.md',
    frontmatter: {
      description: 'A test template',
      name: 'test-template',
      placeholders: [
        {
          description: 'The entity name',
          name: 'entity_name',
          required: true,
        },
      ],
      version: 1,
    },
    source: 'project',
    ...overrides,
  };
}

// ── validateTemplate — happy path ─────────────────────

describe('validateTemplate — happy path', () => {
  it('returns valid=true and empty issues for a correct template', () => {
    const result = validateTemplate(makeTemplate());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns valid=true when there are only warnings', () => {
    // V9: placeholder declared but not used in body
    const template = makeTemplate({
      body: 'No placeholders here',
      frontmatter: {
        description: 'A test template',
        name: 'test-template',
        placeholders: [{ description: 'Entity name', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
    expect(result.issues.every((i) => i.severity !== 'error')).toBe(true);
  });

  it('returns valid=false when there is at least one error', () => {
    const template = makeTemplate({
      frontmatter: {
        description: '',
        name: 'test-template',
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.valid).toBe(false);
  });
});

// ── V1: name present ──────────────────────────────────

describe('validateTemplate — V1: name present', () => {
  it('reports error when name is an empty string', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: '', version: 1 } }),
    );
    const v1 = result.issues.find((i) => i.field === 'name' && i.severity === 'error');
    expect(v1).toBeDefined();
  });

  it('reports error when name is whitespace only', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: '   ', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });
});

// ── V2: name is kebab-case ────────────────────────────

describe('validateTemplate — V2: name format is kebab-case', () => {
  it('accepts a valid kebab-case name', () => {
    const result = validateTemplate(
      makeTemplate({
        body: '',
        frontmatter: { description: 'desc', name: 'my-template', version: 1 },
      }),
    );
    expect(result.issues.some((i) => i.field === 'name')).toBe(false);
  });

  it('accepts a single-word lowercase name', () => {
    const result = validateTemplate(
      makeTemplate({
        body: '',
        frontmatter: { description: 'desc', name: 'template', version: 1 },
      }),
    );
    expect(result.issues.some((i) => i.field === 'name')).toBe(false);
  });

  it('reports error for PascalCase name', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'MyTemplate', version: 1 } }),
    );
    const v2 = result.issues.find((i) => i.field === 'name' && i.severity === 'error');
    expect(v2).toBeDefined();
  });

  it('reports error for snake_case name', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'my_template', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });

  it('reports error for name with trailing hyphen', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'my-template-', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });

  it('reports error for name with uppercase characters', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'My-Template', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });
});

// ── V3: description present ───────────────────────────

describe('validateTemplate — V3: description present', () => {
  it('reports error when description is an empty string', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: '', name: 'test', version: 1 } }),
    );
    const v3 = result.issues.find((i) => i.field === 'description' && i.severity === 'error');
    expect(v3).toBeDefined();
  });

  it('reports error when description is whitespace only', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: '  ', name: 'test', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'description' && i.severity === 'error')).toBe(
      true,
    );
  });
});

// ── V4: version is positive integer ──────────────────

describe('validateTemplate — V4: version is positive integer', () => {
  it('accepts version=1', () => {
    const result = validateTemplate(
      makeTemplate({ body: '', frontmatter: { description: 'desc', name: 'test', version: 1 } }),
    );
    expect(result.issues.some((i) => i.field === 'version')).toBe(false);
  });

  it('accepts version=42', () => {
    const result = validateTemplate(
      makeTemplate({ body: '', frontmatter: { description: 'desc', name: 'test', version: 42 } }),
    );
    expect(result.issues.some((i) => i.field === 'version')).toBe(false);
  });

  it('reports error when version=0', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'test', version: 0 } }),
    );
    const v4 = result.issues.find((i) => i.field === 'version' && i.severity === 'error');
    expect(v4).toBeDefined();
  });

  it('reports error when version is negative', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'test', version: -1 } }),
    );
    expect(result.issues.some((i) => i.field === 'version' && i.severity === 'error')).toBe(true);
  });

  it('reports error when version is a float', () => {
    const result = validateTemplate(
      makeTemplate({ frontmatter: { description: 'desc', name: 'test', version: 1.5 } }),
    );
    expect(result.issues.some((i) => i.field === 'version' && i.severity === 'error')).toBe(true);
  });
});

// ── V5: placeholder name is snake_case ───────────────

describe('validateTemplate — V5: placeholder name is snake_case', () => {
  it('accepts a valid snake_case placeholder name', () => {
    const result = validateTemplate(makeTemplate());
    expect(result.issues.some((i) => i.field?.includes('placeholders[0].name'))).toBe(false);
  });

  it('accepts a single-word lowercase placeholder name', () => {
    const template = makeTemplate({
      body: '{{name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Name', name: 'name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.issues.some((i) => i.field?.includes('.name') && i.severity === 'error')).toBe(
      false,
    );
  });

  it('reports error for camelCase placeholder name', () => {
    const template = makeTemplate({
      body: '{{entityName}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entityName', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some(
        (i) => i.field?.includes('placeholders[0].name') && i.severity === 'error',
      ),
    ).toBe(true);
  });

  it('reports error for kebab-case placeholder name', () => {
    const template = makeTemplate({
      body: '{{entity-name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entity-name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some(
        (i) => i.field?.includes('placeholders[0].name') && i.severity === 'error',
      ),
    ).toBe(true);
  });
});

// ── V6: placeholder description present ──────────────

describe('validateTemplate — V6: placeholder description present', () => {
  it('reports error when placeholder description is empty', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: '', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some((i) => i.field?.includes('description') && i.severity === 'error'),
    ).toBe(true);
  });

  it('reports error when placeholder description is whitespace only', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: '   ', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some((i) => i.field?.includes('description') && i.severity === 'error'),
    ).toBe(true);
  });
});

// ── V7: no duplicate placeholder names ───────────────

describe('validateTemplate — V7: no duplicate placeholder names', () => {
  it('reports error when two placeholders have the same name', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [
          { description: 'First', name: 'entity_name', required: true },
          { description: 'Second', name: 'entity_name', required: true },
        ],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const v7 = result.issues.find((i) => i.message.includes('Duplicate') && i.severity === 'error');
    expect(v7).toBeDefined();
  });

  it('does not report error when placeholder names are unique', () => {
    const template = makeTemplate({
      body: '{{entity_name}} {{operations}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [
          { description: 'First', name: 'entity_name', required: true },
          { description: 'Second', name: 'operations', required: true },
        ],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.issues.some((i) => i.message.includes('Duplicate'))).toBe(false);
  });
});

// ── V8: body references undeclared placeholder ────────

describe('validateTemplate — V8: undeclared placeholder in body', () => {
  it('reports warning when body uses {{token}} not in frontmatter', () => {
    const template = makeTemplate({
      body: 'Hello {{entity_name}} and {{undeclared_var}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const v8 = result.issues.find(
      (i) => i.message.includes('undeclared') && i.severity === 'warning',
    );
    expect(v8).toBeDefined();
    expect(v8?.message).toContain('undeclared_var');
  });

  it('does not report warning for $ctx.* tokens in body', () => {
    const template = makeTemplate({
      body: 'Project: {{$ctx.project_name}}, entity: {{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(result.issues.some((i) => i.message.includes('$ctx.') && i.severity === 'warning')).toBe(
      false,
    );
  });

  it('reports warning for each individual undeclared token', () => {
    const template = makeTemplate({
      body: '{{a_var}} and {{b_var}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const undeclared = result.issues.filter(
      (i) => i.message.includes('undeclared') && i.severity === 'warning',
    );
    expect(undeclared).toHaveLength(2);
  });
});

// ── V9: declared placeholder not used in body ─────────

describe('validateTemplate — V9: declared placeholder not used in body', () => {
  it('reports warning when placeholder is declared but not in body', () => {
    const template = makeTemplate({
      body: 'No placeholders here',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [{ description: 'Entity name', name: 'entity_name', required: true }],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const v9 = result.issues.find(
      (i) =>
        i.message.includes('entity_name') &&
        i.message.includes('not referenced') &&
        i.severity === 'warning',
    );
    expect(v9).toBeDefined();
  });

  it('does not report warning when all declared placeholders are used', () => {
    const result = validateTemplate(makeTemplate());
    expect(result.issues.some((i) => i.message.includes('not referenced'))).toBe(false);
  });
});

// ── V10: required placeholder with default ────────────

describe('validateTemplate — V10: required placeholder with default', () => {
  it('reports warning when required=true and default is set', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [
          {
            default: 'Invoice',
            description: 'Entity name',
            name: 'entity_name',
            required: true,
          },
        ],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    const v10 = result.issues.find(
      (i) => i.field?.includes('placeholders[0]') && i.severity === 'warning',
    );
    expect(v10).toBeDefined();
  });

  it('does not report warning when required=false and default is set', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: 'desc',
        name: 'test',
        placeholders: [
          {
            default: 'Invoice',
            description: 'Entity name',
            name: 'entity_name',
            required: false,
          },
        ],
        version: 1,
      },
    });
    const result = validateTemplate(template);
    expect(
      result.issues.some((i) => i.severity === 'warning' && i.message.includes('entity_name')),
    ).toBe(false);
  });

  it('does not report warning when required=true but no default', () => {
    const result = validateTemplate(makeTemplate());
    expect(
      result.issues.some(
        (i) => i.severity === 'warning' && i.message.includes('effectively optional'),
      ),
    ).toBe(false);
  });
});

// ── Multiple issues ───────────────────────────────────

describe('validateTemplate — multiple issues', () => {
  it('reports all applicable issues in a single call', () => {
    const template = makeTemplate({
      body: '{{entity_name}}',
      frontmatter: {
        description: '', // V3 error
        name: 'BadName', // V2 error
        placeholders: [
          { description: '', name: 'entityName', required: true }, // V5 + V6 errors
        ],
        version: 0, // V4 error
      },
    });
    const result = validateTemplate(template);
    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(result.valid).toBe(false);
  });
});

// ── validateFrontmatter — happy path ──────────────────

describe('validateFrontmatter — happy path', () => {
  it('returns valid=true for a correct frontmatter object', () => {
    const raw = {
      description: 'A test template',
      name: 'my-template',
      version: 1,
    };
    const result = validateFrontmatter(raw);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns valid=true with placeholders that pass all rules', () => {
    const raw = {
      description: 'desc',
      name: 'my-template',
      placeholders: [{ description: 'The entity name', name: 'entity_name', required: true }],
      version: 1,
    };
    const result = validateFrontmatter(raw);
    expect(result.valid).toBe(true);
  });
});

// ── validateFrontmatter — invalid input ───────────────

describe('validateFrontmatter — invalid input types', () => {
  it('returns error for null input', () => {
    const result = validateFrontmatter(null);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('returns error for array input', () => {
    const result = validateFrontmatter(['item1', 'item2']);
    expect(result.valid).toBe(false);
  });

  it('returns error for string input', () => {
    const result = validateFrontmatter('just a string');
    expect(result.valid).toBe(false);
  });
});

// ── validateFrontmatter — V1–V4 ───────────────────────

describe('validateFrontmatter — V1: name present', () => {
  it('reports error when name is missing', () => {
    const result = validateFrontmatter({ description: 'desc', version: 1 });
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
    expect(result.valid).toBe(false);
  });
});

describe('validateFrontmatter — V2: name is kebab-case', () => {
  it('reports error for PascalCase name', () => {
    const result = validateFrontmatter({ description: 'desc', name: 'MyTemplate', version: 1 });
    expect(result.issues.some((i) => i.field === 'name' && i.severity === 'error')).toBe(true);
  });
});

describe('validateFrontmatter — V3: description present', () => {
  it('reports error when description is missing', () => {
    const result = validateFrontmatter({ name: 'my-template', version: 1 });
    expect(result.issues.some((i) => i.field === 'description' && i.severity === 'error')).toBe(
      true,
    );
  });
});

describe('validateFrontmatter — V4: version is positive integer', () => {
  it('reports error when version is 0', () => {
    const result = validateFrontmatter({ description: 'desc', name: 'my-template', version: 0 });
    expect(result.issues.some((i) => i.field === 'version' && i.severity === 'error')).toBe(true);
  });

  it('reports error when version is missing', () => {
    const result = validateFrontmatter({ description: 'desc', name: 'my-template' });
    expect(result.issues.some((i) => i.field === 'version' && i.severity === 'error')).toBe(true);
  });
});

// ── validateFrontmatter — V5–V7, V10 ─────────────────

describe('validateFrontmatter — V5–V7, V10: placeholder rules', () => {
  it('reports error for camelCase placeholder name (V5)', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: [{ description: 'Entity', name: 'entityName', required: true }],
      version: 1,
    });
    expect(
      result.issues.some(
        (i) => i.field?.includes('placeholders[0].name') && i.severity === 'error',
      ),
    ).toBe(true);
  });

  it('reports error for missing placeholder description (V6)', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: [{ description: '', name: 'entity_name', required: true }],
      version: 1,
    });
    expect(
      result.issues.some((i) => i.field?.includes('description') && i.severity === 'error'),
    ).toBe(true);
  });

  it('reports error for duplicate placeholder names (V7)', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: [
        { description: 'First', name: 'entity_name', required: true },
        { description: 'Second', name: 'entity_name', required: true },
      ],
      version: 1,
    });
    expect(
      result.issues.some((i) => i.message.includes('Duplicate') && i.severity === 'error'),
    ).toBe(true);
  });

  it('reports warning for required placeholder with default (V10)', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: [
        { default: 'Invoice', description: 'Entity name', name: 'entity_name', required: true },
      ],
      version: 1,
    });
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
    expect(result.valid).toBe(true); // warnings don't make it invalid
  });

  it('reports error when placeholder entry is not an object', () => {
    const result = validateFrontmatter({
      description: 'desc',
      name: 'my-template',
      placeholders: ['not-an-object'],
      version: 1,
    });
    expect(result.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});
```

**Validation:**

```bash
cd packages/core && npm run typecheck && npm test
```

All tests must pass. Zero TypeScript errors.

---

### Step 4 — Final exit criteria check

Run the full validation suite and confirm every exit criterion is met.

```bash
cd packages/core

# 1. Zero TypeScript errors
npm run typecheck

# 2. All tests pass (parser suite + validator suite)
npm test
```

**Exit criteria checklist:**

| Criterion                                                                     | Verified by                             |
| ----------------------------------------------------------------------------- | --------------------------------------- |
| V1 — `name` present catches empty/missing name                                | `V1` tests in both suites               |
| V2 — `name` is kebab-case, regex `/^[a-z0-9]+(-[a-z0-9]+)*$/`                 | `V2` tests in both suites               |
| V3 — `description` present catches empty/missing                              | `V3` tests in both suites               |
| V4 — `version` is positive integer (not 0, not float, not negative)           | `V4` tests in both suites               |
| V5 — `placeholders[].name` is snake*case, regex `/^[a-z0-9]+(*[a-z0-9]+)\*$/` | `V5` tests                              |
| V6 — `placeholders[].description` present                                     | `V6` tests in both suites               |
| V7 — No duplicate placeholder names                                           | `V7` tests in both suites               |
| V8 — Body `{{token}}` not in frontmatter triggers warning                     | `V8` tests; `$ctx.*` is not flagged     |
| V9 — Declared placeholder not in body triggers warning                        | `V9` tests                              |
| V10 — `required=true` + `default` triggers warning                            | `V10` tests in both suites              |
| `valid: true` when only warnings                                              | `happy path` + `V9`/`V10` warning tests |
| `valid: false` when at least one error                                        | Every error-rule test                   |
| `validateFrontmatter` accepts `unknown`, rejects non-objects                  | `invalid input` tests                   |
| `npm run typecheck` passes with zero errors                                   | Step 2 + Step 3 validations             |

---

## Implementation Notes

### Why `validateTemplate` and `validateFrontmatter` are separate

`validateFrontmatter(raw: unknown)` is called at the storage layer boundary, _before_ `parseTemplate` has been invoked — for example, when the storage layer wants to reject a malformed file cheaply without building a full `Template`. Because it receives raw `unknown` data it can only check frontmatter-level rules (V1–V7, V10). Rules V8 and V9 require both the parsed frontmatter and the body, so they are only checked in `validateTemplate`.

### Why V1 and V2 are chained with `else if`

If `name` is empty, reporting a kebab-case violation on top of it is noisy and misleading. Once V1 fires, V2 is skipped. Same logic applies in `validateFrontmatter`.

### Regex choices

| Rule | Regex                        | Notes                                                                                     |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| V2   | `/^[a-z0-9]+(-[a-z0-9]+)*$/` | From architecture §3.4 exactly. Rejects leading/trailing hyphens, uppercase, underscores. |
| V5   | `/^[a-z0-9]+(_[a-z0-9]+)*$/` | Symmetric with V2. Rejects camelCase, kebab, uppercase.                                   |

Single lowercase words (`template`, `name`) satisfy both regexes.

### `extractBodyTokens` uses a fresh regex per call

`RegExp` with `/g` flag is stateful (`.lastIndex`). A single shared constant re-used across calls would produce incorrect results. The helper creates a fresh `RegExp` from `PLACEHOLDER_RE.source` on each invocation.

### `valid` semantics

`valid: true` means the template is safe to use. Warnings are advisory — they indicate potential issues (e.g., declared placeholder missing from body) but do not block execution. This matches the PRD requirement that warnings surface information without blocking the user.

### Template with no placeholders

A template with an empty `placeholders` array or no `placeholders` field at all is perfectly valid if V1–V4 pass. V8/V9 checks are no-ops when neither frontmatter placeholders nor body tokens exist.
