# Plan: Epic 5 — Resolver

**Goal:** Implement `resolveTemplate()` in `resolver.ts` — the pure placeholder substitution pipeline — and expand `resolver.test.ts` with a full test suite covering every resolution path.

**Prerequisites:** Epics 1, 2, 3, and 4 must be complete. Verify before starting:

```bash
cd packages/core && npm run typecheck && npm test
```

Zero errors and all existing tests (parser, validator, context) passing expected.

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

`resolver.ts` has a stub that ignores all inputs and returns `{ placeholders: [], resolvedBody: '', unresolvedCount: 0 }`. `resolver.test.ts` has a single smoke test that only asserts the result shape.

### Target state

| Concern                            | Current               | Target                                                |
| ---------------------------------- | --------------------- | ----------------------------------------------------- |
| `resolveTemplate()` implementation | Stub — ignores inputs | Full resolution pipeline                              |
| Resolution priority                | Not implemented       | explicit → context → default → unresolved             |
| `$ctx.*` token handling            | Not implemented       | Look up in `input.context` (without `$ctx.` prefix)   |
| Declared placeholder replacement   | Not implemented       | Replace all `{{name}}` occurrences in body            |
| Unknown token handling             | Not implemented       | Leave as-is                                           |
| `ResolvedPlaceholder[]` output     | Always `[]`           | Per-placeholder detail with `name`, `value`, `source` |
| `unresolvedCount`                  | Always `0`            | Count of placeholders with `source: 'unresolved'`     |
| `resolver.test.ts`                 | One smoke test        | Full suite — every resolution path and edge case      |

### Resolution pipeline (architecture §3.5)

```text
Input: Template + ResolutionInput { explicit, context }
Output: ResolutionResult { resolvedBody, placeholders, unresolvedCount }

Phase 1 — Resolve each declared placeholder:
  For each placeholder in template.frontmatter.placeholders:
    1. explicit[name]  → source: 'explicit'
    2. context[name]   → source: 'context'
    3. placeholder.default → source: 'default'
    4. none matched    → source: 'unresolved', value: ''

Phase 2 — Substitute tokens in body:
  Scan body with PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g
  For each match:
    - Token starts with "$ctx." → look up context[token.slice(5)]
    - Otherwise              → look up resolved placeholders map
    - Found → replace with value
    - Not found → leave token as-is ({{token}} remains in output)

Phase 3 — Assemble result:
  unresolvedCount = count of placeholders where source === 'unresolved'
  return { resolvedBody, placeholders, unresolvedCount }
```

### Key behaviours

- **Pure and stateless** — no I/O, no side effects, no prompting. Same inputs → same output.
- **Idempotent** — safe to call multiple times.
- **Unknown tokens** — a `{{token}}` in the body that is not declared in frontmatter and is not a `$ctx.*` variable is left unchanged. No error is thrown; the validator (Epic 3, rule V8) already warns about this.
- **Context pre-resolved** — the resolver never runs the Context Engine. `input.context` is already a flat `Record<string, string>` filled by the caller (adapter or `Stencil.resolve()` in Epic 8).
- **`$ctx.` prefix stripped** — `{{$ctx.date}}` looks up `input.context['date']`, not `input.context['$ctx.date']`.
- **Unresolved value** — a placeholder with `source: 'unresolved'` has `value: ''` (empty string). The `{{name}}` token remains in `resolvedBody`.
- **Multiple occurrences** — every occurrence of `{{name}}` in the body is replaced, not just the first.

### Impact on other files

| File                                  | Impact                                                |
| ------------------------------------- | ----------------------------------------------------- |
| `packages/core/src/resolver.ts`       | Full implementation replaces stub                     |
| `packages/core/test/resolver.test.ts` | Existing smoke test replaced/expanded with full suite |
| `packages/core/src/index.ts`          | No change — already exports `resolveTemplate`         |
| All other `src/` files                | No changes                                            |

---

## Steps

### Step 1 — Verify baseline

Before touching any files, confirm the starting state is clean.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all existing tests pass (parser + validator + context suites). If any fail, fix them before proceeding.

---

### Step 2 — Implement `resolver.ts`

Replace the entire stub with the full implementation.

**File:** `packages/core/src/resolver.ts`

**What to write:**

```typescript
// Placeholder resolution: substitutes {{placeholder}} tokens with resolved values.
// Architecture §3.5
import type { ResolutionInput, ResolutionResult, ResolvedPlaceholder, Template } from './types.js';

/** Regex that matches all {{token}} occurrences in a template body. */
const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Resolves all placeholders in a template body using the provided inputs.
 *
 * Resolution priority (highest → lowest):
 *   1. explicit  — values passed directly by the user
 *   2. context   — auto-resolved $ctx.* variables (pre-computed by ContextEngine)
 *   3. default   — default value declared in frontmatter
 *   4. unresolved — no value available; token left unchanged in body
 *
 * Pure and stateless: no I/O, no prompting, same inputs produce same output.
 */
export function resolveTemplate(template: Template, input: ResolutionInput): ResolutionResult {
  const { explicit, context } = input;
  const declared = template.frontmatter.placeholders ?? [];

  // ── Phase 1: Resolve each declared placeholder ─────────────────────────────

  const resolvedMap = new Map<string, string>();
  const placeholders: ResolvedPlaceholder[] = [];

  for (const placeholder of declared) {
    const { name, default: defaultValue } = placeholder;
    let resolved: ResolvedPlaceholder;

    if (name in explicit && explicit[name] !== undefined) {
      resolved = { name, source: 'explicit', value: explicit[name]! };
    } else if (name in context && context[name] !== undefined) {
      resolved = { name, source: 'context', value: context[name]! };
    } else if (defaultValue !== undefined) {
      resolved = { name, source: 'default', value: defaultValue };
    } else {
      resolved = { name, source: 'unresolved', value: '' };
    }

    placeholders.push(resolved);
    if (resolved.source !== 'unresolved') {
      resolvedMap.set(name, resolved.value);
    }
  }

  const unresolvedCount = placeholders.filter((p) => p.source === 'unresolved').length;

  // ── Phase 2: Substitute tokens in body ────────────────────────────────────

  const resolvedBody = template.body.replace(PLACEHOLDER_REGEX, (_match, token: string) => {
    const trimmed = token.trim();

    if (trimmed.startsWith('$ctx.')) {
      // Context variable: strip prefix and look up in context map
      const key = trimmed.slice('$ctx.'.length);
      return context[key] ?? _match;
    }

    // Regular placeholder: look up in the resolved map
    return resolvedMap.has(trimmed) ? resolvedMap.get(trimmed)! : _match;
  });

  return { placeholders, resolvedBody, unresolvedCount };
}
```

**Validation:**

```bash
cd packages/core && npm run typecheck
```

Expected: zero errors.

---

### Step 3 — Expand `resolver.test.ts`

Replace the single smoke test with a comprehensive suite. The existing test can be kept or removed — the new tests fully supersede it.

**File:** `packages/core/test/resolver.test.ts`

**Coverage requirements:**

| Area                                       | Tests required                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| No placeholders, no tokens                 | Body unchanged, empty arrays, unresolvedCount 0                                     |
| Explicit resolution                        | `source: 'explicit'`, value from `input.explicit`                                   |
| Context resolution                         | `source: 'context'`, value from `input.context`                                     |
| Default resolution                         | `source: 'default'`, value from `placeholder.default`                               |
| Unresolved                                 | `source: 'unresolved'`, value `''`, token left in body, unresolvedCount incremented |
| Priority — explicit over context           | explicit wins                                                                       |
| Priority — explicit over default           | explicit wins                                                                       |
| Priority — context over default            | context wins                                                                        |
| `$ctx.*` tokens in body                    | Replaced from `input.context`                                                       |
| `$ctx.*` token missing from context        | Left as-is                                                                          |
| Unknown token (not declared, not `$ctx.*`) | Left as-is                                                                          |
| Multiple occurrences of same placeholder   | All occurrences replaced                                                            |
| Multiple placeholders in body              | Each replaced independently                                                         |
| Partial resolution                         | Mix of resolved and unresolved, correct unresolvedCount                             |
| Template with no declared placeholders     | No `ResolvedPlaceholder` entries                                                    |
| Whitespace in token                        | `{{ name }}` (with spaces) is trimmed and matched                                   |

**What to write:**

```typescript
import { describe, expect, it } from 'vitest';
import { resolveTemplate } from '../src/resolver.js';
import type { PlaceholderDefinition, ResolutionInput, Template } from '../src/types.js';

// ── Helpers ───────────────────────────────────────────

function makeTemplate(body: string, placeholders: PlaceholderDefinition[] = []): Template {
  return {
    body,
    filePath: '/fake/template.md',
    frontmatter: {
      description: 'Test template',
      name: 'test-template',
      placeholders,
      version: 1,
    },
    source: 'project',
  };
}

function makePlaceholder(
  name: string,
  opts: Partial<Omit<PlaceholderDefinition, 'name' | 'description'>> = {},
): PlaceholderDefinition {
  return { description: `Description for ${name}`, name, required: true, ...opts };
}

function makeInput(
  explicit: Record<string, string> = {},
  context: Record<string, string> = {},
): ResolutionInput {
  return { context, explicit };
}

// ── No placeholders / no tokens ───────────────────────

describe('resolveTemplate — no placeholders, no tokens', () => {
  it('returns body unchanged when template has no body tokens and no placeholders', () => {
    const template = makeTemplate('Hello world');
    const result = resolveTemplate(template, makeInput());
    expect(result.resolvedBody).toBe('Hello world');
    expect(result.placeholders).toEqual([]);
    expect(result.unresolvedCount).toBe(0);
  });

  it('returns empty string body unchanged', () => {
    const template = makeTemplate('');
    const result = resolveTemplate(template, makeInput());
    expect(result.resolvedBody).toBe('');
    expect(result.unresolvedCount).toBe(0);
  });
});

// ── Resolution sources ────────────────────────────────

describe('resolveTemplate — explicit resolution', () => {
  it('resolves a placeholder from explicit input', () => {
    const template = makeTemplate('Hello {{name}}', [makePlaceholder('name')]);
    const result = resolveTemplate(template, makeInput({ name: 'world' }));
    expect(result.resolvedBody).toBe('Hello world');
    expect(result.placeholders).toHaveLength(1);
    expect(result.placeholders[0]).toEqual({ name: 'name', source: 'explicit', value: 'world' });
    expect(result.unresolvedCount).toBe(0);
  });
});

describe('resolveTemplate — context resolution', () => {
  it('resolves a placeholder from context when not in explicit', () => {
    const template = makeTemplate('Repo: {{project}}', [makePlaceholder('project')]);
    const result = resolveTemplate(template, makeInput({}, { project: 'stencil' }));
    expect(result.resolvedBody).toBe('Repo: stencil');
    expect(result.placeholders[0]).toEqual({
      name: 'project',
      source: 'context',
      value: 'stencil',
    });
    expect(result.unresolvedCount).toBe(0);
  });
});

describe('resolveTemplate — default resolution', () => {
  it('resolves a placeholder from its declared default', () => {
    const placeholder = makePlaceholder('env', { default: 'production' });
    const template = makeTemplate('Env: {{env}}', [placeholder]);
    const result = resolveTemplate(template, makeInput());
    expect(result.resolvedBody).toBe('Env: production');
    expect(result.placeholders[0]).toEqual({ name: 'env', source: 'default', value: 'production' });
    expect(result.unresolvedCount).toBe(0);
  });
});

describe('resolveTemplate — unresolved', () => {
  it('marks a placeholder as unresolved when no value is available', () => {
    const template = makeTemplate('Hello {{name}}', [makePlaceholder('name')]);
    const result = resolveTemplate(template, makeInput());
    expect(result.resolvedBody).toBe('Hello {{name}}');
    expect(result.placeholders[0]).toEqual({ name: 'name', source: 'unresolved', value: '' });
    expect(result.unresolvedCount).toBe(1);
  });

  it('leaves the {{token}} in the body when placeholder is unresolved', () => {
    const template = makeTemplate('{{a}} and {{b}}', [makePlaceholder('a'), makePlaceholder('b')]);
    const result = resolveTemplate(template, makeInput());
    expect(result.resolvedBody).toBe('{{a}} and {{b}}');
    expect(result.unresolvedCount).toBe(2);
  });
});

// ── Priority order ────────────────────────────────────

describe('resolveTemplate — priority: explicit > context > default', () => {
  it('explicit beats context', () => {
    const template = makeTemplate('{{x}}', [makePlaceholder('x')]);
    const result = resolveTemplate(
      template,
      makeInput({ x: 'from-explicit' }, { x: 'from-context' }),
    );
    expect(result.resolvedBody).toBe('from-explicit');
    expect(result.placeholders[0]!.source).toBe('explicit');
  });

  it('explicit beats default', () => {
    const template = makeTemplate('{{x}}', [makePlaceholder('x', { default: 'from-default' })]);
    const result = resolveTemplate(template, makeInput({ x: 'from-explicit' }));
    expect(result.resolvedBody).toBe('from-explicit');
    expect(result.placeholders[0]!.source).toBe('explicit');
  });

  it('context beats default', () => {
    const template = makeTemplate('{{x}}', [makePlaceholder('x', { default: 'from-default' })]);
    const result = resolveTemplate(template, makeInput({}, { x: 'from-context' }));
    expect(result.resolvedBody).toBe('from-context');
    expect(result.placeholders[0]!.source).toBe('context');
  });

  it('default is used when no explicit or context value', () => {
    const template = makeTemplate('{{x}}', [makePlaceholder('x', { default: 'fallback' })]);
    const result = resolveTemplate(template, makeInput());
    expect(result.resolvedBody).toBe('fallback');
    expect(result.placeholders[0]!.source).toBe('default');
  });
});

// ── $ctx.* tokens ─────────────────────────────────────

describe('resolveTemplate — $ctx.* context variables in body', () => {
  it('replaces a $ctx.* token from input.context (prefix stripped)', () => {
    const template = makeTemplate('Date: {{$ctx.date}}');
    const result = resolveTemplate(template, makeInput({}, { date: '2026-04-20' }));
    expect(result.resolvedBody).toBe('Date: 2026-04-20');
    expect(result.placeholders).toHaveLength(0);
  });

  it('leaves a $ctx.* token unchanged when not found in context', () => {
    const template = makeTemplate('Branch: {{$ctx.current_branch}}');
    const result = resolveTemplate(template, makeInput({}, {}));
    expect(result.resolvedBody).toBe('Branch: {{$ctx.current_branch}}');
  });

  it('resolves multiple $ctx.* tokens in one body', () => {
    const template = makeTemplate('{{$ctx.os}} / {{$ctx.cwd}}');
    const result = resolveTemplate(template, makeInput({}, { cwd: '/home/user', os: 'linux' }));
    expect(result.resolvedBody).toBe('linux / /home/user');
  });

  it('mixes $ctx.* and regular placeholder tokens', () => {
    const template = makeTemplate('Project {{project_name}} on {{$ctx.current_branch}}', [
      makePlaceholder('project_name'),
    ]);
    const result = resolveTemplate(
      template,
      makeInput({ project_name: 'stencil' }, { current_branch: 'main' }),
    );
    expect(result.resolvedBody).toBe('Project stencil on main');
    expect(result.unresolvedCount).toBe(0);
  });
});

// ── Unknown tokens ────────────────────────────────────

describe('resolveTemplate — unknown tokens', () => {
  it('leaves an undeclared token as-is (no declared placeholders)', () => {
    const template = makeTemplate('Value: {{not_declared}}');
    const result = resolveTemplate(template, makeInput());
    expect(result.resolvedBody).toBe('Value: {{not_declared}}');
    expect(result.placeholders).toHaveLength(0);
    expect(result.unresolvedCount).toBe(0);
  });

  it('leaves an undeclared token as-is even when other placeholders are declared', () => {
    const template = makeTemplate('{{declared}} and {{unknown}}', [makePlaceholder('declared')]);
    const result = resolveTemplate(template, makeInput({ declared: 'yes' }));
    expect(result.resolvedBody).toBe('yes and {{unknown}}');
    expect(result.unresolvedCount).toBe(0); // only declared placeholders count
  });
});

// ── Multiple occurrences ──────────────────────────────

describe('resolveTemplate — multiple occurrences of same placeholder', () => {
  it('replaces every occurrence of a placeholder token', () => {
    const template = makeTemplate('{{name}} is {{name}}', [makePlaceholder('name')]);
    const result = resolveTemplate(template, makeInput({ name: 'Alice' }));
    expect(result.resolvedBody).toBe('Alice is Alice');
  });
});

// ── Multiple placeholders ─────────────────────────────

describe('resolveTemplate — multiple declared placeholders', () => {
  it('resolves each placeholder independently', () => {
    const template = makeTemplate('Entity: {{entity_name}}, ops: {{operations}}', [
      makePlaceholder('entity_name'),
      makePlaceholder('operations'),
    ]);
    const result = resolveTemplate(
      template,
      makeInput({ entity_name: 'Invoice', operations: 'create,read' }),
    );
    expect(result.resolvedBody).toBe('Entity: Invoice, ops: create,read');
    expect(result.unresolvedCount).toBe(0);
  });

  it('includes one ResolvedPlaceholder entry per declared placeholder', () => {
    const template = makeTemplate('{{a}} {{b}}', [makePlaceholder('a'), makePlaceholder('b')]);
    const result = resolveTemplate(template, makeInput({ a: '1', b: '2' }));
    expect(result.placeholders).toHaveLength(2);
    expect(result.placeholders.map((p) => p.name)).toEqual(['a', 'b']);
  });
});

// ── Partial resolution ────────────────────────────────

describe('resolveTemplate — partial resolution', () => {
  it('resolves some and leaves others unresolved', () => {
    const template = makeTemplate('{{auth}} requires {{role}}', [
      makePlaceholder('auth'),
      makePlaceholder('role'),
    ]);
    const result = resolveTemplate(template, makeInput({ auth: 'oauth2' }));
    expect(result.resolvedBody).toBe('oauth2 requires {{role}}');
    expect(result.unresolvedCount).toBe(1);
    expect(result.placeholders.find((p) => p.name === 'auth')!.source).toBe('explicit');
    expect(result.placeholders.find((p) => p.name === 'role')!.source).toBe('unresolved');
  });

  it('counts each unresolved placeholder once even if it appears multiple times in body', () => {
    const template = makeTemplate('{{x}} and {{x}} and {{x}}', [makePlaceholder('x')]);
    const result = resolveTemplate(template, makeInput());
    expect(result.unresolvedCount).toBe(1);
    expect(result.resolvedBody).toBe('{{x}} and {{x}} and {{x}}');
  });
});

// ── Whitespace in token ───────────────────────────────

describe('resolveTemplate — whitespace in token', () => {
  it('trims whitespace inside {{ }} when matching placeholder name', () => {
    const template = makeTemplate('{{ name }}', [makePlaceholder('name')]);
    const result = resolveTemplate(template, makeInput({ name: 'trimmed' }));
    expect(result.resolvedBody).toBe('trimmed');
  });

  it('trims whitespace inside {{ }} for $ctx.* tokens', () => {
    const template = makeTemplate('{{ $ctx.date }}');
    const result = resolveTemplate(template, makeInput({}, { date: '2026-01-01' }));
    expect(result.resolvedBody).toBe('2026-01-01');
  });
});

// ── Result shape ──────────────────────────────────────

describe('resolveTemplate — result shape', () => {
  it('always returns resolvedBody, placeholders, and unresolvedCount', () => {
    const template = makeTemplate('Hello world');
    const result = resolveTemplate(template, makeInput());
    expect(result).toHaveProperty('resolvedBody');
    expect(result).toHaveProperty('placeholders');
    expect(result).toHaveProperty('unresolvedCount');
  });

  it('placeholders array is empty when no placeholders declared', () => {
    const template = makeTemplate('No placeholders here');
    const result = resolveTemplate(template, makeInput());
    expect(result.placeholders).toEqual([]);
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

- All previously passing tests (parser, validator, context) still pass.
- All new `resolver.test.ts` tests pass.
- No test depends on I/O, file system, or external processes — all tests run in-process synchronously.

**If tests fail:**

| Symptom                                        | Likely cause                                                     | Fix                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `PLACEHOLDER_REGEX` flag issue                 | Using `g` flag without resetting between calls                   | `replace()` handles this correctly with `g` flag; do not use `exec()` in a loop |
| `context[name]` not found but key exists       | Key casing mismatch                                              | Confirm `input.context` uses bare key names without `$ctx.` prefix              |
| `{{ name }}` (with spaces) not matched         | Token not trimmed before lookup                                  | Add `.trim()` to token before map lookups                                       |
| Unresolved placeholder replaced by `undefined` | `resolvedMap.get()` returns undefined, coerced to string         | Only call `resolvedMap.get()` after confirming `resolvedMap.has()`              |
| `unresolvedCount` off by one                   | Counting body token occurrences instead of declared placeholders | Count based on `placeholders` array entries with `source === 'unresolved'`      |

---

### Step 5 — Verify typecheck and final state

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero TypeScript errors, all tests pass (parser + validator + context + resolver suites).

This is the exit criterion for Epic 5.

---

## Exit Criteria Checklist

- [ ] `resolveTemplate()` processes templates with no placeholders without error
- [ ] Explicit values take priority over context, default, and unresolved
- [ ] Context values take priority over default and unresolved
- [ ] Default values are used when no explicit or context value provided
- [ ] Placeholders with no value are marked `source: 'unresolved'`, `value: ''`
- [ ] `{{$ctx.key}}` tokens look up `input.context['key']` (prefix stripped)
- [ ] `{{$ctx.key}}` tokens missing from context are left unchanged
- [ ] Unknown body tokens (not declared, not `$ctx.*`) are left unchanged
- [ ] All occurrences of a placeholder token in the body are replaced
- [ ] `unresolvedCount` equals the count of declared placeholders with no resolved value
- [ ] `placeholders[]` contains one entry per declared placeholder (not per token occurrence)
- [ ] Token whitespace is trimmed before lookup (`{{ name }}` matches `name`)
- [ ] `resolveTemplate()` is pure: no I/O, no mutation of inputs, idempotent
- [ ] `npm run typecheck` exits with zero errors
- [ ] `npm test` passes — all tests green, no regressions in prior suites
