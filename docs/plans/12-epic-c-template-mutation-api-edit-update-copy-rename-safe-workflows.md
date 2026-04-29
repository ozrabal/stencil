# Plan: Epic C — Template Mutation API (Edit, Update, Copy, Rename-Safe Workflows)

**Goal:** Extend `@stencil-pm/core` with first-class template mutation APIs so adapters can edit, update, copy, and rename templates through the `Stencil` facade without reaching into storage internals.

**Scope boundary:** Treat parser, validator, resolver, storage, collections, config loading, and global-directory discovery as already implemented. Do not re-plan those modules from scratch. Do not move adapter UX concerns into core. Prefer additive changes that preserve the current passing suite.

**Important repo-specific note:** In the current branch, Epic A and Epic B are already implemented. `packages/core/src/stencil.ts` already loads runtime config, auto-discovers the global stencil directory, and wires project/global precedence through `LocalStorageProvider`. Epic C should build on that baseline and stay focused on mutation behavior.

**Required by planning notes:**

- Keep foundational module work out of scope.
- Keep adapter responsibilities out of scope unless a new core contract is required.
- Prefer additive changes that keep the current suite green.
- Include both API-level tests and end-to-end facade tests.

**Prerequisites:** Confirm the current `packages/core` baseline is green before editing.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected: zero type errors and the current full Vitest suite passes before any Epic C edits begin.

**Per-step validation default:**

```bash
cd packages/core && npm run typecheck
```

**Recommended targeted test command during implementation:**

```bash
cd packages/core && npx vitest run test/storage.test.ts test/stencil.test.ts
```

**Required final validation:**

```bash
cd packages/core && npm run typecheck && npm test
```

---

## Current Repo State

- `Stencil` currently exposes `init`, `create`, `list`, `get`, `delete`, `validate`, `resolve`, and `search`.
- `Stencil.create()` already validates templates before saving and writes only to project storage.
- `LocalStorageProvider` already:
  - reads from project first, then global
  - writes only to the project stencil directory
  - deletes only from the project stencil directory
- `CollectionManager.moveToCollection()` already establishes an important mutation rule:
  - a template visible only from the global directory is read-only to project-scoped mutation flows
- `StorageProvider` is still a minimal abstraction:
  - `listTemplates`
  - `getTemplate`
  - `saveTemplate`
  - `deleteTemplate`
  - `templateExists`
- No facade mutation methods exist yet for:
  - editing/updating an existing template
  - copying/duplicating a template
  - renaming a template safely

This means Epic C is primarily a facade-contract and local-storage orchestration epic, not a parser/validator/config/storage redesign.

---

## Target Behavior

After this epic:

- `Stencil.update()` can modify an existing project template’s body, frontmatter fields, and collection assignment.
- `Stencil.copy()` can duplicate a visible template into project storage under a new name.
- `Stencil.rename()` can rename a project template safely without forcing adapters to compose delete/save flows manually.
- Every mutation validates the final template before the write is committed.
- Error-severity validation issues block mutation; warnings do not.
- Mutations remain project-scoped:
  - project templates can be updated, copied, and renamed
  - global-only templates may be copied into the project, but not updated or renamed in place
  - overwrite of a global-only target is rejected explicitly
- Collision semantics are explicit and test-covered.
- The epic includes:
  - focused API-level tests for mutation contracts and any storage helper behavior
  - at least one end-to-end facade flow covering create → update → copy → rename → get/list/delete

---

## Design Decisions To Lock Before Editing

### 1. Keep all write mutations project-scoped

`Stencil` should continue to behave like the rest of the current facade:

- writes go to the project’s `.stencil/`
- global templates are readable inputs, not writable targets

Implications:

- `update(name, ...)` rejects when `name` resolves to a global-only template
- `rename(name, ...)` rejects when `name` resolves to a global-only template
- `copy(sourceName, targetName, ...)` may use a global source template, but the result is always created in project storage

This aligns with the current storage implementation and with `CollectionManager.moveToCollection()`.

### 2. Add an explicit `rename()` API instead of overloading `update()`

Recommended public facade shape:

- `update(name, patch)`
- `copy(sourceName, targetName, options?)`
- `rename(sourceName, targetName, options?)`

Do not treat `frontmatter.name` changes inside `update()` as implicit rename behavior.

Why:

- it keeps `update()` semantics simple
- it keeps rename collision handling explicit
- it avoids half-hidden file moves caused by a generic patch object

### 3. Keep `update()` patch semantics shallow and predictable

Recommended patch contract:

- `body?: string`
- `collection?: string | null`
- `frontmatter?: Partial<Omit<TemplateFrontmatter, 'name'>>`

Semantics:

- omitted field = no change
- `collection: null` = move to uncategorized templates
- provided frontmatter keys replace those fields directly
- array fields like `tags` and `placeholders` are replaced as whole fields, not deep-merged

### 4. Validate the final template snapshot before mutating disk

For `update`, `copy`, and `rename`:

1. load source template
2. produce the final candidate template in memory
3. run `validateTemplate(candidate)`
4. reject on error-severity issues
5. persist only if valid

This keeps mutation behavior aligned with the current `create()` contract.

### 5. Default collision policy is fail-fast and source-aware

Recommended rules:

- `copy()` and `rename()` fail by default if `targetName` already resolves to any visible template
- `overwrite: true` only allows replacing an existing **project** target
- `overwrite: true` still rejects when the colliding target exists only in the global directory
- `copy(source, source)` is invalid
- `rename(source, source)` should be treated as invalid input, not a silent no-op

Why:

- a visible global collision is still a real user-facing name collision
- a project-scoped facade must not pretend it can overwrite global state

### 6. Do not auto-increment template version in this epic

`frontmatter.version` should remain caller-controlled.

- `update()` preserves the current version unless the caller explicitly changes it
- `copy()` preserves the source version unless overrides change it
- `rename()` preserves version unchanged

The PRD and architecture define the field, but they do not define mutation-time version bump semantics. Avoid inventing them here.

### 7. Avoid widening the `StorageProvider` interface unless strictly necessary

Preferred approach:

- keep `StorageProvider` stable
- add narrowly scoped helper methods only on `LocalStorageProvider`, or as private utilities in `storage.ts`, if needed for safe project-file moves

Why:

- the facade currently owns a concrete `LocalStorageProvider`
- widening `StorageProvider` would push Epic C concerns into future Git/remote providers unnecessarily

---

## Proposed Public Contract

Recommended type additions in `packages/core/src/types.ts`:

```ts
export interface UpdateTemplateInput {
  body?: string;
  collection?: string | null;
  frontmatter?: Partial<Omit<TemplateFrontmatter, 'name'>>;
}

export interface CopyTemplateOptions {
  body?: string;
  collection?: string | null;
  frontmatter?: Partial<Omit<TemplateFrontmatter, 'name'>>;
  overwrite?: boolean;
}

export interface RenameTemplateOptions {
  overwrite?: boolean;
}
```

Recommended facade methods in `packages/core/src/stencil.ts`:

```ts
update(name: string, patch: UpdateTemplateInput): Promise<Template>
copy(sourceName: string, targetName: string, options?: CopyTemplateOptions): Promise<Template>
rename(sourceName: string, targetName: string, options?: RenameTemplateOptions): Promise<Template>
```

Recommended return contract:

- all mutation methods return the persisted project template as re-read from storage
- returned template includes correct:
  - `frontmatter`
  - `body`
  - `collection`
  - `filePath`
  - `source: 'project'`

---

## Files Expected To Change

- `packages/core/src/types.ts`
- `packages/core/src/stencil.ts`
- `packages/core/src/storage.ts`
- `packages/core/src/index.ts`
- `packages/core/test/storage.test.ts`
- `packages/core/test/stencil.test.ts`

Files that should usually remain unchanged:

- `packages/core/src/parser.ts`
- `packages/core/src/validator.ts`
- `packages/core/src/resolver.ts`
- `packages/core/src/config.ts`
- `packages/core/src/collections.ts`
- `packages/core/test/config.test.ts`
- `packages/core/test/resolver.test.ts`

---

## Step-by-Step Plan

### Step 1 — Reconfirm the baseline and isolate the true gap

Run the current package checks before editing.

```bash
cd packages/core && npm run typecheck && npm test
```

Expected:

- the current suite is green
- no mutation methods exist on `Stencil`
- all current create/get/delete/collection/global behavior remains intact

If the baseline is red, stop and isolate that first. Epic C should start from a green baseline.

---

### Step 2 — Lock the mutation contract in types before changing behavior

Update `packages/core/src/types.ts` first so the new facade behavior has an explicit contract.

Add:

- `UpdateTemplateInput`
- `CopyTemplateOptions`
- `RenameTemplateOptions`

Update any public exports in `packages/core/src/index.ts` if types are re-exported there.

Constraints:

- keep the new types additive
- keep `TemplateFrontmatter` unchanged
- keep `StorageProvider` unchanged at this step

Validation:

```bash
cd packages/core && npm run typecheck
```

Expected: new types compile cleanly and do not affect existing tests yet.

---

### Step 3 — Add the minimum local-storage primitives needed for safe project mutations

Inspect `packages/core/src/storage.ts` and add only the helper behavior the facade actually needs. Do not redesign storage.

Recommended helper direction:

- add a way to resolve or load the **project** copy of a template without falling back to global
- add a local helper for moving/replacing a project template path safely when rename semantics require more than plain `saveTemplate()` + `deleteTemplate()`

Two acceptable implementations:

1. Minimal public helpers on `LocalStorageProvider`, for example:
   - `getProjectTemplate(name: string): Promise<Template | null>`
   - `getProjectTemplatePath(name: string): Promise<string | null>`
2. Keep helpers private inside `storage.ts` and let `Stencil` call a single local-only mutation helper exposed by `LocalStorageProvider`

Recommended bias: expose the smallest reusable helper surface possible and keep it local-provider specific, not on `StorageProvider`.

Why this step exists:

- `getTemplate()` currently falls back to global, which is wrong for in-place update/rename permission checks
- rename-safe workflows may need project-path-aware logic that `saveTemplate()` alone does not provide

API-level tests to add now in `packages/core/test/storage.test.ts`:

- project-only lookup returns the project template when both project and global copies exist
- project-only lookup returns `null` when the template exists only globally
- any new path-move helper preserves file placement for:
  - uncategorized templates
  - collection templates
- overwrite-path logic never deletes or mutates global files

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/storage.test.ts
```

Expected: storage-level helper behavior is proven independently before facade logic starts using it.

---

### Step 4 — Implement `Stencil.update()` as project-scoped edit behavior

Add `update()` to `packages/core/src/stencil.ts`.

Recommended algorithm:

1. `await ensureRuntimeReady()`
2. load the current project template, not the visible project-or-global template
3. if missing:
   - if a visible global-only template exists, throw a clear project-scope mutation error
   - otherwise throw not-found
4. build the candidate template by applying:
   - `body` override when provided
   - `collection` override when provided
   - shallow `frontmatter` patch excluding `name`
5. validate the final candidate via `validateTemplate(candidate)`
6. reject if any error-severity issues exist
7. persist the candidate
8. re-read it from storage and return the saved project template

Behavior to preserve:

- warnings do not block update
- `source` remains `project`
- config-driven `defaultCollection` should not be re-applied during update; only explicit patch values should change collection

Facade tests to add in `packages/core/test/stencil.test.ts`:

- updates body only
- updates frontmatter description/tags/placeholders only
- moves a template into a collection
- moves a template out of a collection with `collection: null`
- rejects invalid final frontmatter
- rejects update of a template that exists only globally
- preserves unspecified fields

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/stencil.test.ts
```

Expected: update behavior is fully covered and existing `create/get/list/delete` tests stay green.

---

### Step 5 — Implement `Stencil.copy()` with explicit collision and overwrite rules

Add `copy()` to `packages/core/src/stencil.ts`.

Recommended algorithm:

1. `await ensureRuntimeReady()`
2. load `sourceName` using normal visible lookup:
   - project source allowed
   - global source allowed
3. reject if source is missing
4. reject if `sourceName === targetName`
5. build the candidate template:
   - clone source template
   - set `frontmatter.name = targetName`
   - apply optional `body`, `collection`, and non-name frontmatter overrides
   - set `source = 'project'`
   - clear `filePath` before save
6. validate the final candidate
7. inspect visible target collision:
   - no collision: save normally
   - project collision + `overwrite !== true`: reject
   - project collision + `overwrite === true`: replace the project target
   - global-only collision: reject, even when `overwrite === true`
8. save and re-read the persisted project template

Important design detail:

- allow copying from a global template into the project under a fresh name
- do not allow “overwrite” to mean “shadow a global template by writing a project template of the same name”; that is too implicit for a safe default mutation API

Facade tests to add:

- copies a project template under a new name
- copies a global template into project storage under a new name
- copies with collection override
- copies with frontmatter/body override
- rejects invalid copied result
- rejects target collision by default
- overwrites an existing project target only when `overwrite: true`
- rejects overwrite when the colliding target is global-only

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/stencil.test.ts
```

Expected: copy semantics are explicit, safe, and fully tested.

---

### Step 6 — Implement `Stencil.rename()` using the safest project-file workflow available

Add `rename()` to `packages/core/src/stencil.ts`.

Recommended behavior:

- rename is only allowed for project templates
- target collisions follow the same source-aware policy as `copy()`
- successful rename updates both:
  - `frontmatter.name`
  - on-disk file location

Preferred implementation order:

1. load project source template
2. reject if source missing or global-only
3. reject if `sourceName === targetName`
4. build the final candidate with only `frontmatter.name` changed
5. validate the candidate
6. perform the safest available local move:
   - preferred: use a storage helper that moves/replaces the project file path directly
   - acceptable fallback: save new template, verify it, then delete old project file, with rollback if the old delete fails
7. return the re-read saved template

Recommended storage behavior for overwrite:

- when `overwrite: true` and the target exists in project storage, replace that project file only
- never delete or modify a global target

API-level tests in `storage.test.ts` if a move helper is introduced:

- renames uncategorized templates in place
- renames collection templates in place
- moves between file paths without touching unrelated templates
- project overwrite replaces only the project target

Facade tests in `stencil.test.ts`:

- renames a project template and removes the old name
- preserves body/frontmatter fields other than `name`
- keeps collection placement intact unless the implementation intentionally supports a move option
- rejects rename of a global-only template
- rejects collision by default
- allows overwrite only for project targets

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/storage.test.ts test/stencil.test.ts
```

Expected: rename workflow is safe, project-scoped, and clearly separated from generic update behavior.

---

### Step 7 — Add a facade end-to-end mutation flow that proves the APIs work together

Extend `packages/core/test/stencil.test.ts` with a high-level scenario similar to the existing happy-path coverage.

Required end-to-end flow:

1. `init()`
2. `create()` a template
3. `update()` body/frontmatter/collection
4. `copy()` it to a second project template
5. `rename()` the copied template
6. `get()` both resulting templates and assert final state
7. `list()` and verify visible names/collections
8. `validate()` the final renamed template
9. `delete()` both templates
10. confirm cleanup through `get()` or `list()`

Why this step matters:

- method-level tests prove individual contracts
- this flow proves the full facade behavior stays coherent after multiple mutations

Validation:

```bash
cd packages/core && npm run typecheck
cd packages/core && npx vitest run test/stencil.test.ts
```

Expected: the facade passes a realistic mutation lifecycle without adapters touching storage directly.

---

### Step 8 — Run the full package suite and verify no regressions in adjacent behavior

Run the full package checks once the mutation methods and tests are in place.

```bash
cd packages/core && npm run typecheck && npm test
```

Specifically confirm there are no regressions in:

- existing create/get/delete behavior
- global precedence for visible reads
- collection manager behavior
- config-backed default collection behavior
- validation and resolution flows unrelated to mutation

If regressions appear in collection or storage tests, tighten Epic C to reuse existing semantics rather than introducing a broader storage abstraction change.

---

## Test Matrix

### API-level tests

`packages/core/test/storage.test.ts`

- project-only lookup helper behavior
- any new rename/move helper behavior
- project overwrite path behavior
- guarantee that global files are never mutated by local mutation helpers

`packages/core/test/stencil.test.ts`

- `update()` method contract
- `copy()` method contract
- `rename()` method contract
- error handling for global-only sources and collisions

### End-to-end facade tests

`packages/core/test/stencil.test.ts`

- one happy-path mutation lifecycle covering:
  - create
  - update
  - copy
  - rename
  - get/list/validate
  - delete

---

## Acceptance Criteria

- `Stencil` exposes `update()`, `copy()`, and `rename()` as public mutation APIs.
- Adapters no longer need to compose edit/copy/rename flows from raw storage methods.
- Mutation behavior is explicitly project-scoped and rejects global-only in-place edits.
- Collision and overwrite behavior are defined, implemented, and tested.
- Error-severity validation issues block mutation; warnings do not.
- The full `packages/core` typecheck and test suite remains green.

---

## Suggested Implementation Order

1. Types and exports
2. Minimal local-storage helpers
3. `Stencil.update()`
4. `Stencil.copy()`
5. `Stencil.rename()`
6. Focused storage and method tests
7. End-to-end facade mutation flow
8. Full suite validation

This order keeps the risk low, proves the low-level invariants first, and preserves a green suite throughout the epic.
