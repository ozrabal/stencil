# Plan: Epic 1 Step 2 — List Command And Quick Pick Browse Flow

**Goal:** Replace the current placeholder `Stencil: List Templates` command with a real browse flow that calls `stencil.list()`, presents templates in a standard VS Code Quick Pick, and opens the selected template file in the editor.

**Primary inputs:**

- `docs/plans/15-epic-1-vscode-extension-mvp.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `packages/vscode-extension/*`
- `packages/core/*`

**This document plans Step 2 only.** It does not implement template execution, placeholder prompting, template creation, Tree View browsing, syntax highlighting, diagnostics, preview UI, or cross-extension integrations.

---

## Locked Scope For This Step

These decisions from `15-epic-1-vscode-extension-mvp.md` must remain true while implementing this step:

- Keep Epic 1 on the Phase 2 MVP surface only.
- Use direct `@stencil-pm/core` imports through the extension’s local core bridge.
- Do not introduce Webviews, preview panels, CodeLens, diagnostics, autocomplete, or custom browse UI.
- Keep the browse flow extension-local: list templates, choose one, open the file.
- Keep orchestration out of `extension.ts`; put reusable logic in command/service helpers.
- Do not pull Tree View browsing forward into this step.

Additional Step 2 decisions to lock before editing:

- Reuse the existing `registerWorkspaceCommand()` wrapper and its current missing-workspace / missing-`.stencil/` handling instead of duplicating those checks in `listTemplates.ts`.
- Use `vscode.window.showQuickPick()` with plain `QuickPickItem` data. Do not switch to `createQuickPick()` unless a real blocker appears.
- Use Quick Pick separators to group templates by collection because the PRD explicitly describes a grouped template picker.
- Open the selected template with `workspace.openTextDocument()` plus `window.showTextDocument()`. Do not auto-run, preview, copy, or mutate anything.
- Treat malformed templates and storage failures as command errors surfaced through the existing `showCommandError()` path.

---

## Repo Facts That Affect The Plan

- Step 1 foundation already exists in `packages/vscode-extension`:
  - `src/services/getStencil.ts` creates and caches one `Stencil` instance per workspace root.
  - `src/services/workspace.ts` resolves the active workspace and checks for `.stencil/`.
  - `src/commands/shared.ts` wraps commands with workspace/setup checks and shared error handling.
  - `src/services/errors.ts` already maps core `StencilError` values to VS Code messages.
- `src/commands/listTemplates.ts` is still a placeholder that only shows an informational message.
- `src/providers/templateTreeProvider.ts` is also still placeholder-only; that is correct for this step and should stay that way.
- `@stencil-pm/core` already exposes `Stencil.list()` and returns `Template[]`.
- The core `Template` shape already includes the fields Step 2 needs:
  - `frontmatter.name`
  - `frontmatter.description`
  - `collection`
  - `filePath`
  - `source`
- Core storage already applies project-over-global precedence and sorts results by collection then template name. Step 2 should preserve that predictable order instead of reimplementing discovery logic.
- The extension package already has a Vitest unit test setup plus a smoke test entry point. Step 2 should extend the unit suite rather than invent a new test stack.

---

## Step 2 Outcome

At the end of this step:

- `Stencil: List Templates` shows a real Quick Pick backed by `stencil.list()`
- templates are easy to scan by collection
- each item shows the template name, human-readable description, and source visibility
- selecting a template opens the corresponding `.md` file in the editor
- empty-list and cancellation paths behave deliberately
- malformed template and storage failures surface through the shared error handler
- the existing unit/smoke test setup still passes

**Demonstrable user flow for this step:**

1. Open a workspace containing `.stencil/` templates.
2. Run `Stencil: List Templates`.
3. A Quick Pick appears, grouped by collection.
4. Select a template.
5. The template file opens in the editor.

---

## Validation Gates

**Baseline validation before editing:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Validation during Steps 2.1 through 2.4:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Validation after command and tests land:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Manual validation in the Extension Development Host:**

1. Open a workspace with several `.stencil/` templates across root templates and collections.
2. Run `Stencil: List Templates`.
3. Confirm the Quick Pick shows grouped entries and readable metadata.
4. Select one project template and confirm the editor opens the correct file.
5. Repeat with a global-only template if one is available and confirm the source metadata is visible.
6. Try a workspace with `.stencil/` present but no templates and confirm the command shows an explicit empty-state message.

---

## Implementation Sequence

### Step 2.1 — Freeze The Picker Contract Against Current Core Output

**Objective:** Lock the Quick Pick item shape before editing code so the command, tests, and future Step 3 reuse all target the same behavior.

**Files:** no production edits yet

**Actions:**

1. Confirm Step 2 will consume `await stencil.list()` directly and will not add adapter-side filtering yet.
2. Lock the Quick Pick presentation to this structure:
   - separator items for each group
   - template item `label`: `frontmatter.name`
   - template item `detail`: `frontmatter.description`
   - template item `description`: source marker such as `project` or `global`
3. Lock group names to:
   - collection name for collection-backed templates
   - `Templates` for root-level uncategorized templates
4. Preserve core ordering within each group instead of re-sorting by a new algorithm.
5. Record that duplicate names should not appear because core already applies project-over-global precedence.

**Why this matters:** it keeps the Step 2 implementation small and gives Step 3 a reusable selector contract instead of a one-off list command UI.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** there is one explicit, testable picker contract for mapping `Template` objects to VS Code items.

---

### Step 2.2 — Add A Reusable Template Quick Pick Mapping Service

**Objective:** move template-to-UI mapping out of the command so the selection flow can be reused later by `runTemplate.ts`.

**Files to add:**

- `packages/vscode-extension/src/services/templateQuickPick.ts`

**Files to change:**

- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Add extension-local item types for:
   - a selectable template Quick Pick item carrying the resolved `Template`
   - any narrow union needed to distinguish separators from template rows in tests
2. Implement a pure mapping helper that:
   - accepts `Template[]`
   - emits separator rows grouped by collection / root templates
   - emits template rows with the locked `label`, `description`, and `detail` fields
3. Keep the helper deterministic and side-effect free so unit tests can assert exact output order.
4. Do not make this helper open documents or show VS Code UI; it should only build item data.

**Implementation notes to lock:**

- Use a service/helper file rather than embedding mapping logic into `listTemplates.ts`.
- Keep source display concise. `project` and `global` are enough for Step 2.
- Do not add icons, buttons, favorites, search state, or recently-used behavior.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** a future command can reuse the same selector items without duplicating formatting logic.

---

### Step 2.3 — Replace The Placeholder List Command With The Real Browse Flow

**Objective:** deliver the first complete end-to-end GUI browse path.

**Files to change:**

- `packages/vscode-extension/src/commands/listTemplates.ts`

**Actions:**

1. Keep `registerListTemplatesCommand()` on the existing `registerWorkspaceCommand()` wrapper.
2. Replace the placeholder information message with this command flow:
   - call `await stencil.list()`
   - if the returned list is empty, show a deliberate informational empty-state message and stop
   - map templates to Quick Pick items through `templateQuickPick.ts`
   - call `window.showQuickPick()` with a clear placeholder title
   - if the user cancels, exit quietly
   - if the user selects a template item, open the file in the editor
3. Open the selected file with:
   - `workspace.openTextDocument(selected.template.filePath)`
   - `window.showTextDocument(document)`
4. Let thrown core/storage/parser errors bubble into the existing shared error handler.
5. Do not add side behavior such as:
   - auto-preview
   - notifications after open
   - tree refreshes
   - command arguments
   - template mutation

**Why this sequence:** it keeps the command thin and aligns with the Epic 1 requirement that browse flow be real but simple.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** `Stencil: List Templates` is functionally usable from the Command Palette.

---

### Step 2.4 — Add Unit Coverage For Mapping, Empty State, Selection, And Cancellation

**Objective:** verify the new behavior without relying only on manual F5 testing.

**Files to add:**

- `packages/vscode-extension/test/unit/services/templateQuickPick.test.ts`
- `packages/vscode-extension/test/unit/commands/listTemplates.test.ts`

**Files to change:**

- `packages/vscode-extension/test/unit/extension.test.ts`

**Actions:**

1. Add pure mapping tests for `templateQuickPick.ts` that verify:
   - separators are inserted correctly
   - uncategorized templates appear under `Templates`
   - template rows preserve the expected order
   - description and source metadata map to the intended fields
2. Add command tests for `listTemplates.ts` that verify:
   - `stencil.list()` is called once for a valid workspace
   - an empty template list shows the empty-state information message
   - a selected item opens the expected file path
   - a cancelled Quick Pick does not open a file
   - command errors still route through the shared wrapper behavior
3. Update the extension registration test only if needed to keep module imports aligned after adding the new service.
4. Keep these as unit tests with mocked `vscode`; do not add a new smoke scenario unless the existing smoke test breaks.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the browse flow is covered at the service and command layers with stable automated tests.

---

### Step 2.5 — Update Extension Documentation To Match The New Real Behavior

**Objective:** keep the extension package docs aligned with the first usable browse command.

**Files to change:**

- `packages/vscode-extension/README.md`

**Actions:**

1. Replace any placeholder wording that says template listing is deferred.
2. Document the actual Step 2 behavior:
   - `Stencil: List Templates` shows a grouped Quick Pick
   - selecting a template opens the file
3. Keep the README scoped to current truth only. Do not document Step 3+ behavior early.

**Validation:**

```bash
pnpm --filter stencil-vscode build
```

**Completion gate:** the package README matches the implemented MVP browse flow.

---

## Step Exit Checklist

Step 2 is complete when all of the following are true:

- `src/commands/listTemplates.ts` no longer shows the placeholder deferred-work message
- templates are listed from real core data via `stencil.list()`
- the Quick Pick is grouped by collection using standard VS Code UI only
- template name, description, and source metadata are visible without opening the file
- selecting an item opens the correct template document
- empty-list and cancel paths behave deliberately
- existing workspace/setup guardrails still work through `registerWorkspaceCommand()`
- `pnpm --filter stencil-vscode typecheck`
- `pnpm --filter stencil-vscode build`
- `pnpm --filter stencil-vscode test`

---

## Explicit Non-Goals

These items should be rejected during Step 2 implementation review unless a hidden dependency appears:

- running templates from the list picker
- collecting placeholder values
- Webview-based forms
- tree-based browsing beyond the current placeholder provider
- template search/filter options beyond native Quick Pick typing
- preview panels or output tabs
- diagnostics, syntax highlighting, CodeLens, or decorations
- collection management, rename, copy, delete, or drag-and-drop
- Claude Code extension integration
