# Plan: Epic 1 Step 1 — Extension Foundation And Test Harness

**Goal:** Turn the current VS Code scaffold into a real, testable extension foundation that can activate, create a workspace-scoped `Stencil` instance, register the MVP command IDs already present in the repo, and fail gracefully instead of silently.

**Primary inputs:**

- `docs/plans/15-epic-1-vscode-extension-mvp.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `packages/vscode-extension/*`
- `packages/core/*`

**This document plans Step 1 only.** It does not pull in Step 2+ work such as real Quick Pick browsing, template execution flow, placeholder collection, syntax highlighting, diagnostics, or Claude Code integration.

---

## Locked Scope For This Step

These decisions from `15-epic-1-vscode-extension-mvp.md` must remain true while implementing this step:

- Keep Epic 1 on the Phase 2 MVP surface only.
- Use direct `@stencil-pm/core` imports, not shell scripts.
- Do not introduce Webviews, preview panels, CodeLens, diagnostics, autocomplete, or cross-extension output dependencies.
- Keep output handling extension-local and minimal.
- Prefer lazy initialization over a required init command.
- Keep the tree contribution, if added now, as a browser foundation only.
- Keep extension orchestration out of `extension.ts` as much as possible.

---

## Repo Facts That Affect The Plan

- `packages/vscode-extension/package.json` already defines these command IDs:
  - `stencil.runTemplate`
  - `stencil.createTemplate`
  - `stencil.listTemplates`
- The extension currently activates only on `onStartupFinished`.
- `src/extension.ts`, `src/core/index.ts`, `src/commands/*.ts`, `src/providers/contextResolver.ts`, and `src/providers/templateTreeProvider.ts` are stubs.
- `packages/vscode-extension` has `build`, `dev`, `typecheck`, `lint`, `clean`, and `package` scripts, but no `test` script.
- `@stencil-pm/core` is already implemented and exports `Stencil`, `StencilError`, and the adapter-facing types from `packages/core/src/index.ts`.
- The repo already standardizes on Vitest in `packages/core`, and the architecture document names Vitest plus `@vscode/test-electron` as the intended testing stack.
- The architecture doc uses older example command IDs like `stencil.run`; Step 1 should not rename the actual repo command IDs.

---

## Step 1 Outcome

At the end of this step:

- the extension activates from the Command Palette without startup-only activation
- one `Stencil` instance is created per resolved workspace root and reused within the session
- a `VSCodeContextProvider` exists and is registered with core
- the three existing command IDs are registered and callable
- command failures surface through shared VS Code message handling
- `pnpm --filter stencil-vscode test` exists and passes
- one smoke test verifies the extension can activate inside the VS Code test host

**Demonstrable user flow for this step:**

1. Open any workspace in the Extension Development Host.
2. Run `Stencil: List Templates`.
3. The extension activates successfully.
4. The command returns a deliberate message such as missing workspace/setup or temporary not-yet-implemented wiring status, rather than throwing or doing nothing.

---

## Validation Gates

**Baseline validation before editing:**

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Validation during Steps 1.1 through 1.6:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Validation after the test harness lands:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

---

## Implementation Sequence

### Step 1.1 — Confirm The Extension Baseline And Freeze Command IDs

**Objective:** Start from the actual scaffold, not the older architecture example names.

**Files:** no production edits yet

**Actions:**

1. Confirm that `stencil.runTemplate`, `stencil.createTemplate`, and `stencil.listTemplates` are the canonical command IDs for this repo.
2. Confirm the extension entry point remains `dist/extension.js` bundled from `src/extension.ts`.
3. Confirm there is no existing test harness or language contribution to preserve.
4. Record in the implementation PR or working notes that architecture snippets using `stencil.run`, `stencil.list`, and `stencil.create` are reference-only and must not be copied literally.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** implementation starts from repo-real command IDs and file layout, with no accidental manifest rename.

---

### Step 1.2 — Create The Core Bridge For Adapter Imports

**Objective:** Make the extension import core through one local boundary instead of reaching directly into `@stencil-pm/core` from every file.

**Files to change:**

- `packages/vscode-extension/src/core/index.ts`

**Files to add:**

- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Replace the `src/core/index.ts` placeholder with explicit re-exports for:
   - `Stencil`
   - adapter-relevant core types such as `Template`, `ResolutionResult`, `StencilOptions`, and `ContextProvider`
   - `StencilError` and `StencilErrorCode`
2. Add `src/types.ts` for extension-local types only, for example:
   - workspace resolution result
   - command context shape
   - tree item metadata shape
3. Keep this layer thin. It should be a stable import surface, not a second abstraction of core behavior.

**Why here:** later steps need a single import boundary so command modules, services, and tests all target the same adapter surface.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** extension code can import everything it needs from local adapter files without duplicating core import paths.

---

### Step 1.3 — Add A Workspace-Scoped `Stencil` Factory

**Objective:** centralize creation and reuse of `Stencil` instances instead of instantiating core inside each command.

**Files to add:**

- `packages/vscode-extension/src/services/getStencil.ts`
- `packages/vscode-extension/src/services/workspace.ts`

**Actions:**

1. Implement a workspace resolver that chooses the project root using this order:
   - workspace folder for the active editor document, if one exists
   - otherwise the first open workspace folder
   - otherwise no workspace
2. Implement `getStencil()` to:
   - cache one `Stencil` instance per workspace root path for the current extension session
   - create a new instance only on first use for that workspace
   - register the `VSCodeContextProvider` during construction
3. Do not call `stencil.init()` here. Initialization remains command-driven, per the locked scope.
4. Keep the cache extension-local and in-memory only. No persisted adapter state.
5. Expose a narrow API that command handlers can consume without knowing about cache mechanics.

**Implementation notes to lock:**

- Multi-root workspaces are supported by picking one active project root at command time, not by sharing one `Stencil` instance across all folders.
- A missing workspace should return a typed adapter-local failure path, not a `null` that every command reinterprets differently.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** commands have one place to resolve workspace context and obtain the corresponding core facade.

---

### Step 1.4 — Implement `VSCodeContextProvider`

**Objective:** satisfy the architecture contract for VS Code-specific `$ctx.*` resolution without inventing more context surface than the docs call for.

**Files to change:**

- `packages/vscode-extension/src/providers/contextResolver.ts`

**Actions:**

1. Implement a `VSCodeContextProvider` that satisfies the core `ContextProvider` interface.
2. Return only the Step 1 context keys named in the epic plan:
   - `active_file`
   - `active_selection`
   - `workspace_folders`
   - `active_language_id`
   - `diagnostics_count`
3. Serialize values as strings only:
   - `active_file`: absolute path of the active document when file-backed
   - `active_selection`: selected text only when the selection is non-empty
   - `workspace_folders`: newline-delimited absolute folder paths
   - `active_language_id`: active editor language id when present
   - `diagnostics_count`: decimal string of current diagnostics count for the active document
4. Omit unavailable keys instead of inventing sentinel strings like `"none"`.
5. Keep the provider read-only and synchronous-from-VS-Code where possible, returning a Promise only because the interface requires it.

**Why this shape:** the core context engine consumes `Record<string, string>` values. Omitting missing keys preserves consistent fallback behavior in later resolution steps.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** `getStencil()` can register a real provider and later `stencil.resolve()` calls will receive VS Code context values.

---

### Step 1.5 — Add Shared Error And Message Handling

**Objective:** give every command one consistent way to surface failures, especially typed core errors.

**Files to add:**

- `packages/vscode-extension/src/services/errors.ts`
- `packages/vscode-extension/src/commands/shared.ts`

**Actions:**

1. Add an error helper that:
   - detects `StencilError`
   - maps well-known `StencilErrorCode` values to concise user-facing messages
   - falls back to a generic unexpected-error message
2. Add a small command wrapper utility so each command can run as:
   - resolve workspace
   - obtain `Stencil`
   - execute handler
   - route errors through one place
3. Include explicit handling for:
   - no workspace open
   - missing `.stencil/` setup
   - core validation/storage errors
4. Keep the helper focused on `showErrorMessage()` and `showInformationMessage()` only. Diagnostics, notifications with actions, and inline editor UX are out of scope for this step.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** Step 1 commands can fail consistently without duplicating try/catch logic.

---

### Step 1.6 — Replace Stub Activation With Real Bootstrap Wiring

**Objective:** move the extension from scaffold mode to a clean bootstrap that registers commands and foundation providers.

**Files to change:**

- `packages/vscode-extension/package.json`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/commands/createTemplate.ts`
- `packages/vscode-extension/src/commands/listTemplates.ts`
- `packages/vscode-extension/src/providers/templateTreeProvider.ts`

**Actions:**

1. Update `package.json` activation events:
   - remove the `onStartupFinished`-only behavior
   - add `onCommand:stencil.runTemplate`
   - add `onCommand:stencil.createTemplate`
   - add `onCommand:stencil.listTemplates`
   - add a workspace-based activation such as `workspaceContains:**/.stencil/**/*.md`
2. Contribute the long-lived tree view ID now:
   - add `views.explorer.stencilTemplates`
   - add `onView:stencilTemplates`
3. Keep the tree provider as a placeholder foundation in this step:
   - register the provider
   - return an empty set or empty-state placeholder
   - do not implement template browsing logic yet
4. Implement `activate()` to:
   - register the three command handlers
   - register the tree provider
   - push disposables into `context.subscriptions`
5. Keep `deactivate()` empty unless the final implementation genuinely owns disposable state outside `context.subscriptions`.
6. Replace the three command stubs with thin handlers that currently prove wiring only:
   - workspace/setup checks
   - `getStencil()` acquisition
   - temporary informative message when full Step 2/3 behavior is not implemented yet
7. Avoid putting branching UI logic directly into `extension.ts`; keep it as registration-only code.

**Important constraint:** temporary command behavior in Step 1 must be explicit about being a foundation-state response, so users are not misled into thinking list/run/create is complete before later slices land.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the extension activates via command invocation, registers its known surface, and returns intentional messages from the registered commands.

---

### Step 1.7 — Add The Unit Test Harness

**Objective:** make extension behavior verifiable without relying on manual F5 runs.

**Files to change:**

- `packages/vscode-extension/package.json`

**Files to add:**

- `packages/vscode-extension/vitest.config.ts`
- `packages/vscode-extension/tsconfig.test.json`
- `packages/vscode-extension/test/unit/extension.test.ts`
- `packages/vscode-extension/test/unit/services/getStencil.test.ts`
- `packages/vscode-extension/test/unit/providers/contextResolver.test.ts`
- `packages/vscode-extension/test/unit/services/errors.test.ts`

**Actions:**

1. Add local test scripts:
   - `test`
   - `test:unit`
   - `test:smoke`
2. Add local dev dependencies needed for unit testing rather than relying on root-only transitive availability:
   - `vitest`
   - any minimal TS test typing support required by the chosen config
3. Configure Vitest for Node-based unit tests with mocked `vscode`.
4. Mock `vscode` in unit tests and cover these behaviors:
   - `activate()` registers the three commands and the tree provider
   - `getStencil()` caches per workspace root and registers the VS Code context provider
   - `VSCodeContextProvider.resolve()` returns the expected string map
   - error helpers translate `StencilError` into user-visible messages
5. Keep unit tests at the adapter seam. Do not re-test core behavior already covered in `packages/core`.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test:unit
```

**Completion gate:** the package has fast deterministic unit coverage for the new foundation code.

---

### Step 1.8 — Add The VS Code Smoke Test Harness

**Objective:** verify that the packaged extension can activate inside a real VS Code test host.

**Files to add:**

- `packages/vscode-extension/test/runTest.mjs`
- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/test/fixtures/workspace-empty/README.md`

**Actions:**

1. Add a minimal `@vscode/test-electron` launcher in `test/runTest.mjs`.
2. Point it at a tiny fixture workspace so activation occurs in a realistic folder context.
3. Add one smoke test that verifies:
   - the extension can be found by its identifier
   - activation completes without throwing
   - contributed commands are present
4. Keep this smoke layer deliberately small in Step 1. It is for activation confidence, not behavioral coverage.
5. Make `package.json` `test` run unit tests plus smoke tests in sequence.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Completion gate:** CI and local development both have a non-manual way to confirm the extension still loads.

---

### Step 1.9 — Update Extension README For The New Foundation

**Objective:** keep local contributor docs aligned with the scaffold no longer being empty.

**Files to change:**

- `packages/vscode-extension/README.md`

**Actions:**

1. Replace the current “commands are stubs” wording with Step 1-accurate status.
2. Document:
   - current command surface
   - current state of implementation
   - how to run `typecheck`, `build`, and `test`
   - what is intentionally deferred to later Epic 1 steps
3. Do not oversell the feature state. The README should describe a working foundation, not a finished MVP.

**Validation:**

```bash
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Completion gate:** contributors can understand what Step 1 delivered and how to verify it.

---

## What Must Stay Out Of This Step

- Real Quick Pick template browsing
- Real `runTemplate` resolution and output delivery
- Real `createTemplate` wizard flow
- Tree View data modeling and actions
- Template syntax grammar files
- diagnostics, autocomplete, CodeLens, preview panels, Webviews
- Claude Code VS Code extension integration
- collection CRUD or template mutation beyond temporary command wiring

These belong to Step 2 and later slices from the Epic 1 plan.

---

## Final Acceptance Checklist

- `src/core/index.ts` is a real adapter bridge
- a workspace-scoped `getStencil()` service exists
- `VSCodeContextProvider` is implemented and registered
- `extension.ts` contains bootstrap only, not feature logic
- `package.json` no longer depends on `onStartupFinished` alone
- the three existing command IDs are registered and callable
- a placeholder tree provider is wired only as foundation, not as full feature delivery
- shared error/message handling exists
- `pnpm --filter stencil-vscode test` exists and passes
- README reflects the new foundation state

---

## Recommended Post-Step Handoff

Once this step is complete and green, the next slice should be `Step 2 — List Command And Quick Pick Browse Flow` from `docs/plans/15-epic-1-vscode-extension-mvp.md`. That step can build directly on:

- the command registration from Step 1
- the workspace-scoped `Stencil` factory
- the shared error wrapper
- the new test harness
