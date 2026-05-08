# Plan: Epic 1 Step 5 — Create Template Flow

**Goal:** Replace the current placeholder `Stencil: Create Template` command with a real MVP authoring flow that can initialize `.stencil/` for first-time users, collect the minimum safe metadata through native VS Code prompts, create the template through `@stencil-pm/core`, open the saved file in the editor, and leave the user in a good position to finish editing the prompt body.

**Primary inputs:**

- `docs/plans/15-epic-1-vscode-extension-mvp.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `packages/vscode-extension/*`
- `packages/core/*`

**This document plans Step 5 only.** It does not implement Tree View browsing, syntax highlighting, diagnostics, autocomplete, create-from-selection, template editing, collection CRUD, typed placeholder UX, or any Claude Code / cross-extension integrations.

---

## Locked Scope For This Step

These decisions from `15-epic-1-vscode-extension-mvp.md` must remain true while implementing this step:

- Keep Epic 1 on the Phase 2 MVP surface only.
- Use direct `@stencil-pm/core` imports through the extension’s local core bridge.
- Keep output and authoring flow extension-local; no custom editor, preview panel, or Webview.
- Prefer lazy initialization over a required separate init command.
- Keep tree behavior browser-only; do not pull collection management or delete/rename flows forward.
- Keep orchestration out of `extension.ts`; use command/service helpers.

Additional Step 5 decisions to lock before editing:

- Keep the wizard intentionally small: `name`, `description`, optional tags, collection choice, and an initial body seed or scaffold only.
- Do not add a placeholder-definition wizard in this step. Users can add frontmatter placeholders manually after the file opens.
- Do not add “create from selection”, “save current conversation”, “duplicate existing template”, or “new collection” flows here.
- Do not attempt multiline body authoring inside modal prompts. Use the parent epic’s allowed scaffold-body fallback instead of forcing a poor `InputBox` experience.
- Keep all duplicate-name handling safe and explicit. The extension must not rely on `Stencil.create()` alone because the current core write path can overwrite an existing project template if the name already exists.

### Critical contract decision to lock before editing

The parent epic requires the create flow to offer both:

- an existing collection choice
- an uncategorized/root-template choice

However, the current core API does this inside `Stencil.create()`:

- `collection ?? runtimeConfig.defaultCollection`

That means the extension cannot currently force an uncategorized save when `.stencil/config.yaml` defines `default_collection`.

**Recommended lock for Step 5:** make one small core contract change so `Stencil.create()` accepts `null | string | undefined` semantics:

- `undefined`: use workspace default collection if configured
- `string`: save into that collection
- `null`: force uncategorized save under `.stencil/templates/`

Without that change, the UI cannot honestly offer an “Uncategorized” choice in every workspace state.

---

## Repo Facts That Affect The Plan

- Step 1 through Step 4 foundations already exist in `packages/vscode-extension`:
  - `src/commands/shared.ts` resolves workspace, checks setup by default, and routes errors through `showCommandError()`
  - `src/services/getStencil.ts` caches a `Stencil` instance per workspace root
  - `src/services/templateQuickPick.ts`, `src/services/runTemplateTarget.ts`, `src/services/output.ts`, and `src/services/placeholderInput.ts` already establish the repo’s service-oriented extension structure
- `src/commands/createTemplate.ts` is still a placeholder informational command.
- `registerWorkspaceCommand()` already supports `requireStencilSetup?: boolean`, so Step 5 can let `Create Template` run before `.stencil/` exists without weakening `Run` or `List`.
- `src/providers/templateTreeProvider.ts` still returns placeholder rows only, but it already distinguishes the “missing `.stencil/`” state from the “future browsing” state. A refresh hook would therefore have visible value immediately after first-time creation.
- `Stencil.init()` creates `.stencil/templates/` and is safe to call repeatedly.
- `Stencil.collections.listCollections()` returns `[]` when `.stencil/collections/` does not exist, which fits the Step 5 first-time flow.
- `Stencil.create(frontmatter, body, collection?)` validates and saves the new template, but the current implementation does not preflight project-name collisions before writing.
- `Stencil.get(name)` returns both project and global templates, which gives the extension enough information to block accidental overwrite or confusing shadowing before save.
- The core storage layout is already fixed:
  - uncategorized templates save under `.stencil/templates/<name>.md`
  - collection templates save under `.stencil/collections/<collection>/<name>.md`
- The core validator enforces:
  - template `name` must be kebab-case
  - `description` must be present
  - `version` must be a positive integer
  - placeholder rules only matter if Step 5 chooses to populate them, which it should not
- The extension test suite currently covers:
  - `listTemplates`
  - `runTemplate`
  - shared services and providers
  - there is no `createTemplate` unit coverage yet

---

## Step 5 Outcome

At the end of this step:

- `Stencil: Create Template` runs even in a workspace that does not yet contain `.stencil/`
- the command walks the user through a small native VS Code wizard
- first-time users do not need terminal bootstrap because the command calls `stencil.init()` before create/save
- template names are prevalidated for kebab-case and blocked on visible collisions before any write occurs
- users can choose an existing collection or save uncategorized
- the command saves through `stencil.create()`
- the new `.md` file opens immediately in the editor
- the tree provider can refresh after creation so first-time empty-state text updates immediately
- `Stencil: List Templates` shows the new template on the next invocation
- the unit and smoke test baseline remains green

**Demonstrable user flow for this step:**

1. Open a workspace with or without an existing `.stencil/` directory.
2. Run `Stencil: Create Template`.
3. Answer the metadata prompts.
4. The extension initializes `.stencil/` if needed, creates the template file, and opens it in the editor.
5. Run `Stencil: List Templates` and confirm the new template appears.

---

## Validation Gates

**Baseline validation before editing:**

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Validation during Steps 5.1 through 5.6:**

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Validation after command and tests land:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Manual validation in the Extension Development Host:**

1. Open a workspace with no `.stencil/` directory and run `Stencil: Create Template`.
2. Create an uncategorized template and confirm:
   - `.stencil/templates/<name>.md` is created
   - the file opens automatically
3. Repeat in a workspace that already has collections and confirm the selected collection path is used.
4. Repeat with a duplicate template name and confirm the command stops before writing.
5. Repeat with an invalid template name and confirm inline prompt validation blocks submission.
6. If `.stencil/config.yaml` defines `default_collection`, verify both:
   - selecting the default-target option saves into that collection
   - selecting uncategorized really saves under `.stencil/templates/`

---

## Implementation Sequence

### Step 5.1 — Lock The Create Contract Against Current Core Behavior

**Objective:** resolve the two hidden mismatches before touching the command: uncategorized-vs-default collection behavior, and unsafe duplicate handling.

**Files:** no production edits yet

**Actions:**

1. Record that Step 5 will not use the shared setup gate:
   - `registerWorkspaceCommand({ requireStencilSetup: false, ... })`
2. Lock the creation safety rule:
   - preflight with `stencil.get(name)`
   - block creation if any visible template already uses that name
   - treat both project and global collisions as conflicts in MVP to avoid overwrite or accidental shadowing
3. Lock the collection-choice contract:
   - existing collections
   - workspace default collection, if configured
   - uncategorized/root templates
4. Decide how to represent collection choice across the extension boundary:
   - explicit collection name
   - explicit uncategorized sentinel
   - optional “use workspace default” sentinel if the wizard exposes that separately
5. Lock the body-authoring contract:
   - collect at most a lightweight initial body seed in prompts
   - save a scaffold body
   - immediately open the file for real multiline editing

**Why this matters:** without these decisions, the implementation will either mis-handle configured default collections or inherit unsafe overwrite behavior from the current core create path.

**Validation:**

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the team has one unambiguous contract for name collisions, first-time setup, collection choice, and body scaffolding.

---

### Step 5.2 — Patch The Core Create Contract So “Uncategorized” Is Actually Possible

**Objective:** make the core API capable of the exact create choices the Step 5 wizard must present.

**Files to change:**

- `packages/core/src/stencil.ts`

**Files to add or change for tests:**

- targeted core tests around `Stencil.create()` collection behavior

**Actions:**

1. Update `Stencil.create()` so the `collection` argument can distinguish:
   - `undefined` → apply `runtimeConfig.defaultCollection` if present
   - `string` → save into that collection
   - `null` → save uncategorized even when `defaultCollection` exists
2. Keep the storage-layer contract unchanged:
   - `Template.collection === undefined` means save under `.stencil/templates/`
3. Add or update core tests that prove:
   - no explicit collection still respects `defaultCollection`
   - `null` bypasses `defaultCollection`
   - explicit collection name still wins over config default
4. Do not widen this into collection CRUD or config changes; this is only a create-path contract fix.

**Why here:** the extension wizard should not carry misleading UI or adapter-side hacks for something the core can model cleanly.

**Validation:**

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test
```

**Completion gate:** the extension can truthfully offer uncategorized saves even when a workspace default collection exists.

---

### Step 5.3 — Add Create-Wizard Types And Pure Input Normalization Helpers

**Objective:** keep parsing and validation logic out of `createTemplate.ts` so the wizard behavior is testable without heavy VS Code mocks.

**Files to add:**

- `packages/vscode-extension/src/services/createTemplateWizard.ts`

**Files to change:**

- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Add extension-local types for the create flow, for example:
   - `CreateTemplateDraft`
   - `CreateTemplateCollectionChoice`
   - `CreateTemplateWizardResult`
2. Add pure helpers for:
   - trimming and normalizing the template name
   - parsing comma-separated tags into a deduplicated `string[]`
   - constructing collection picker items from `stencil.collections.listCollections()`
   - generating the initial scaffold body
3. Mirror only the minimum local validation needed for prompt UX:
   - name required
   - kebab-case name format
   - description required
4. Keep core as the final authority:
   - local prompt validation improves UX
   - `stencil.create()` still remains the final validation boundary
5. Keep scaffold generation intentionally simple, for example:
   - if the user provided a body seed, place it in the body
   - otherwise create a short editable placeholder body such as `Write the prompt body here.`
6. Do not parse `{{placeholder}}` tokens into frontmatter in this step.

**Implementation notes to lock:**

- If tags are omitted or normalize to an empty list, omit `tags` from frontmatter rather than saving `tags: []`.
- Set `version: 1` automatically in the extension; do not prompt for it.
- Do not prompt for `author`.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the create wizard has a deterministic, testable data model before VS Code UI is wired in.

---

### Step 5.4 — Implement The Native VS Code Create Wizard

**Objective:** turn `createTemplate.ts` into a real command flow that collects metadata, initializes Stencil on demand, and writes the template safely.

**Files to change:**

- `packages/vscode-extension/src/commands/createTemplate.ts`

**Files to reuse:**

- `packages/vscode-extension/src/commands/shared.ts`
- `packages/vscode-extension/src/services/createTemplateWizard.ts`

**Actions:**

1. Register the command with:
   - `requireStencilSetup: false`
2. Implement the prompt sequence in this order:
   - template name
   - description
   - optional tags
   - collection choice
   - optional initial body seed
3. Use `showInputBox()` validation for:
   - empty name
   - non-kebab-case name
   - empty description
4. Use `stencil.collections.listCollections()` to build the collection picker:
   - include an uncategorized option
   - include existing collection options
   - include a workspace-default option only if the product decision from Step 5.1 chooses to expose it explicitly
5. Before any write:
   - call `stencil.get(name)`
   - if a template already exists, stop with an informational or error message that names the conflict and its source
6. Only after the wizard completes successfully:
   - call `await stencil.init()`
   - call `await stencil.create(frontmatter, body, collectionChoice)`
7. Open the returned file path with:
   - `workspace.openTextDocument(createdTemplate.filePath)`
   - `window.showTextDocument(document)`
8. Show one short success message after the editor opens.
9. Respect cancellation at every prompt:
   - cancel silently or with one short informational message
   - do not create `.stencil/` and do not write files when the user cancels before confirmation

**Why this sequence:** it avoids side effects on cancelled flows, keeps the wizard thin, and satisfies the Epic 1 requirement that first-time users can create a template without terminal setup.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** `Stencil: Create Template` is functionally usable from the Command Palette in both first-time and already-initialized workspaces.

---

### Step 5.5 — Add A Tree Refresh Hook And Wire It Into Successful Create

**Objective:** make post-create UI state update cleanly without waiting for a full extension reload.

**Files to change:**

- `packages/vscode-extension/src/providers/templateTreeProvider.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/commands/createTemplate.ts`

**Actions:**

1. Add an `EventEmitter`-backed `refresh()` method to `TemplateTreeProvider`.
2. Switch extension activation from inline provider construction to one shared provider instance stored in `extension.ts`.
3. Pass that provider instance into `registerCreateTemplateCommand()` or otherwise expose a narrow refresh hook.
4. After a successful create, call `templateTreeProvider.refresh()`.
5. Keep Step 5’s refresh expectations modest:
   - no tree-item selection logic
   - no reveal/focus behavior
   - no extra list cache invalidation, because `List Templates` is command-driven and stateless

**Why this still matters before Step 6:** the first-time create path changes the tree’s empty-state condition immediately, so a refresh has visible value even before real template browsing lands.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** successful creation updates extension UI state without requiring VS Code restart or extension reload.

---

### Step 5.6 — Add Unit Coverage For First-Time Init, Happy Path, Collision Safety, And Validation

**Objective:** verify the new create flow with the same testing discipline already used by Steps 2 through 4.

**Files to add:**

- `packages/vscode-extension/test/unit/commands/createTemplate.test.ts`
- `packages/vscode-extension/test/unit/services/createTemplateWizard.test.ts`

**Files to change:**

- `packages/vscode-extension/test/unit/extension.test.ts`
- core tests if Step 5.2 changed the `Stencil.create()` contract

**Actions:**

1. Add pure helper tests for:
   - tag parsing
   - collection choice item building
   - scaffold body generation
   - name/description normalization
2. Add command tests for:
   - first-time create path with `requireStencilSetup: false`
   - `stencil.init()` called before `stencil.create()`
   - successful create opens the returned file path
   - command cancellation before write
   - invalid name blocked at prompt validation
   - duplicate name stops before `stencil.init()` or `stencil.create()`
   - core validation/storage failures still route through `showCommandError()`
3. If Step 5.5 changes activation wiring, update extension activation tests to assert:
   - the create command still registers
   - the tree provider is still registered
4. If Step 5.2 changed core contract, add the focused core tests there instead of trying to simulate the behavior only from the extension layer.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode test
```

**Completion gate:** Step 5 behavior is covered at both the pure-helper and command-orchestration layers.

---

## Suggested File List

**Expected extension updates:**

- `packages/vscode-extension/src/commands/createTemplate.ts`
- `packages/vscode-extension/src/providers/templateTreeProvider.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/types.ts`

**Recommended new extension files:**

- `packages/vscode-extension/src/services/createTemplateWizard.ts`
- `packages/vscode-extension/test/unit/commands/createTemplate.test.ts`
- `packages/vscode-extension/test/unit/services/createTemplateWizard.test.ts`

**Expected core updates if the uncategorized contract is fixed now:**

- `packages/core/src/stencil.ts`
- corresponding core tests for `create()` collection behavior

---

## Step 5 Exit Criteria

- `Stencil: Create Template` works in a workspace that does not already contain `.stencil/`.
- The command collects the intended MVP metadata through native VS Code prompts.
- Duplicate template names are blocked before any write occurs.
- Users can save into an existing collection or save uncategorized.
- The template is created through `stencil.create()` and opened in the editor immediately.
- Post-create UI state refreshes cleanly.
- Core and extension validation suites pass.
