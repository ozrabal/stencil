# Plan: Epic B — Global Directory Auto-Discovery and Precedence Completion

**Goal:** Complete product-level global template support in `@stencil-pm/core` by making `Stencil` auto-discover a default global stencil directory when `globalDir` is not supplied, while preserving explicit project-over-global precedence for both templates and config.

**Scope boundary:** Treat the existing parser, validator, resolver, storage layer, collections manager, facade, and config loader as implemented. Do not re-plan those modules from scratch. Do not pull adapter behavior into this plan. Do not change template mutation behavior here. Prefer additive wiring changes that keep the current test suite passing.

**Important repo-specific note:** Epic A is already implemented in the current codebase. `packages/core/src/config.ts` exists, `Stencil` already loads runtime config, `defaultCollection` is honored, and `customContext` is injected into the context engine. Epic B should build on that baseline rather than reintroducing config loading.

**Prerequisites:** Confirm the current `packages/core` baseline is green before editing.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero type errors and the full current Vitest suite passes.

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

- `packages/core/src/storage.ts` already supports project/global precedence when a `globalDir` is explicitly provided.
- `packages/core/src/config.ts` already loads:
  - `<projectDir>/.stencil/config.yaml`
  - `<globalDir>/config.yaml`
    and merges with `project > global > defaults > runtime overrides`.
- `packages/core/src/stencil.ts` passes `options.globalDir` straight through to both storage and config loading.
- `packages/core/src/types.ts` currently exposes `globalDir?: string`.
- There is no default `~/.stencil/` resolution when the caller omits `globalDir`.
- There is no explicit project-only opt-out mode when the caller wants to suppress global lookup entirely.

This means the remaining gap is facade/runtime wiring, not storage or config reimplementation.

---

## Target Behavior

After this epic:

- `new Stencil({ projectDir })` automatically reads from:
  - `<projectDir>/.stencil/`
  - `~/.stencil/`
- Auto-discovered global usage applies consistently to:
  - template listing
  - template lookup
  - config loading
  - config-backed `$ctx.*` resolution
- Explicit `globalDir` still overrides the default location.
- Consumers can disable global lookup intentionally for project-only mode.
- Project templates still override global templates on name collision.
- Project config still overrides global config on key collision.
- The implementation remains additive and does not require storage-layer redesign.
- The epic includes:
  - API-level tests for the new path-resolution contract
  - end-to-end facade tests proving template and config precedence through `Stencil`

---

## Design Decisions To Lock Before Editing

### 1. Use `globalDir: null` as the explicit project-only opt-out

Recommended contract:

- `globalDir === undefined`:
  auto-discover `path.join(os.homedir(), '.stencil')`
- `globalDir === string`:
  use that exact path
- `globalDir === null`:
  disable global lookup entirely

Why this shape:

- It is additive to the current API.
- It keeps the constructor simple.
- It gives tests and adapters a deterministic way to force project-only behavior.

This requires widening the option type from `string` to `string | null`.

### 2. Resolve the global path once in the facade constructor

`LocalStorageProvider` and `loadStencilConfig()` should receive the same resolved global path. Compute it once during `Stencil` construction and store it on the instance.

Why:

- Prevents config and storage from accidentally using different global directories.
- Keeps behavior deterministic within a single `Stencil` instance.

### 3. Keep the path helper synchronous and side-effect free

The helper should only compute a path. It should not create directories, touch the filesystem, or validate existence.

Why:

- Storage and config code already tolerate missing directories/files.
- Auto-discovery should not create `~/.stencil/` just because the facade was instantiated.

### 4. Keep `LocalStorageProvider` behavior unchanged unless a bug is found

Storage already provides the required precedence behavior. Epic B should wire the missing default input into storage, not redesign list/get logic.

### 5. Keep config precedence exactly aligned with Epic A

Do not change the merge order already implemented in `config.ts`. Epic B should only ensure the auto-discovered global directory is passed into that existing loader.

---

## Files Expected To Change

- `packages/core/src/types.ts`
- `packages/core/src/stencil.ts`
- `packages/core/src/paths.ts` (new)
- `packages/core/test/stencil.test.ts`
- `packages/core/test/paths.test.ts` (new)
- Optional: `packages/core/src/index.ts` only if maintainers want to export the helper publicly; otherwise keep `paths.ts` internal
- Optional doc follow-up if public contract documentation for `globalDir: null` lives outside tests

Files that should usually remain unchanged:

- `packages/core/src/storage.ts`
- `packages/core/src/config.ts`
- `packages/core/test/storage.test.ts`
- `packages/core/test/config.test.ts`

---

## Step-by-Step Plan

### Step 1 — Reconfirm the baseline and isolate the true gap

Run the current core suite before any edits.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected:

- The suite is already green.
- Existing config tests prove precedence only when `globalDir` is passed explicitly.
- Existing facade tests cover explicit global config usage but do not prove default global auto-discovery.

If unrelated failures exist, stop and fix or isolate them before continuing. This epic should not start from a red baseline.

---

### Step 2 — Add a small path-resolution utility for the global stencil directory

Create a focused helper so path resolution is testable independently of `Stencil`.

**File:** `packages/core/src/paths.ts`

Recommended export:

```ts
resolveGlobalStencilDir(
  explicitGlobalDir?: string | null,
  homeDir: string = os.homedir(),
): string | undefined
```

Contract:

- Returns `explicitGlobalDir` unchanged when it is a non-empty string.
- Returns `undefined` when `explicitGlobalDir === null`.
- Returns `path.join(homeDir, '.stencil')` when `explicitGlobalDir === undefined`.
- Optionally treat an empty string like an invalid explicit path and either:
  - preserve it exactly, if maintainers want “caller owns bad input”, or
  - reject it early with a small typed error.

Recommended choice: preserve current low-friction behavior and avoid introducing new validation in this epic. The helper should only distinguish `undefined` vs `null` vs explicit string.

Why this step exists:

- It gives Epic B a direct API surface to test.
- It avoids embedding path branching logic inside the facade constructor.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected: new helper compiles; no runtime behavior has changed yet.

---

### Step 3 — Widen the facade option contract to support explicit opt-out

Update the `StencilOptions` type to represent the three intended modes.

**File:** `packages/core/src/types.ts`

Change:

- From: `globalDir?: string`
- To: `globalDir?: string | null`

Also update the accompanying comment so it documents the semantics:

- omitted = auto-discover `~/.stencil/`
- string = use explicit directory
- `null` = disable global lookup

Why this step is separate:

- It makes the API contract explicit before the constructor starts using it.
- It lets tests compile against the new opt-out behavior.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected: no type errors in existing call sites.

---

### Step 4 — Wire the resolved global path into `Stencil` once, and reuse it everywhere

Update the facade to compute and store a resolved global directory during construction.

**File:** `packages/core/src/stencil.ts`

Implementation changes:

1. Import `resolveGlobalStencilDir` from `paths.ts`.
2. Replace the current direct assignment of `options.globalDir` with:
   - `this.globalDir = resolveGlobalStencilDir(options.globalDir)`
3. Continue to append `.stencil` to `projectDir` for `this.stencilDir`.
4. Construct `LocalStorageProvider` with the resolved `this.globalDir`.
5. Keep `loadStencilConfig(this.stencilDir, this.globalDir, this.configOverrides)` unchanged except that it now receives the resolved default path.

Important constraints:

- Do not make the constructor async.
- Do not create the resolved global directory during construction or `init()`.
- Do not change create/delete/mutation behavior; global support in this epic is read/config precedence, not writing into the global directory.

Behavior after this step:

- `Stencil.list()` and `Stencil.get()` inherit global auto-discovery through storage.
- `Stencil.resolve()` inherits global config auto-discovery through runtime config and context resolution.
- `Stencil.create()` remains project-scoped, which is correct for this epic.

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected: the facade compiles with no public API break except the additive `null` union.

---

### Step 5 — Add API-level tests for the path-resolution contract

Create focused tests for the new helper before relying on facade integration coverage.

**File:** `packages/core/test/paths.test.ts`

Add direct tests for:

1. Returns `~/.stencil` under the provided `homeDir` when `globalDir` is omitted.
2. Returns the explicit `globalDir` unchanged when provided.
3. Returns `undefined` when `globalDir` is `null`.

Use an injected `homeDir` argument instead of mocking the filesystem. The test should stay pure and fast.

Why these are the required API-level tests:

- This epic’s only new low-level contract is global path resolution.
- Existing config loader tests already cover precedence once a global directory value exists.

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npm test -- paths.test.ts
```

Expected: the new unit suite passes independently.

---

### Step 6 — Add facade tests for default discovery, explicit override, opt-out, and precedence

Extend the integration suite so the new behavior is proven through the public `Stencil` API, not just through direct helper calls.

**File:** `packages/core/test/stencil.test.ts`

Use real temporary directories and one of these test techniques:

- Preferred: `vi.spyOn(os, 'homedir').mockReturnValue(tempHome)` while the test is running.
- Acceptable alternative: inject a home-dir parameter indirectly if maintainers choose to expose a constructor seam, but that is likely unnecessary.

Add end-to-end tests for these cases:

1. `Stencil({ projectDir })` discovers `~/.stencil/` automatically for templates.
   - Put a template under `<tempHome>/.stencil/templates/global-only.md`
   - Instantiate with no `globalDir`
   - Assert `await stencil.get('global-only')` returns the global template

2. Omitted `globalDir` preserves project-over-global template precedence.
   - Create the same template name in project and discovered global dirs
   - Assert `get()` returns the project template
   - Assert `list()` exposes only one entry for the colliding name and that it is project-sourced

3. Omitted `globalDir` preserves project-over-global config precedence.
   - Put `config.yaml` in discovered global dir with `custom_context.team_name=Platform`
   - Put `config.yaml` in project dir with `custom_context.team_name=Core`
   - Create a template with `{{$ctx.team_name}}`
   - Assert `resolve()` produces `Core`

4. Explicit `globalDir` overrides the default discovered location.
   - Put one template in discovered global dir and a different one in an explicit global dir
   - Instantiate with `globalDir: explicitPath`
   - Assert only the explicit location is consulted for global lookups

5. `globalDir: null` enables project-only mode.
   - Put a template and config only in discovered global dir
   - Instantiate with `globalDir: null`
   - Assert `get()` does not find the global template
   - Assert project-only config behavior remains in force

6. Existing explicit-global behavior still works.
   - Keep or adapt one existing explicit-global test so the epic proves it did not regress the old contract.

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npm test -- stencil.test.ts
```

Expected:

- The new facade tests pass.
- No existing `Stencil` behavior regresses.

---

### Step 7 — Run the full package suite and confirm the change stayed additive

Run the complete validation after the implementation and test updates are in place.

```bash
cd packages/core && npm test
```

Expected:

- All existing suites remain green.
- The new `paths.test.ts` suite passes.
- `stencil.test.ts` now proves automatic global discovery and explicit opt-out.
- No storage or config regressions appear, which confirms Epic B was implemented as a facade/runtime wiring change rather than a lower-layer rewrite.

If the suite fails in `storage.test.ts` or `config.test.ts`, treat that as a sign the epic leaked into lower layers and back the change down to the minimal wiring needed.

---

### Step 8 — Optional documentation cleanup for the public constructor contract

If maintainers treat `globalDir: null` as part of the supported public API, update the nearest public-facing contract docs after code and tests are green.

Likely doc targets:

- package-level README, if it documents constructor options
- architecture snippets that show `StencilOptions.globalDir?: string`

Keep this step minimal:

- Document the opt-out semantics.
- Do not rewrite the architecture or PRD.

Validation:

- No code changes required.
- If docs are updated, ensure they match the implemented contract exactly.

---

## Implementation Notes and Guardrails

- Do not add global-directory creation to `Stencil.init()`. The epic is about discovery and precedence, not provisioning a personal template store on startup.
- Do not change `LocalStorageProvider.saveTemplate()` to write into the global directory. Project-scoped writes are still the safe default.
- Do not move config merging logic out of `config.ts`. That module is already the correct place for precedence behavior.
- Do not add adapter-facing UX or prompting behavior. The facade should only expose the discovered global behavior through existing methods.
- Keep tests filesystem-realistic. This epic is specifically about path resolution and precedence across directories, so mocks should be limited to `os.homedir()` if needed.

---

## Exit Criteria

Epic B is complete when all of the following are true:

- A consumer can instantiate `new Stencil({ projectDir })` and automatically see global templates from `~/.stencil/`.
- A consumer can explicitly disable global lookup with `new Stencil({ projectDir, globalDir: null })`.
- Explicit `globalDir` still works and overrides the default location.
- Project templates still override global templates on collision.
- Project config still overrides global config on collision.
- The implementation is covered by:
  - API-level tests for path resolution
  - end-to-end facade tests for template and config precedence
- The full `packages/core` test suite remains green.
