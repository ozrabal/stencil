# Plan: Epic A — Config System and Runtime Option Application

**Goal:** Implement runtime config loading and application for `@stencil-pm/core` so `StencilConfig` and `StencilOptions.config` become real behavior rather than inert types. The outcome must load project/global config files, merge them predictably, inject `custom_context` into runtime context resolution, honor `default_collection` during template creation, and fail clearly on malformed or invalid config.

**Scope boundary:** This plan assumes parser, validator, resolver, storage, collections, and the existing facade are already implemented and passing. Do not re-plan those modules from scratch. Do not implement global directory auto-discovery here. Do not make parser/validator/resolver delimiter-aware here; load delimiter values into runtime config only, and defer placeholder-pipeline behavior to Epic E.

**Prerequisites:** Epic 8 facade work is complete and the current core baseline is green.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero type errors and the current full test suite passes before any edits.

**Per-step validation default:**

```bash
cd packages/core && npm run typecheck
```

**Required final validation:**

```bash
cd packages/core && npm test
```

---

## Current Repo State

- `packages/core/src/types.ts` defines `StencilConfig` and `StencilOptions.config`, but runtime code does not use either.
- `packages/core/src/stencil.ts` constructs storage/context/collections immediately and never loads `.stencil/config.yaml` or `<globalDir>/config.yaml`.
- `packages/core/src/context.ts` has built-in providers only; there is no provider for config-backed `custom_context`.
- `packages/core/src/resolver.ts`, `parser.ts`, and `validator.ts` still hardcode `{{` / `}}`; that work belongs to Epic E, not this plan.
- `packages/core/src/storage.ts` already supports an explicit `globalDir`; this epic should consume that capability for config precedence, not redesign storage.

---

## Target Behavior

After this epic:

- `Stencil` resolves a runtime config from:
  - built-in defaults
  - optional global config file at `<globalDir>/config.yaml`
  - optional project config file at `<projectDir>/.stencil/config.yaml`
  - optional constructor overrides from `StencilOptions.config`
- Precedence is additive and predictable:
  - defaults < global file < project file < runtime option overrides
- YAML snake_case keys are accepted and normalized into the camelCase `StencilConfig` shape.
- `custom_context` becomes real `$ctx.*` runtime data via a core context provider.
- `default_collection` is applied in `Stencil.create()` when the caller omits `collection`.
- Invalid config fails with typed, actionable errors that include which file failed.
- API-level tests cover the loader/merge behavior.
- End-to-end facade tests cover `Stencil.create()` and `Stencil.resolve()` with real config files.

---

## Design Decisions To Lock Before Editing

### 1. Keep config loading stateless and filesystem-based

`config.ts` should remain a pure loader/merger module. It should not depend on `Stencil`, `ContextEngine`, or storage internals.

### 2. Merge semantics must be field-aware, not just shallow object replacement

- Scalar fields:
  - `version`
  - `defaultCollection`
  - `placeholderStart`
  - `placeholderEnd`
  - Last writer wins according to precedence.
- Object field:
  - `customContext`
  - Merge by key so project config extends global config instead of replacing it wholesale.
  - `StencilOptions.config.customContext` should override both file layers key-by-key.

### 3. Normalize external config into the existing internal type

Supported YAML keys:

- `version`
- `default_collection`
- `custom_context`
- `placeholder_start`
- `placeholder_end`

Internal result should be a complete `StencilConfig` using camelCase names.

### 4. Treat `null` in YAML as “unset”

The docs show `default_collection: null`. Normalize `null` to `undefined` internally instead of preserving `null` in `StencilConfig`.

### 5. Do not apply delimiter behavior yet

This epic should load and preserve `placeholderStart` / `placeholderEnd` in runtime config, but should not change resolver/parser/validator token logic yet. That keeps scope aligned with the gap epics and avoids mixing Epic A with Epic E.

### 6. Avoid async work in the constructor body

`Stencil` is currently constructed synchronously. Keep that API. Add an internal lazy runtime-initialization path that loads config once and caches the resolved result for later async methods.

---

## Files Expected To Change

- `packages/core/src/config.ts` (new)
- `packages/core/src/stencil.ts`
- `packages/core/src/context.ts`
- `packages/core/src/types.ts`
- `packages/core/src/index.ts`
- `packages/core/test/config.test.ts` (new)
- `packages/core/test/stencil.test.ts`
- Optional: `packages/core/test/context.test.ts` if the new provider is tested there instead of only through facade tests

---

## Step-by-Step Plan

### Step 1 — Reconfirm baseline and isolate scope

Run the existing baseline and confirm no unrelated failures exist before introducing config behavior.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected:

- Current suite passes unchanged.
- No config-specific tests exist yet.

Do not start implementation until the baseline is green.

---

### Step 2 — Add the config runtime contract to the public surface

Clarify the runtime contract in `types.ts` before wiring behavior.

**File:** `packages/core/src/types.ts`

Implement:

- Keep `StencilConfig` as the normalized internal/public shape:
  - `version: number`
  - `defaultCollection?: string`
  - `customContext?: Record<string, string>`
  - `placeholderStart: string`
  - `placeholderEnd: string`
- Keep `StencilOptions.config?: Partial<StencilConfig>` as runtime override input.
- If needed for clarity, add a narrow internal helper type in `config.ts` rather than expanding public types with YAML-specific snake_case variants.

Why this step first:

- It fixes the contract the loader will produce.
- It prevents config parsing code from inventing ad hoc shapes.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected: no type errors and no runtime behavior changes yet.

---

### Step 3 — Add `config.ts` with file loading, normalization, merge, and typed errors

Build the standalone config module.

**File:** `packages/core/src/config.ts`

Implement these exports:

- `loadStencilConfig(projectStencilDir: string, globalDir?: string, runtimeOverrides?: Partial<StencilConfig>): Promise<StencilConfig>`
- `mergeStencilConfig(...configs: Array<Partial<StencilConfig> | undefined>): StencilConfig`
- `StencilConfigError extends Error`

Loader responsibilities:

1. Start from built-in defaults:
   - `version: 1`
   - `placeholderStart: '{{'`
   - `placeholderEnd: '}}'`
2. Read `<globalDir>/config.yaml` when `globalDir` is provided.
3. Read `<projectStencilDir>/config.yaml`.
4. Parse YAML using the existing `yaml` dependency.
5. Normalize snake_case keys into camelCase.
6. Validate value types:
   - `version` must be a number
   - `default_collection` must be a string or null
   - `custom_context` must be a mapping of string keys to string values
   - `placeholder_start` / `placeholder_end` must be strings
7. Merge in precedence order:
   - defaults
   - global file
   - project file
   - `runtimeOverrides`
8. Return a complete `StencilConfig`.

Error behavior:

- Malformed YAML: throw `StencilConfigError` with the file path and parser message.
- Valid YAML but wrong schema: throw `StencilConfigError` with the file path and offending field name.
- Missing config file: not an error; treat as absent.

Implementation notes:

- Keep parsing helpers private:
  - `readConfigFile`
  - `normalizeRawConfig`
  - `validateConfigShape`
- Merge `customContext` by object spread rather than replacement.
- Treat unknown keys as ignored for now unless they create ambiguity. This is the lowest-risk additive behavior and avoids unnecessary breakage.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected: new module compiles; no facade behavior changed yet.

---

### Step 4 — Add API-level tests for config loading and merge semantics

Cover the new module directly before wiring it into `Stencil`.

**File:** `packages/core/test/config.test.ts`

Add focused tests for:

1. Loads defaults when no config files exist.
2. Loads only project config from `.stencil/config.yaml`.
3. Loads only global config from `<globalDir>/config.yaml`.
4. Merges global and project config with project precedence.
5. Merges `custom_context` by key instead of replacing the entire object.
6. Applies `StencilOptions.config` overrides after file-based config.
7. Normalizes snake_case YAML keys to camelCase output.
8. Treats `default_collection: null` as `undefined`.
9. Throws `StencilConfigError` on malformed YAML.
10. Throws `StencilConfigError` on invalid schema types.

Use real temporary directories and real config files. Do not mock `fs`.

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npm test -- config.test.ts
```

Expected:

- The new API-level suite passes.
- No facade tests need updates yet.

---

### Step 5 — Add a config-backed context provider

Make `custom_context` available to the existing context engine without special cases inside `resolve()`.

**File:** `packages/core/src/context.ts`

Add one small provider:

- `StaticContextProvider` or `ConfigContextProvider`

Recommended shape:

- Constructor accepts `Record<string, string>`
- `name` is stable, e.g. `'Config'`
- `resolve()` returns that record

Why this approach:

- It preserves the current `ContextEngine` contract.
- It keeps merge precedence explicit through provider registration order.
- It avoids branching inside `resolveTemplate`.

Do not change built-in providers in this epic unless a strictly necessary compile-time adjustment appears. The main goal here is config-driven context injection, not a broader context-engine redesign.

Validation:

```bash
cd packages/core && npm run typecheck
```

Optional focused validation if you add direct provider tests:

```bash
cd packages/core && npm test -- context.test.ts
```

---

### Step 6 — Wire lazy runtime config loading into `Stencil`

Make the facade load config once and reuse it across operations.

**File:** `packages/core/src/stencil.ts`

Refactor the constructor/runtime flow as follows:

1. Keep constructor synchronous.
2. Add private state such as:
   - `private readonly configOverrides?: Partial<StencilConfig>`
   - `private runtimeConfig?: StencilConfig`
   - `private runtimeInitPromise?: Promise<void>`
3. Add a private method, e.g. `ensureRuntimeReady(): Promise<void>`, that:
   - loads config through `loadStencilConfig(this.stencilDir, options.globalDir, options.config)`
   - stores the resolved config
   - registers the config-backed provider when `customContext` is present
   - does this only once
4. Register built-in providers first, config provider after built-ins, adapter-provided providers last.

Registration order must be:

1. `SystemContextProvider`
2. `GitContextProvider`
3. `ProjectContextProvider`
4. config-backed provider from `customContext`
5. `options.contextProviders`

Why this order:

- Config context should override built-ins on collision.
- Adapter providers should still override config values if an adapter intentionally supplies a different value.

Expose config:

- Prefer adding `readonly config` or a private `runtimeConfig` plus an internal getter.
- If you expose it publicly, make it read-only and normalized.
- If you keep it private, tests can validate behavior through facade methods rather than direct field assertions.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected: facade still compiles; no behavior verified yet.

---

### Step 7 — Apply runtime config in `init()`, `create()`, and `resolve()`

Now make the config affect actual facade behavior.

**File:** `packages/core/src/stencil.ts`

Implement the runtime effects in this order:

1. `init()`
   - Keep directory creation behavior unchanged.
   - Optionally call `ensureRuntimeReady()` so config errors surface during explicit initialization.
   - Do not require config files to exist.
2. `create()`
   - Call `ensureRuntimeReady()` before building the template.
   - If `collection` is omitted and `runtimeConfig.defaultCollection` is set, use that value.
   - If `collection` is explicitly passed, it must win over config.
3. `resolve()`
   - Call `ensureRuntimeReady()` before resolving context.
   - Let the registered config provider contribute `customContext` keys to `$ctx.*` resolution.
4. `list()`, `get()`, `delete()`, `validate()`, and `search()`
   - These methods can remain behaviorally unchanged.
   - It is acceptable to leave them config-agnostic in this epic unless you choose to centralize initialization for consistency.

Important restraint:

- Do not add delimiter-sensitive parsing or resolution logic here.
- Config should influence `create()` and `$ctx.*` resolution now; delimiter behavior waits for Epic E.

Validation:

```bash
cd packages/core && npm run typecheck
```

---

### Step 8 — Export the new config surface

Make the config module available to package consumers and tests.

**File:** `packages/core/src/index.ts`

Add:

```typescript
export * from './config.js';
```

Why:

- Keeps the loader and `StencilConfigError` available for adapters and direct tests.
- Matches the current package pattern of re-exporting core modules.

Validation:

```bash
cd packages/core && npm run typecheck
```

---

### Step 9 — Extend facade integration tests for config-driven behavior

Add end-to-end facade coverage using real temp directories and real config files.

**File:** `packages/core/test/stencil.test.ts`

Add tests for:

1. `create()` uses `default_collection` from project config when `collection` argument is omitted.
2. Explicit `collection` argument overrides `default_collection`.
3. `resolve()` injects `custom_context` values as `$ctx.*`.
4. Project config overrides global config for `default_collection`.
5. Project config extends global `custom_context` instead of replacing it.
6. `StencilOptions.config` overrides file-based config.
7. Missing config files do not break existing facade operations.
8. Invalid project config causes a typed failure when runtime initialization occurs.

Required end-to-end test shape:

```text
write config file(s)
→ construct Stencil
→ init()
→ create() without collection
→ get() or list() confirms resolved collection
→ create/resolve template using {{$ctx.some_key}}
→ assert resolvedBody uses config-backed context
```

Keep these as facade tests, not unit tests against private internals.

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npm test -- stencil.test.ts
```

Expected:

- API-level config tests pass.
- Facade tests prove runtime application, not just parsing.

---

### Step 10 — Run the full suite and check for regressions

Run the entire core validation set once the targeted tests are green.

```bash
cd packages/core && npm test
```

Expected:

- Existing parser/validator/resolver/storage/collections/facade tests remain green.
- New config tests pass.
- No unrelated behavior changes appear.

If failures occur:

- Re-check provider registration order.
- Re-check `customContext` merge semantics.
- Re-check that `defaultCollection` applies only when the `create()` call omits `collection`.
- Re-check that config loading is not accidentally repeated, causing duplicated provider registration.

---

## Test Matrix

### API-level tests required

- `config.test.ts` covers loader defaults, file precedence, normalization, option override merge, and typed failures.

### End-to-end facade tests required

- `stencil.test.ts` covers runtime application through real `Stencil` methods:
  - `init()`
  - `create()`
  - `resolve()`
  - `get()` / `list()`

This satisfies the planning constraint that each epic plan must include both API-level tests and facade-level end-to-end tests.

---

## Non-Goals

- Do not implement automatic `~/.stencil/` discovery here. That is Epic B.
- Do not refactor storage precedence logic beyond consuming the existing explicit `globalDir`.
- Do not add edit/copy/update template mutations. That is Epic C.
- Do not redesign the broader core error model beyond config-specific typed errors. That is Epic D.
- Do not make parser/resolver/validator use custom delimiters yet. That is Epic E.

---

## Exit Criteria

Epic A is complete when all of the following are true:

- `StencilConfig` is loaded from real config files at runtime.
- Project and global config merge correctly, with project precedence.
- `StencilOptions.config` is applied as the final override layer.
- `custom_context` values resolve through `$ctx.*` during facade resolution.
- `default_collection` is applied in `Stencil.create()` when no explicit collection is provided.
- Malformed or invalid config throws a typed, actionable error.
- Both API-level and facade-level config tests are present and passing.
- The existing core test suite remains green.
