# Plan: Epic E — Delimiter-Aware Placeholder Pipeline

**Goal:** Make placeholder detection and replacement in `@stencil-pm/core` honor runtime-configured delimiters end to end, while preserving `{{` / `}}` as the default behavior and keeping the current passing suite green.

**Scope boundary:** Treat parser, storage, collections, facade mutation APIs, config loading, global-directory discovery, and structured error primitives as already implemented. Do not re-plan parser/validator/resolver/storage from scratch. Keep adapter prompting and UI behavior out of scope. Prefer additive changes that preserve the current public facade and current test suite behavior for default delimiters.

**Important repo-specific note:** On the current branch, Epic A, Epic B, Epic C, and Epic D are already present in code. `packages/core/src/config.ts` already loads `placeholderStart` and `placeholderEnd`, but `packages/core/src/validator.ts` and `packages/core/src/resolver.ts` still hardcode `{{...}}`, and `packages/core/src/stencil.ts` does not yet pass runtime delimiter config into validation or resolution. Epic E should close that exact gap.

**Required by planning notes:**

- Keep foundational module work out of scope.
- Keep adapter responsibilities out of scope unless a new core contract is required.
- Prefer additive changes that keep the current suite green.
- Include both API-level tests and end-to-end facade tests.

**Prerequisites:** Confirm the current `packages/core` baseline is green before editing.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero type errors and the current full Vitest suite passes before Epic E work begins.

**Per-step validation default:**

```bash
cd packages/core && npm run typecheck
```

**Recommended targeted test command during implementation:**

```bash
cd packages/core && npx vitest run test/config.test.ts test/validator.test.ts test/resolver.test.ts test/stencil.test.ts
```

**Required final validation:**

```bash
cd packages/core && npm run typecheck && npm test
```

---

## Current Repo State

- `packages/core/src/config.ts` already resolves a runtime `StencilConfig` with:
  - `placeholderStart`
  - `placeholderEnd`
- `packages/core/src/validator.ts` still uses `const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;`.
- `packages/core/src/resolver.ts` still uses `const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;`.
- `packages/core/src/stencil.ts` loads runtime config lazily, but:
  - `resolve()` calls `resolveTemplate(template, input)` with no delimiter options
  - `validate()` calls `validateTemplate(template)` with no delimiter options
  - `assertMutationIsValid()` also calls `validateTemplate(template)` with no delimiter options
- `packages/core/test/resolver.test.ts` and `packages/core/test/validator.test.ts` only cover default `{{...}}` behavior today.
- `packages/core/test/stencil.test.ts` already proves config-backed `custom_context` and default collection behavior, so Epic E can extend those facade tests instead of inventing a new harness.

This means the remaining work is not config loading. The real gap is placeholder tokenization and facade wiring.

---

## Target Behavior

After this epic:

- Validator body-token extraction respects the configured delimiter pair.
- Resolver replacement respects the configured delimiter pair.
- `Stencil.validate()` becomes config-aware for placeholder warnings.
- `Stencil.resolve()` becomes config-aware for placeholder replacement.
- Facade mutation validation stays aligned with runtime config:
  - `create()`
  - `update()`
  - `copy()`
  - `rename()`
- `$ctx.*` tokens still work when wrapped in custom delimiters such as `[[ $ctx.team_name ]]`.
- Default `{{` / `}}` behavior remains unchanged for existing callers and tests.
- Invalid delimiter definitions fail clearly and early instead of producing unsafe regex behavior.
- The epic includes:
  - API-level tests for the tokenizer, validator, and resolver
  - end-to-end facade tests using real `config.yaml` files and real `Stencil` flows

---

## Design Decisions To Lock Before Editing

### 1. Keep parser scope unchanged

Do not modify `parser.ts` for placeholder delimiters. Template file parsing still concerns YAML frontmatter plus body extraction. Placeholder tokenization remains validator/resolver work.

### 2. Introduce one shared placeholder utility instead of duplicating regex logic

Both `validator.ts` and `resolver.ts` currently embed their own hardcoded regex. Replace that with one shared helper module so delimiter escaping, trimming, and matching stay consistent.

Recommended internal module:

- `packages/core/src/placeholders.ts`

Recommended responsibilities:

- escape delimiter strings safely for regex construction
- build a placeholder-matching regex from `start` and `end`
- extract trimmed tokens from a body into a `Set<string>`
- provide one default delimiter pair for all fallback behavior

### 3. Keep public module APIs backward-compatible with optional delimiter options

The current public exports include `validateTemplate(...)` and `resolveTemplate(...)`. Do not break existing callers. The lowest-risk change is to add an optional options argument with default behavior.

Recommended shape:

```ts
interface PlaceholderDelimiters {
  start: string;
  end: string;
}

validateTemplate(template, options?)
resolveTemplate(template, input, options?)
```

Where omitted options preserve current `{{` / `}}` behavior.

This keeps direct module tests possible without forcing every caller through `Stencil`.

### 4. Make `Stencil` the main config-aware entry point

Even with optional module-level options, the facade should remain the main place where config is applied automatically.

Required wiring:

- `Stencil.validate()` must load runtime config before validation.
- `Stencil.resolve()` must use runtime config delimiters.
- `assertMutationIsValid()` must validate with runtime config delimiters so warning behavior stays coherent for create/update/copy/rename flows.

### 5. Validate delimiter definitions narrowly but explicitly

Current config validation only checks that delimiters are strings. That is not sufficient once they drive regex construction.

Epic E should add a narrow, low-risk validation rule so malformed delimiter config fails early. Recommended rules:

- `placeholder_start` must be a non-empty string
- `placeholder_end` must be a non-empty string
- `placeholder_start` and `placeholder_end` must not be identical

Do not broaden this into a full placeholder grammar redesign. The goal is only to prevent unsafe or ambiguous regex generation.

### 6. Preserve current placeholder semantics unless the docs require Epic E specifically

Keep these current behaviors intact:

- whitespace inside delimiters is trimmed
- repeated tokens are all replaced
- unknown tokens remain unchanged during resolution
- `$ctx.*` remains special only after token extraction
- warnings remain non-blocking

Do not expand scope into:

- interactive fill behavior
- conditional blocks
- includes
- escape-sequence rendering changes
- nested-placeholder semantics

For malformed or mixed delimiters, “fail safely” should mean:

- invalid configured delimiters throw a typed config error
- unmatched body text using the wrong delimiter pair remains unchanged
- validation/resolution never crash because of regex construction

### 7. Default-delimiter behavior is a compatibility constraint

All current `{{` / `}}` tests should stay green without modification unless a test is being generalized to cover both default and custom cases.

---

## Proposed Internal Contract

Recommended new internal module:

- `packages/core/src/placeholders.ts`

Recommended exports:

```ts
export interface PlaceholderDelimiters {
  start: string;
  end: string;
}

export const DEFAULT_PLACEHOLDER_DELIMITERS: PlaceholderDelimiters;

export function buildPlaceholderRegex(delimiters?: PlaceholderDelimiters): RegExp;
export function extractPlaceholderTokens(
  body: string,
  delimiters?: PlaceholderDelimiters,
): Set<string>;
```

Recommended optional signatures in existing modules:

```ts
export function validateTemplate(
  template: Template,
  options?: { delimiters?: PlaceholderDelimiters },
): ValidationResult;

export function resolveTemplate(
  template: Template,
  input: ResolutionInput,
  options?: { delimiters?: PlaceholderDelimiters },
): ResolutionResult;
```

These options should remain optional and default to `DEFAULT_PLACEHOLDER_DELIMITERS`.

---

## Files Expected To Change

- `packages/core/src/placeholders.ts` (new)
- `packages/core/src/validator.ts`
- `packages/core/src/resolver.ts`
- `packages/core/src/stencil.ts`
- `packages/core/src/config.ts`
- `packages/core/test/config.test.ts`
- `packages/core/test/validator.test.ts`
- `packages/core/test/resolver.test.ts`
- `packages/core/test/stencil.test.ts`

Files that should usually remain unchanged:

- `packages/core/src/parser.ts`
- `packages/core/src/storage.ts`
- `packages/core/src/collections.ts`
- `packages/core/src/context.ts`
- `packages/core/src/errors.ts`
- `packages/core/src/index.ts`

`index.ts` should only change if maintainers decide `PlaceholderDelimiters` or the new helper should be public. Recommended default: keep `placeholders.ts` internal.

---

## Step-by-Step Plan

### Step 1 — Reconfirm the baseline and isolate the remaining gap

Run the current package checks before editing.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected:

- Current suite is green.
- Resolver and validator still only operate on `{{...}}`.
- Existing facade config tests do not yet prove custom delimiter behavior.

Do not start implementation from a red baseline.

---

### Step 2 — Add a shared placeholder helper with safe regex construction

Create a single internal source of truth for placeholder token matching.

**File:** `packages/core/src/placeholders.ts`

Implement:

- `DEFAULT_PLACEHOLDER_DELIMITERS`
- `buildPlaceholderRegex(delimiters)`
- `extractPlaceholderTokens(body, delimiters)`
- private `escapeForRegExp(text)` helper

Behavior requirements:

- Regex construction must escape delimiter metacharacters correctly.
- Token extraction must trim whitespace inside delimiters.
- Repeated tokens should deduplicate naturally through `Set`.
- Matching should support delimiter pairs such as:
  - `{{` / `}}`
  - `[[` / `]]`
  - `<%` / `%>`

Implementation guidance:

- Prefer building one global regex from escaped delimiters.
- Use a non-greedy inner capture so arbitrary end delimiters are supported.
- Keep the helper pure and side-effect free.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected: new helper compiles; no runtime behavior changes yet.

---

### Step 3 — Add focused API-level tests for the placeholder helper first

Test the tokenizer independently before refactoring validator and resolver to use it.

**New or expanded test file:** recommended `packages/core/test/validator.test.ts` and `packages/core/test/resolver.test.ts`, or add a dedicated `packages/core/test/placeholders.test.ts` if maintainers want isolated helper coverage.

Minimum helper-level cases:

1. Extracts tokens with default delimiters.
2. Extracts tokens with custom delimiters such as `[[name]]`.
3. Trims whitespace inside custom delimiters.
4. Escapes regex metacharacters in delimiters correctly.
5. Returns an empty set when no matching tokens exist.
6. Ignores wrong delimiter pairs in the body instead of crashing.

Recommended validation command:

```bash
cd packages/core && npx vitest run test/validator.test.ts test/resolver.test.ts
```

Expected: helper coverage is in place before the downstream refactor lands.

---

### Step 4 — Refactor `validator.ts` to use shared delimiter-aware token extraction

Replace the hardcoded placeholder regex in validation logic.

**File:** `packages/core/src/validator.ts`

Implementation changes:

1. Remove the module-local `PLACEHOLDER_RE`.
2. Import `extractPlaceholderTokens` and default delimiters from `placeholders.ts`.
3. Add an optional `options` parameter to `validateTemplate(...)`.
4. Route V8 and V9 body-token checks through `extractPlaceholderTokens(body, delimiters)`.
5. Preserve all existing frontmatter validation rules and severities.

Important compatibility rules:

- V8 still ignores `$ctx.*` tokens.
- V9 still checks declared placeholders against extracted body tokens.
- Warning messages should reflect the active delimiter pair instead of always rendering `{{token}}`.

Recommended message rule:

- Build warning text from the active delimiter pair, for example:
  - `Body references undeclared placeholder: "[[unknown]]"`

This keeps validation diagnostics truthful under custom delimiter config.

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/validator.test.ts
```

Expected:

- All existing validator tests for default delimiters remain green.
- New custom-delimiter tests pass.

---

### Step 5 — Expand validator API-level tests for custom delimiter warnings

Now that validation uses the shared helper, add or update tests to lock the intended warning behavior.

**File:** `packages/core/test/validator.test.ts`

Add cases for:

1. Default delimiters still produce zero issues for the current happy path.
2. Custom delimiters mark templates valid when declared placeholders are used correctly.
3. Undeclared placeholder warnings work with custom delimiters.
4. Declared-but-unused warnings work with custom delimiters.
5. `$ctx.*` under custom delimiters is ignored by V8 as intended.
6. Bodies using the wrong delimiter pair under a custom config do not crash and produce the expected warning pattern.

Prefer direct `validateTemplate(template, { delimiters })` coverage here rather than facade-only coverage.

Validation:

```bash
cd packages/core && npx vitest run test/validator.test.ts
```

Expected: validator behavior is fully locked for both default and custom delimiter pairs.

---

### Step 6 — Refactor `resolver.ts` to use shared delimiter-aware replacement

Replace the hardcoded regex in the resolution pipeline.

**File:** `packages/core/src/resolver.ts`

Implementation changes:

1. Remove the module-local `PLACEHOLDER_REGEX`.
2. Import `buildPlaceholderRegex` and default delimiters from `placeholders.ts`.
3. Add an optional `options` parameter to `resolveTemplate(...)`.
4. Build the replacement regex from the active delimiter pair.
5. Keep current resolution priority unchanged:
   - explicit
   - context
   - default
   - unresolved

Behavior requirements:

- Whitespace trimming inside delimiters must still work.
- Repeated tokens must all be replaced.
- Unknown tokens must remain unchanged.
- `$ctx.*` detection must still happen after trimming the extracted token text.
- `unresolvedCount` must continue to count only declared placeholders that remain unresolved, not unknown raw body tokens.

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/resolver.test.ts
```

Expected:

- Existing resolver tests still pass for `{{...}}`.
- New custom-delimiter cases pass.

---

### Step 7 — Expand resolver API-level tests for custom delimiters and `$ctx.*`

Lock the resolver behavior directly before wiring it through `Stencil`.

**File:** `packages/core/test/resolver.test.ts`

Add cases for:

1. Custom delimiters resolve declared placeholders from explicit values.
2. Custom delimiters resolve defaults correctly.
3. Custom delimiters resolve `$ctx.*` values correctly.
4. Custom delimiters preserve unresolved declared placeholders unchanged in the body.
5. Custom delimiters leave unknown tokens unchanged.
6. Custom delimiters trim whitespace inside delimiters.
7. Regex-special delimiter pairs such as `[[` / `]]` work correctly.
8. Bodies using default delimiters while custom delimiters are active remain unchanged rather than partially matching.

Validation:

```bash
cd packages/core && npx vitest run test/resolver.test.ts
```

Expected: module-level resolution behavior is fully covered before facade wiring.

---

### Step 8 — Tighten config validation for delimiter definitions

Add the minimum config validation needed to make dynamic regex construction safe.

**File:** `packages/core/src/config.ts`

Implementation changes:

1. Extend config-field validation for `placeholder_start` and `placeholder_end`.
2. Reject:
   - empty string start delimiter
   - empty string end delimiter
   - identical start and end delimiters
3. Keep using `StencilConfigError` so existing error handling stays consistent.

Why this belongs in Epic E:

- Delimiters are inert data in Epic A.
- Once they drive regex construction, invalid values become runtime hazards.

Keep this intentionally narrow:

- no grammar parser
- no nested-placeholder rules
- no delimiter-length restrictions beyond non-empty strings

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/config.test.ts
```

Expected: invalid delimiter config now fails clearly and early.

---

### Step 9 — Add config API-level tests for delimiter validation

Prove the new delimiter constraints at the config-loader layer.

**File:** `packages/core/test/config.test.ts`

Add cases for:

1. Loads valid custom delimiters from project config.
2. Loads valid custom delimiters from global config.
3. Merges delimiter fields with normal precedence.
4. Throws `StencilConfigError` when `placeholder_start` is empty.
5. Throws `StencilConfigError` when `placeholder_end` is empty.
6. Throws `StencilConfigError` when start and end delimiters are identical.

Keep these tests filesystem-based, consistent with existing config tests.

Validation:

```bash
cd packages/core && npx vitest run test/config.test.ts
```

Expected: config safety net is in place before facade wiring depends on it.

---

### Step 10 — Wire runtime delimiter config through `Stencil`

Make the facade the automatic consumer of runtime delimiter config.

**File:** `packages/core/src/stencil.ts`

Required changes:

1. Add a small private helper to read the active delimiter pair from `this.runtimeConfig`.
2. Update `resolve()` to:
   - `await this.ensureRuntimeReady()`
   - call `resolveTemplate(template, input, { delimiters: ... })`
3. Update `validate()` to:
   - `await this.ensureRuntimeReady()`
   - call `validateTemplate(template, { delimiters: ... })`
4. Update `assertMutationIsValid()` to validate with active delimiters instead of defaults.

Important detail:

- `validate()` currently does not call `ensureRuntimeReady()`. That must change or custom delimiter config will never affect facade validation.

Behavior after this step:

- `Stencil.resolve()` uses project/global/runtime config delimiters automatically.
- `Stencil.validate()` reports undeclared/unused warnings against the active delimiter pair.
- `Stencil.create()`, `update()`, `copy()`, and `rename()` remain behaviorally additive but now produce correct placeholder warnings under custom delimiters.

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/stencil.test.ts
```

Expected: facade now honors configured delimiters without requiring caller-supplied options.

---

### Step 11 — Add end-to-end facade tests using real config files

Prove the feature through the public `Stencil` facade, not just module-level tests.

**File:** `packages/core/test/stencil.test.ts`

Add at least these facade scenarios:

1. Project config custom delimiters drive `resolve()`
   - write `.stencil/config.yaml` with `placeholder_start: '[['` and `placeholder_end: ']]'`
   - create template body using `[[entity]]`
   - resolve with explicit values
   - expect replacement in output

2. Project config custom delimiters drive `$ctx.*` resolution
   - same config
   - body contains `[[ $ctx.team_name ]]`
   - project config or runtime override supplies `custom_context.team_name`
   - expect resolved context output

3. Project config custom delimiters drive `validate()`
   - valid body with `[[entity]]` should not produce undeclared/unused warnings
   - wrong-delimiter body such as `{{entity}}` under `[[ ]]` config should produce the expected warning pattern rather than silently passing

4. Invalid delimiter config fails through facade initialization path
   - e.g. `placeholder_start: ''`
   - call `init()` or `resolve()`
   - expect `StencilConfigError`

5. Runtime config override delimiters take precedence over file-based delimiters
   - file config uses one pair
   - constructor `config` uses another pair
   - body uses override pair
   - expect facade to honor the runtime override

These tests satisfy the planning-note requirement for end-to-end facade coverage.

Validation:

```bash
cd packages/core && npx vitest run test/stencil.test.ts
```

Expected: the public facade proves config-aware resolution and validation with real config files.

---

### Step 12 — Run full regression validation and confirm compatibility

Once all edits are complete, run the full package validation.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected:

- Entire suite remains green.
- Existing default-delimiter tests still pass.
- New custom-delimiter tests pass at:
  - config loader level
  - validator API level
  - resolver API level
  - facade end-to-end level

If any existing `{{...}}` tests break, treat that as a compatibility regression and fix before closing the epic.

---

## Validation Matrix

### API-level validation

- `config.test.ts`
  - delimiter values load and merge correctly
  - invalid delimiter definitions throw typed config errors
- `validator.test.ts`
  - default-delimiter behavior preserved
  - undeclared/unused placeholder warnings work with custom delimiters
  - `$ctx.*` remains excluded from undeclared warnings
- `resolver.test.ts`
  - custom delimiters resolve explicit, context, and default values correctly
  - unresolved and unknown-token behavior remains stable

### End-to-end facade validation

- `stencil.test.ts`
  - `Stencil.resolve()` honors project/global/runtime delimiter config
  - `Stencil.validate()` honors project/global/runtime delimiter config
  - `$ctx.*` resolves under custom delimiters through real config files
  - invalid delimiter config fails through the facade with `StencilConfigError`

---

## Exit Criteria

Epic E is complete when all of the following are true:

- Placeholder delimiter config is functional runtime behavior, not type-only surface area.
- `validateTemplate()` and `resolveTemplate()` can operate with either default or custom delimiters.
- `Stencil.validate()` and `Stencil.resolve()` automatically apply runtime-configured delimiters.
- Mutation-time validation in `Stencil` stays aligned with the same delimiter rules.
- Invalid delimiter config fails clearly before unsafe regex behavior can occur.
- Default `{{` / `}}` behavior remains backward-compatible and fully covered by the existing suite.

---

## Suggested Implementation Order

1. `placeholders.ts`
2. helper-level tests
3. `validator.ts` + validator tests
4. `resolver.ts` + resolver tests
5. `config.ts` delimiter validation + config tests
6. `stencil.ts` runtime wiring
7. facade tests
8. full regression run

This sequencing keeps the work incremental and makes each step independently verifiable.
