# Plan: Epic D — Structured Core Error Model and Diagnostics

**Goal:** Introduce a consistent, adapter-safe core error model for `@stencil-pm/core` so consumers can branch on structured error types and metadata instead of parsing generic error strings.

**Scope boundary:** Treat parser, validator, resolver, storage, collections, facade mutation APIs, config loading, and global-directory discovery as already implemented. Do not re-plan those modules from scratch. Keep adapter UX, prompting, stderr formatting, and editor diagnostics out of scope unless Epic D requires a new core-facing contract. Prefer additive changes that preserve the current passing suite.

**Important repo-specific note:** On the current branch, Epic A, Epic B, and Epic C are already implemented. `packages/core/src/config.ts` already has `StencilConfigError`, `packages/core/src/parser.ts` already has `ParseError` and `TemplateNotFoundError`, and the facade/storage/collections layers still throw many plain `Error` instances. Epic D should unify and normalize that mixed state rather than replace working flows wholesale.

**Required by planning notes:**

- Keep foundational module work out of scope.
- Keep adapter responsibilities out of scope unless a new core contract is required.
- Prefer additive changes that keep the current suite green.
- Include both API-level tests and end-to-end facade tests.

**Prerequisites:** Confirm the current `packages/core` baseline is green before editing.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero type errors and the current full Vitest suite passes before Epic D work begins.

**Per-step validation default:**

```bash
cd packages/core && npm run typecheck
```

**Recommended targeted test command during implementation:**

```bash
cd packages/core && npx vitest run test/parser.test.ts test/config.test.ts test/storage.test.ts test/collections.test.ts test/stencil.test.ts
```

**Required final validation:**

```bash
cd packages/core && npm run typecheck && npm test
```

---

## Current Repo State

- `docs/stencil-architecture.md` defines a base `StencilError`, structured `StencilErrorCode`, and a rule that core should throw structured errors and not silently swallow failures.
- `packages/core/src/parser.ts` already exposes parser-specific errors:
  - `TemplateNotFoundError`
  - `ParseError`
- `packages/core/src/config.ts` already exposes `StencilConfigError`, but it is separate from parser errors and not aligned to a shared base type.
- `packages/core/src/stencil.ts` still throws generic `Error` for:
  - template-not-found cases
  - validation failures on `create`, `resolve`, `update`, `copy`, and `rename`
  - mutation collisions
  - global-only mutation rejections
  - post-save invariant failures
- `packages/core/src/storage.ts` still throws generic `Error` for rename collisions and currently suppresses parse failures during directory scans by returning `null` from `parseTemplateFiles(...)`.
- `packages/core/src/collections.ts` still throws generic `Error` for missing templates and global-only move attempts.
- `Stencil.validate()` currently returns a synthetic `ValidationResult` for missing templates instead of throwing, so Epic D must preserve that API behavior unless the maintainers explicitly want a breaking change.

This means the real work is contract unification and throw-site normalization across existing flows, with particular care around preserving non-error return APIs such as `get()` and `validate()`.

---

## Target Behavior

After this epic:

- All core-raised hard failures that adapters need to branch on are instances of a shared `StencilError` family.
- Error instances carry stable machine-actionable metadata, not just message strings.
- Existing parser and config errors are either migrated onto the shared base class or wrapped so they expose the same contract.
- Validation-driven failures expose structured validation issues.
- Name-collision failures are distinct from not-found and validation failures.
- Storage read/write/rename failures are distinguishable from domain validation failures.
- Parsing failures encountered during template discovery are no longer silently discarded.
- The public API exports the shared error types and codes.
- Existing successful behavior remains unchanged.
- The epic includes:
  - API-level tests for the error classes and normalized throw sites
  - end-to-end facade tests that prove real `Stencil` flows throw the right typed failures with the right metadata

---

## Design Decisions To Lock Before Editing

### 1. Use a shared base class and stable error codes

Epic D should align with the architecture’s direction:

- `StencilError`
- `StencilErrorCode`

Do not rely only on subclass names. Adapters should be able to branch on:

- `instanceof StencilError`
- `error.code`
- structured fields such as `templateName`, `filePath`, `issues`, and `operation`

Recommended rule:

- subclasses are for ergonomics and readability
- `code` is the stable machine contract

### 2. Keep existing non-throwing APIs non-throwing where that is already the facade contract

Do not turn these into throwing APIs in Epic D:

- `Stencil.get(name)` should still return `null` on miss
- `Stencil.delete(name)` should still return `false` on miss
- `Stencil.validate(name)` should still return a `ValidationResult`, including for a missing template

Epic D should normalize errors for operations that already fail via exceptions, not redesign every facade return contract.

### 3. Validation failures need a first-class error type

The current facade turns validation issues into generic strings like:

- `Cannot create template: ...`
- `Template "<name>" has validation errors: ...`

Replace those with a typed validation error that carries:

- `templateName` when known
- `operation`
- the full `ValidationResult` or at minimum the error-severity `issues`

Recommended direction:

- keep warnings non-blocking
- block only on `severity === 'error'`
- preserve the human-readable summary message

### 4. Distinguish domain conflicts from lower-level I/O failures

Do not collapse these into one bucket:

- a target template name already exists
- a template exists only in global scope and cannot be mutated
- `rename()` or `writeFile()` failed because the filesystem operation failed

Recommended split:

- `TemplateConflictError` for domain-level name and scope conflicts
- `StorageOperationError` for lower-level read/write/delete/rename failures

### 5. Preserve original causes whenever possible

When wrapping runtime errors from Node APIs or YAML parsing:

- pass `cause` where the runtime supports it
- keep file path and operation in structured fields

This matters for adapters, logs, and future debugging without leaking low-level exceptions as the primary contract.

### 6. Do not silently suppress template parse failures during list/search flows

Current `storage.ts` behavior drops parse failures during directory scans:

- `parseTemplateFiles(...)` catches and returns `null`

That conflicts with the architecture’s error-handling rule and makes diagnostics impossible. Epic D should replace silent suppression with a typed failure strategy.

Recommended behavior for this epic:

- `listTemplates()` and search-backed flows should fail with a typed parse/storage error when a discovered template cannot be parsed
- `getTemplate(name)` should continue returning `null` only when no file exists, not when a file exists but is malformed

This is the highest-impact behavioral change in Epic D and should be test-covered explicitly.

### 7. Avoid spreading error logic into adapters or changing the storage interface unless needed

Prefer:

- shared errors in `packages/core/src/errors.ts`
- throw-site normalization inside existing core modules

Avoid:

- adapter-specific formatting hooks
- broad interface redesign of `StorageProvider`

Only widen types or helper method signatures when it directly improves the core error contract.

---

## Proposed Public Contract

Recommended new module:

- `packages/core/src/errors.ts`

Recommended exports:

```ts
export enum StencilErrorCode {
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  FRONTMATTER_MISSING = 'FRONTMATTER_MISSING',
  FRONTMATTER_INVALID_YAML = 'FRONTMATTER_INVALID_YAML',
  FRONTMATTER_SCHEMA_ERROR = 'FRONTMATTER_SCHEMA_ERROR',
  TEMPLATE_VALIDATION_FAILED = 'TEMPLATE_VALIDATION_FAILED',
  TEMPLATE_ALREADY_EXISTS = 'TEMPLATE_ALREADY_EXISTS',
  TEMPLATE_MUTATION_NOT_ALLOWED = 'TEMPLATE_MUTATION_NOT_ALLOWED',
  STORAGE_READ_ERROR = 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR = 'STORAGE_WRITE_ERROR',
  STORAGE_DELETE_ERROR = 'STORAGE_DELETE_ERROR',
  STORAGE_RENAME_ERROR = 'STORAGE_RENAME_ERROR',
  CONFIG_INVALID = 'CONFIG_INVALID',
}

export class StencilError extends Error {
  readonly code: StencilErrorCode;
  readonly details?: Record<string, unknown>;
}

export class TemplateNotFoundError extends StencilError {
  readonly templateName?: string;
  readonly filePath?: string;
}

export class ParseError extends StencilError {
  readonly filePath?: string;
  readonly line?: number;
}

export class TemplateValidationError extends StencilError {
  readonly templateName?: string;
  readonly operation: string;
  readonly issues: ValidationIssue[];
}

export class TemplateConflictError extends StencilError {
  readonly templateName?: string;
  readonly targetName?: string;
  readonly operation: string;
}

export class StorageOperationError extends StencilError {
  readonly operation: string;
  readonly filePath?: string;
  readonly templateName?: string;
}

export class StencilConfigError extends StencilError {
  readonly filePath: string;
  readonly field?: string;
}
```

Notes:

- Keep the existing exported class names `ParseError`, `TemplateNotFoundError`, and `StencilConfigError` to minimize API churn.
- It is acceptable if the final enum includes a slightly smaller or larger code set than the draft above, as long as:
  - codes are stable
  - not-found, validation, config, conflict, and storage failures are distinguishable

---

## Files Expected To Change

- `packages/core/src/errors.ts` (new)
- `packages/core/src/parser.ts`
- `packages/core/src/config.ts`
- `packages/core/src/storage.ts`
- `packages/core/src/collections.ts`
- `packages/core/src/stencil.ts`
- `packages/core/src/index.ts`
- `packages/core/test/parser.test.ts`
- `packages/core/test/config.test.ts`
- `packages/core/test/storage.test.ts`
- `packages/core/test/collections.test.ts`
- `packages/core/test/stencil.test.ts`

Files that should usually remain unchanged:

- `packages/core/src/validator.ts`
- `packages/core/src/resolver.ts`
- `packages/core/src/context.ts`
- `packages/core/src/paths.ts`

Potentially optional change:

- `packages/core/src/types.ts`

Only touch `types.ts` if you decide to add a shared exported `ErrorDetails` helper type or similar. It is not required for Epic D.

---

## Step-by-Step Plan

### Step 1 — Reconfirm the baseline and isolate current error behavior

Run the package checks before editing.

```bash
cd packages/core && npm run typecheck && npm test
```

Then inspect current error assertions so the migration does not accidentally break intended semantics.

```bash
cd packages/core && rg -n "toThrow|StencilConfigError|ParseError|TemplateNotFoundError|throw new Error" src test
```

Capture:

- which tests assert only message fragments
- which tests already assert concrete classes
- which call sites still raise plain `Error`

Validation:

- baseline suite still passes unchanged
- you have a concrete list of throw sites to normalize

Do not edit code until this inventory is complete.

---

### Step 2 — Add the shared error foundation in `errors.ts`

Create the central error module first so every later step can migrate onto it incrementally.

**File:** `packages/core/src/errors.ts`

Implement:

- `StencilErrorCode`
- `StencilError`
- concrete subclasses needed by current flows:
  - `TemplateValidationError`
  - `TemplateConflictError`
  - `StorageOperationError`

Design requirements:

- `StencilError` must extend `Error`
- set `name` correctly for each subclass
- include `code`
- include structured metadata fields directly on subclasses
- preserve optional `cause`
- keep message strings human-readable

Recommended implementation pattern:

```ts
export class StencilError extends Error {
  constructor(
    message: string,
    public readonly code: StencilErrorCode,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
```

If `ErrorOptions` support causes awkward compatibility issues in the current TS config, use a fallback pattern that still attaches `cause` manually.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected:

- no behavior changes yet
- the new module compiles cleanly

---

### Step 3 — Migrate parser errors onto the shared base without changing parser semantics

Parser errors already exist and are part of the public API. Convert them carefully.

**File:** `packages/core/src/parser.ts`

Implement:

- make `TemplateNotFoundError` extend `StencilError`
- make `ParseError` extend `StencilError`
- assign stable codes:
  - missing file -> `TEMPLATE_NOT_FOUND`
  - missing opening/closing frontmatter -> `FRONTMATTER_MISSING`
  - YAML parser error -> `FRONTMATTER_INVALID_YAML`
  - invalid shape such as non-mapping frontmatter or invalid placeholder entry -> `FRONTMATTER_SCHEMA_ERROR`
- add structured metadata:
  - `filePath`
  - `line` where available

Important constraint:

- keep `parseTemplate(...)` behavior unchanged apart from richer error instances
- do not redesign parsing logic or validation logic in this epic

Update parser tests to assert:

- `instanceof StencilError`
- expected `code`
- expected `line` where relevant

Validation:

```bash
cd packages/core && npx vitest run test/parser.test.ts
```

Expected:

- existing parser behavior still passes
- class and code assertions are explicit

---

### Step 4 — Rebase `StencilConfigError` onto the shared error model

Config already has a typed error, so this is a normalization step rather than a redesign.

**File:** `packages/core/src/config.ts`

Implement:

- make `StencilConfigError` extend `StencilError`
- assign `CONFIG_INVALID`
- preserve existing fields:
  - `filePath`
  - `field`
- preserve current human-readable messages
- preserve parser-caused context via `cause` when possible

Do not broaden config scope here. Keep config loading semantics unchanged.

Update config tests to assert:

- `instanceof StencilError`
- `instanceof StencilConfigError`
- `code === StencilErrorCode.CONFIG_INVALID`
- `filePath` and `field` values when applicable

Validation:

```bash
cd packages/core && npx vitest run test/config.test.ts
```

Expected:

- current config loader behavior still passes
- config failures now align with the shared base contract

---

### Step 5 — Normalize facade validation failures into `TemplateValidationError`

The facade currently converts validation failures into plain message strings. This is the most important adapter-facing improvement.

**File:** `packages/core/src/stencil.ts`

Replace generic validation throws in:

- `resolve(...)`
- `create(...)`
- `update(...)`
- `copy(...)`
- `rename(...)`
- `assertMutationIsValid(...)`

Recommended implementation:

- centralize validation failure creation in one helper
- carry:
  - `templateName` when known
  - `operation`
  - `issues`
- build message summaries from error-severity issues only

Recommended helper shape:

```ts
private throwValidationError(
  operation: string,
  template: Template,
  validation: ValidationResult,
): never
```

Important constraints:

- do not change which operations block on validation
- warnings remain non-blocking
- `Stencil.validate(name)` remains non-throwing and still returns `ValidationResult`

Update facade tests to assert:

- invalid `create()` throws `TemplateValidationError`
- invalid `update()` throws `TemplateValidationError`
- invalid `copy()` throws `TemplateValidationError`
- `resolve()` against a stored invalid template throws `TemplateValidationError`
- `issues` are available to the caller

Validation:

```bash
cd packages/core && npx vitest run test/stencil.test.ts
```

Expected:

- validation flows still fail in the same scenarios
- failure type and metadata are now explicit

---

### Step 6 — Normalize not-found and conflict flows in the facade

Once validation failures are typed, normalize the rest of the domain-level facade failures.

**File:** `packages/core/src/stencil.ts`

Replace generic `Error` throws for:

- missing source template in `resolve`, `update`, `copy`, `rename`
- same-name invalid input in `copy` and `rename`
- project/global collision handling in `copy` and `rename`
- global-only mutation rejections in `update` and `rename`
- post-save invariant failure in `requireProjectTemplate(...)`

Recommended mapping:

- missing template -> `TemplateNotFoundError`
- already-existing target -> `TemplateConflictError` with `TEMPLATE_ALREADY_EXISTS`
- global-only target/source mutation rejection -> `TemplateConflictError` with a distinct code such as `TEMPLATE_MUTATION_NOT_ALLOWED`
- post-save invariant failure -> `StorageOperationError` or `TemplateNotFoundError`

Make the metadata actionable:

- `templateName`
- `targetName`
- `operation`
- `sourceScope` or `targetScope` when helpful

Update `test/stencil.test.ts` so collision and not-found cases assert types and codes, not just message text.

Validation:

```bash
cd packages/core && npx vitest run test/stencil.test.ts
```

Expected:

- all existing failure scenarios still fail
- adapters can now distinguish not-found, invalid-input, and conflict cases

---

### Step 7 — Normalize storage-layer operational errors and remove silent parse suppression

This is the step most likely to surface previously hidden failures, so keep it isolated.

**File:** `packages/core/src/storage.ts`

Implement two changes.

1. Wrap filesystem operation failures in `StorageOperationError`

Apply to:

- read failures when loading a known template path
- write failures in `saveTemplate(...)`
- delete failures in `deleteTemplate(...)`
- rename/write/remove failures in `renameProjectTemplate(...)`

Include:

- `operation`
- `filePath`
- `templateName` when known
- original `cause`

Do not wrap ordinary “not found” probes that are part of control flow such as `findTemplatePath(...)` returning `null`.

2. Stop swallowing parse failures during directory scans

Current behavior in `parseTemplateFiles(...)` catches all parse errors and returns `null`. Replace that with a typed failure path.

Recommended approach:

- if reading/parsing a discovered `.md` file fails, let the typed error propagate
- if needed, wrap non-`StencilError` failures in `StorageOperationError`

This means `listTemplates()`, `search()`, and collection listing will now surface malformed template files instead of hiding them.

Add API-level storage tests for:

- `saveTemplate()` operational failure wrapping where feasible
- `renameProjectTemplate()` collision error typing
- malformed file discovered by `listTemplates()` now throws a typed parse/storage error instead of being skipped

Validation:

```bash
cd packages/core && npx vitest run test/storage.test.ts
```

Expected:

- healthy storage flows still pass
- malformed discovered templates fail loudly and predictably

---

### Step 8 — Normalize collection-manager failures onto the shared domain errors

Collections is a thin orchestration layer and should stop emitting plain `Error`.

**File:** `packages/core/src/collections.ts`

Replace generic throws in `moveToCollection(...)` with:

- `TemplateNotFoundError` when the template is not visible at all
- `TemplateConflictError` or `TemplateMutationNotAllowed`-style error when the template exists only in the global directory and cannot be moved

Preserve current successful behavior:

- project template moves still work
- global templates remain unaffected by collection removal

Update collection tests to assert typed failures for:

- missing template move
- global-only template move rejection

Validation:

```bash
cd packages/core && npx vitest run test/collections.test.ts
```

Expected:

- collections behavior is unchanged except for stronger error contracts

---

### Step 9 — Export the unified error surface from the public API

Make the new contract available to adapters and tests.

**File:** `packages/core/src/index.ts`

Add:

```ts
export * from './errors.js';
```

Then confirm legacy exports still work:

- `ParseError`
- `TemplateNotFoundError`
- `StencilConfigError`

If those classes live in their original modules and are re-exported there, ensure there is no duplicate or conflicting export shape. It is acceptable to define subclasses in `errors.ts` and re-export from parser/config modules, or to define them centrally and import them into parser/config.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected:

- consumers can import all shared error contracts from the package root

---

### Step 10 — Add focused API-level tests for the new error contracts

Before full end-to-end verification, add direct tests that lock the new contract down.

Recommended test additions:

- `test/parser.test.ts`
  - parse errors expose `code`, `filePath`, and `line`
- `test/config.test.ts`
  - config errors expose `code`, `filePath`, and `field`
- `test/storage.test.ts`
  - malformed discovered template is not silently skipped
  - rename collision produces typed conflict/storage behavior
- `test/collections.test.ts`
  - move errors are typed

If the test suite benefits from a dedicated file such as `test/errors.test.ts`, that is acceptable, but only if it adds clear value. Prefer keeping behavior tests near the affected modules.

Validation:

```bash
cd packages/core && npx vitest run test/parser.test.ts test/config.test.ts test/storage.test.ts test/collections.test.ts
```

Expected:

- module-level contracts are locked before final facade integration checks

---

### Step 11 — Add end-to-end facade tests that exercise real adapter-facing error flows

Epic D must include facade-level tests, not only module-level tests.

**File:** `packages/core/test/stencil.test.ts`

Add or update end-to-end tests that go through `Stencil` itself:

1. `resolve()` on a missing template throws `TemplateNotFoundError`
2. `create()` with invalid frontmatter throws `TemplateValidationError` and exposes `issues`
3. `update()` of a global-only template throws a typed mutation/conflict error
4. `copy()` into an existing project target throws a typed conflict error
5. `rename()` into an existing global target throws a typed mutation/conflict error
6. `search()` or `list()` surfaces a malformed discovered template as a typed parse/storage failure

At least one multi-step facade scenario should prove that successful workflows still behave normally around the new error system:

- create valid template
- update it
- copy it
- rename it
- resolve it successfully

This ensures Epic D does not accidentally break Epic C behavior while refactoring error flows.

Validation:

```bash
cd packages/core && npx vitest run test/stencil.test.ts
```

Expected:

- adapter-facing error contracts are now covered through the real public facade

---

### Step 12 — Run the full package validation and review for accidental behavior drift

Run the final package checks.

```bash
cd packages/core && npm run typecheck && npm test
```

Then do a short audit:

- confirm no remaining `throw new Error(` sites exist in core error-producing paths that Epic D targeted
- confirm `listTemplates()` and search no longer suppress malformed template files
- confirm `Stencil.validate()` still returns `ValidationResult` rather than throwing
- confirm public exports include the shared error contracts

Suggested audit command:

```bash
cd packages/core && rg -n "throw new Error" src
```

Expected:

- any remaining plain `Error` uses are intentional and justified, or there are none in Epic D scope

---

## Validation Matrix

Use this matrix while implementing to confirm each major contract is covered.

| Area        | Scenario                                       | Expected result                                                     |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Parser      | Missing frontmatter                            | `ParseError` with `FRONTMATTER_MISSING`                             |
| Parser      | Invalid frontmatter YAML                       | `ParseError` with `FRONTMATTER_INVALID_YAML` and `line`             |
| Config      | Invalid config schema                          | `StencilConfigError` with `CONFIG_INVALID`, `filePath`, and `field` |
| Facade      | Missing template in `resolve()`                | `TemplateNotFoundError` with template name                          |
| Facade      | Invalid `create()`/`update()`/`copy()` payload | `TemplateValidationError` with issues                               |
| Facade      | Copy/rename collision                          | `TemplateConflictError` with target metadata                        |
| Facade      | Update/rename of global-only template          | typed mutation/conflict error                                       |
| Storage     | Malformed template during list/search          | typed parse/storage failure, not silent skip                        |
| Collections | Move missing/global-only template              | typed not-found/conflict error                                      |
| Happy path  | valid create/update/copy/rename/resolve flow   | unchanged success behavior                                          |

---

## Risks And Guardrails

### Risk 1 — Breaking existing tests that assert raw messages

Guardrail:

- preserve current human-readable message text as much as possible
- update tests to assert class and code first, message second

### Risk 2 — Over-wrapping and losing the original failure context

Guardrail:

- keep `cause`
- include `filePath`, `templateName`, and `operation`
- only wrap when it improves the public contract

### Risk 3 — Changing facade semantics accidentally

Guardrail:

- keep `get()`, `delete()`, and `validate()` contracts unchanged
- confine throwing changes to flows that already throw

### Risk 4 — Surfacing malformed template files may break existing list/search expectations

Guardrail:

- make the behavior change explicit in tests and release notes
- keep the change limited to true malformed discovered template files
- do not change ordinary “not found” behavior

### Risk 5 — Duplicating error definitions across modules

Guardrail:

- centralize shared types in `errors.ts`
- have parser/config either import shared classes or extend them consistently

---

## Exit Criteria

Epic D is complete when all of the following are true:

- `@stencil-pm/core` exposes a shared `StencilError`-based contract.
- Not-found, validation, config, conflict, and storage failures are distinguishable without message parsing.
- Parser and config errors align with the shared base model.
- Facade mutation and resolution flows no longer throw generic `Error` for domain failures.
- Storage no longer silently suppresses malformed templates discovered during scans.
- API-level tests and end-to-end facade tests cover the new error contracts.
- `cd packages/core && npm run typecheck && npm test` passes.
