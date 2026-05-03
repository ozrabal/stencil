# Plan: Epic 1 — VS Code Extension MVP

**Goal:** Deliver the first GUI adapter for Stencil so a VS Code user can browse templates, run them, and create basic templates without using the terminal.

**Primary source documents:**

- `docs/epics/03-next-functional-epics.md`
- `docs/stencil-prd.md`
- `docs/stencil-architecture.md`

**Scope boundary:** Plan only the Phase 2 / Epic 1 VS Code MVP surface:

- command registration and activation
- `Run`, `Create`, and `List` commands
- Quick Pick template selection
- sequential placeholder input flow
- sidebar Tree View for templates and collections
- basic syntax support for template files
- direct reuse of `@stencil-pm/core` for template discovery, creation, validation, and resolution

Keep these out of scope for this epic even if the architecture document mentions them:

- Webview placeholder forms
- live preview panels
- CodeLens
- diagnostics
- autocomplete
- Claude Code VS Code integration
- status bar UI
- remote templates
- Codex adapter work

**Important repo-specific note:** `packages/vscode-extension/` already exists, but it is still a scaffold. `src/extension.ts`, `src/commands/*.ts`, `src/providers/*.ts`, and `src/core/index.ts` are stubs. The core package is already implemented and should remain the single source of truth for template/state logic.

**Required by planning notes:**

- Break the work into thin vertical slices with a demonstrable user flow at the end of each slice.
- Treat advanced template language work as out of scope for this epic.
- Do not start Codex or remote collaboration work before the VS Code MVP flow is stable.

**Prerequisites:**

1. Install workspace dependencies if they are not already installed.
2. Confirm the current core baseline is green before editing the adapter.
3. Confirm the VS Code extension scaffold builds before adding behavior.

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

Expected before starting:

- `@stencil-pm/core` passes typecheck and tests
- `stencil-vscode` typechecks and bundles successfully

**Per-step validation default:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Validation rule after test harness lands in Step 1:**

```bash
pnpm --filter stencil-vscode test
```

**Recommended final validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
pnpm lint
```

---

## Current Repo State

- `packages/vscode-extension/package.json` currently contributes only three commands:
  - `stencil.runTemplate`
  - `stencil.createTemplate`
  - `stencil.listTemplates`
- The extension currently activates on `onStartupFinished`, not on Stencil-specific commands or template files.
- `packages/vscode-extension/src/extension.ts` has no command or provider registration yet.
- `packages/vscode-extension/src/commands/runTemplate.ts`, `createTemplate.ts`, and `listTemplates.ts` are TODO stubs.
- `packages/vscode-extension/src/providers/templateTreeProvider.ts` and `contextResolver.ts` are TODO stubs.
- `packages/vscode-extension/src/core/index.ts` is a placeholder for the core import/re-export strategy.
- The extension package does not currently expose a `test` script or a VS Code extension test harness.
- `@stencil-pm/core` already exposes the needed facade shape:
  - `Stencil.init()`
  - `Stencil.create()`
  - `Stencil.list()`
  - `Stencil.get()`
  - `Stencil.resolve()`
  - `Stencil.collections.listCollections()`
- The architecture document describes richer VS Code features across later phases. Epic 1 should implement only the MVP subset from `docs/epics/03-next-functional-epics.md` and PRD Phase 2.

---

## Target Behavior

After this epic:

- A user can trigger `Stencil: List Templates` and browse project/global templates from a Quick Pick.
- A user can trigger `Stencil: Run Template`, choose a template, fill missing values sequentially with Input Boxes, and receive the resolved prompt in VS Code without using the terminal.
- A user can trigger `Stencil: Create Template`, answer a small wizard, and get a saved `.md` template opened in the editor.
- A user can browse templates and collections in a sidebar Tree View and run or open a template from that view.
- Template files under `.stencil/` have basic placeholder-aware syntax support.
- All template parsing, validation, creation, discovery, config, collections, and resolution behavior comes from `@stencil-pm/core`, not duplicated extension logic.
- Errors surface as actionable VS Code messages rather than silent failures or raw stack traces.

---

## Decisions To Lock Before Editing

### 1. Keep Epic 1 strictly on the Phase 2 MVP surface

The architecture doc includes Webviews, preview panels, diagnostics, and CodeLens, but the epic and PRD Phase 2 MVP do not require them. Do not pull those features forward. They belong to Epic 5 or later.

### 2. Use direct `@stencil-pm/core` imports, not shell scripts

The VS Code adapter is in-process TypeScript. It should instantiate `Stencil` directly and call the facade/API methods already in `packages/core`.

### 3. Use sequential Input Boxes for all manual placeholder collection in MVP

Even though the architecture doc sketches a Webview threshold for `3+` placeholders, Epic 1 explicitly calls for sequential placeholder input flow. For this epic:

- no placeholder UI Webview
- no preview panel
- one placeholder prompt at a time using `vscode.window.showInputBox()`

This keeps the MVP thin and aligned to the scope document.

### 4. Keep output delivery simple and extension-local

Do not depend on the Claude Code extension for MVP success. The safest MVP delivery target is:

- open the resolved prompt in a new editor tab

Clipboard support may be added as a small convenience, but it should not become a cross-extension dependency.

### 5. Prefer lazy initialization over a new required command

Epic 1 scope names `Run`, `Create`, and `List`, not a dedicated init command. The adapter should not require terminal setup. Recommended behavior:

- `Create` calls `stencil.init()` before saving
- `List` and `Tree View` handle missing `.stencil/` gracefully
- add `Stencil: Initialize` only if implementation pressure makes it clearly necessary

### 6. Tree View is a browser, not a management UI, in MVP

The tree should show:

- collections
- uncategorized templates
- template source if useful

Do not add collection CRUD, drag-and-drop, rename, copy, or delete flows in this epic.

### 7. Syntax support should be intentionally minimal

The requirement is basic `{{placeholder}}` syntax highlighting in template files. The MVP should stop at:

- file/language contribution for `.stencil/**/*.md`
- placeholder token highlighting
- preserving Markdown readability

Do not add autocomplete, diagnostics, or semantic analysis in this epic.

### 8. Centralize extension-side orchestration

Avoid putting UI logic directly into `extension.ts`. Add small adapter-side helpers so command handlers stay thin. Recommended shape:

- `src/core/index.ts` for core imports and factory helpers
- `src/providers/contextResolver.ts` for VS Code-specific context provider
- `src/services/` or `src/lib/` for shared UI/orchestration helpers

This keeps later Epic 5 work from needing a rewrite.

---

## Recommended Files To Change

Expected updates:

- `packages/vscode-extension/package.json`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/core/index.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/commands/createTemplate.ts`
- `packages/vscode-extension/src/commands/listTemplates.ts`
- `packages/vscode-extension/src/providers/templateTreeProvider.ts`
- `packages/vscode-extension/src/providers/contextResolver.ts`
- `packages/vscode-extension/README.md`

Recommended new files:

- `packages/vscode-extension/src/commands/shared.ts`
- `packages/vscode-extension/src/services/getStencil.ts`
- `packages/vscode-extension/src/services/templateQuickPick.ts`
- `packages/vscode-extension/src/services/placeholderInput.ts`
- `packages/vscode-extension/src/services/output.ts`
- `packages/vscode-extension/src/services/errors.ts`
- `packages/vscode-extension/src/types.ts`
- `packages/vscode-extension/test/**/*.test.ts`
- `packages/vscode-extension/test/runTest.ts`
- `packages/vscode-extension/syntaxes/stencil-template.tmLanguage.json`
- `packages/vscode-extension/language-configuration.json`

The exact helper filenames can vary, but the plan should preserve the separation between:

- extension bootstrap
- command handlers
- providers
- shared UI helpers
- test harness

---

## Implementation Steps

## Step 1 — Extension Foundation And Test Harness

**Objective:** Replace the empty scaffold with a real extension bootstrap that can instantiate core, register commands, and be validated in isolation.

**Changes:**

1. Wire `src/core/index.ts` to import and re-export `Stencil` and any core types needed by the adapter.
2. Implement a small extension-side factory that:
   - resolves the active workspace root
   - creates one `Stencil` instance per active workspace session
   - registers `VSCodeContextProvider`
3. Implement `contextResolver.ts` as the adapter-provided `ContextProvider` for:
   - `active_file`
   - `active_selection`
   - `workspace_folders`
   - `active_language_id`
   - `diagnostics_count`
4. Replace `onStartupFinished`-only activation with command/file/view-friendly activation events in `package.json`.
5. Register the three MVP commands in `extension.ts`.
6. Add a test harness for the extension package:
   - `test` script in `package.json`
   - unit tests with mocked `vscode`
   - one `@vscode/test-electron` smoke entry point, even if it initially only verifies activation
7. Add shared error-to-message handling so command handlers can surface `StencilError` cleanly.

**Why first:** Every later slice depends on clean core wiring, a stable activation model, and a way to verify the extension package without only using manual F5 testing.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Demonstrable user flow:**

1. Open a workspace in the Extension Development Host.
2. Run `Stencil: List Templates`.
3. The extension activates successfully and shows an actionable empty-state or missing-setup message instead of failing silently.

**Exit for this step:**

- extension activates reliably
- commands are registered
- `VSCodeContextProvider` exists
- extension test command exists and passes

---

## Step 2 — List Command And Quick Pick Browse Flow

**Objective:** Deliver the first complete user flow: browse available templates from VS Code without touching the terminal.

**Changes:**

1. Implement `listTemplates.ts` using `stencil.list()`.
2. Convert returned templates into Quick Pick items that show:
   - template name
   - description
   - collection
   - source (`project` / `global`) if useful
3. Sort/group presentation so the list is easy to scan. Keep formatting simple; do not build custom UI.
4. On selection, open the underlying template file in the editor.
5. Handle these states explicitly:
   - no workspace open
   - no `.stencil/` directory yet
   - no templates found
   - malformed template / core error
6. Add unit tests for:
   - mapping templates to Quick Pick items
   - empty state handling
   - successful open-file flow

**Thin slice outcome:** This is the first end-to-end GUI browse flow and validates that core discovery works correctly inside the extension host.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Demonstrable user flow:**

1. Open a workspace containing `.stencil/` templates.
2. Run `Stencil: List Templates`.
3. A Quick Pick appears with the available templates.
4. Select one template.
5. The template file opens in the editor.

**Exit for this step:**

- list command is fully usable
- Quick Pick browsing is real, not placeholder UI

---

## Step 3 — Run Command For No-Input And Context-Only Templates

**Objective:** Ship the first true execution flow before adding manual placeholder prompting.

**Changes:**

1. Implement `runTemplate.ts` so it can:
   - accept a template name from a command argument, tree item, or current file context
   - fall back to the same Quick Pick selector from Step 2 when no template is preselected
2. Use `stencil.resolve(templateName, explicitValues)` with an initially empty explicit map.
3. If the template resolves with `unresolvedCount === 0`, open the resolved prompt in a new editor tab.
4. Add a clear summary notification after success:
   - template name
   - where output was delivered
5. Add tests for:
   - running a template with no placeholders
   - running a template where defaults and `$ctx.*` satisfy all placeholders
   - command argument path vs Quick Pick path

**Why before manual input:** This keeps the execution slice thin and proves the adapter can already run a meaningful class of templates using core defaults and context resolution.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Demonstrable user flow:**

1. Run `Stencil: Run Template`.
2. Pick a template that uses only defaults and/or `$ctx.*`.
3. The resolved prompt opens in a new editor tab.

**Exit for this step:**

- run command works for zero-manual-input templates
- output delivery path is stable

---

## Step 4 — Sequential Placeholder Input Flow

**Objective:** Complete the MVP execution path for templates that need user-supplied values.

**Changes:**

1. Add a shared placeholder prompting helper that:
   - inspects template frontmatter placeholders
   - calls `stencil.resolve()` to learn which values are already satisfied by context/defaults/explicit input
   - prompts only for unresolved placeholders
2. Use `showInputBox()` sequentially, one placeholder at a time.
3. For each prompt:
   - show the placeholder name and description
   - prefill with the default when present
   - allow cancellation to abort the run cleanly
4. Re-run `stencil.resolve()` after collecting inputs and only continue when `unresolvedCount === 0`.
5. Surface meaningful messages for:
   - cancellation
   - validation or parse errors from core
   - still-unresolved placeholders after prompting
6. Add tests for:
   - one required placeholder
   - multiple sequential prompts
   - defaults prefilled into input boxes
   - cancel halfway through the flow

**Important constraint:** Do not implement pre-execution confirmation or dry-run UI here. Those belong to later work. Epic 1 only needs sequential collection and successful resolution.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Demonstrable user flow:**

1. Run `Stencil: Run Template`.
2. Pick a template with required placeholders missing.
3. The extension prompts one field at a time.
4. After the last answer, the resolved prompt opens in a new editor tab.

**Exit for this step:**

- Epic 1’s core run flow is functionally complete

---

## Step 5 — Create Template Flow

**Objective:** Let a VS Code user create a basic template entirely through the extension.

**Changes:**

1. Implement `createTemplate.ts` as a small wizard using Input Boxes and Quick Picks.
2. Before saving, call `stencil.init()` so first-time users do not need a terminal setup step.
3. Collect the minimum viable template fields:
   - `name`
   - `description`
   - optional tags
   - optional collection choice from existing collections, or uncategorized
   - initial body text
4. Keep the MVP authoring flow intentionally basic:
   - do not build a custom editor
   - do not implement “create from selection” or “save current conversation”
5. Save through `stencil.create()`.
6. Open the saved file in the editor after creation.
7. Refresh any tree/list state after save.
8. Add tests for:
   - first-time initialization path
   - successful template creation
   - invalid name or core validation error

**Design note:** If body collection in Input Box proves too awkward, the acceptable MVP fallback is:

- create a scaffold body
- save the file
- open it immediately for manual editing

That still satisfies the epic exit criterion of basic template creation without using the terminal.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Demonstrable user flow:**

1. Run `Stencil: Create Template`.
2. Answer the wizard prompts.
3. The extension creates `.stencil/.../<name>.md`.
4. The new file opens in the editor.
5. `Stencil: List Templates` now shows the new template.

**Exit for this step:**

- users can create basic templates from VS Code
- terminal bootstrap is no longer required for normal MVP usage

---

## Step 6 — Sidebar Tree View For Collections And Templates

**Objective:** Deliver persistent visual browsing in the Explorer sidebar.

**Changes:**

1. Extend `package.json` contributions with:
   - a view container or Explorer view entry
   - item context menus for template nodes
2. Implement `TemplateTreeProvider` backed by `stencil.list()` and `stencil.collections.listCollections()`.
3. Model tree nodes as:
   - collection nodes
   - uncategorized grouping node if needed
   - template leaf nodes
4. Add template item actions:
   - open template
   - run template
   - refresh tree
5. Refresh the tree after:
   - create
   - successful run only if metadata changes are tracked later
   - manual refresh command
6. Add tests for:
   - node shaping/grouping
   - tree refresh behavior
   - context value assignment for template items

**Scope guard:** This is a browsing surface only. Do not add collection management or destructive actions in this epic.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Demonstrable user flow:**

1. Open the Stencil tree in the Explorer sidebar.
2. Expand a collection.
3. Click a template to open it, or use the context action to run it.

**Exit for this step:**

- tree browsing matches the Epic 1 scope
- list and tree flows both work from the same core data

---

## Step 7 — Basic Template Syntax Support

**Objective:** Make `.stencil/` template files visually readable enough for MVP authoring.

**Changes:**

1. Add a minimal language contribution for Stencil template files.
2. Preserve Markdown behavior while highlighting placeholder tokens.
3. Add a simple TextMate grammar or equivalent minimal highlighting strategy for:
   - YAML frontmatter fences
   - `{{placeholder}}` tokens
   - `{{$ctx.*}}` tokens
4. Scope the contribution to template files under `.stencil/` so ordinary Markdown files are unaffected.
5. Add a minimal smoke test or packaging assertion that the grammar contribution is present in the manifest.

**Implementation preference:** Prefer a small grammar contribution over ad hoc editor decorations. Decorations are better reserved for later richer authoring features.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Demonstrable user flow:**

1. Open a template in `.stencil/`.
2. `{{placeholder}}` and `{{$ctx.*}}` tokens are visibly distinguished from plain Markdown text.

**Exit for this step:**

- Epic 1’s basic syntax support requirement is satisfied

---

## Step 8 — MVP Stabilization, Docs, And Acceptance Pass

**Objective:** Close the epic with clear acceptance coverage and no hidden dependency on later epics.

**Changes:**

1. Review the extension manifest and remove any placeholder contributions that imply unsupported features.
2. Update `packages/vscode-extension/README.md` to document only shipped MVP behavior.
3. Add a short manual verification checklist for maintainers:
   - empty workspace
   - first-time create flow
   - list flow
   - run flow with defaults/context
   - run flow with sequential input
   - tree browse flow
   - syntax highlighting visible
4. Run one Extension Development Host smoke pass on macOS/Linux if available.
5. Confirm no new work leaked into:
   - Webviews
   - CodeLens
   - diagnostics
   - Claude Code extension integration
   - Codex adapter

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
pnpm lint
```

**Demonstrable user flow:**

1. Install or launch the extension in an Extension Development Host.
2. Create a template.
3. Browse it from the tree.
4. Run it through the sequential input flow.
5. See the resolved prompt in a new editor tab.

**Exit for this step:**

- Epic 1 exit criteria are met
- the adapter is stable enough to unblock Epic 2 without dragging in later-phase UX

---

## Acceptance Checklist

- `Stencil: Run Template` works from the Command Palette.
- `Stencil: Create Template` works without terminal setup.
- `Stencil: List Templates` shows templates in a Quick Pick.
- sequential placeholder input works through Input Boxes.
- sidebar Tree View shows collections and templates.
- template files under `.stencil/` have basic placeholder-aware syntax support.
- the adapter reuses `@stencil-pm/core` for template and state logic.
- no Epic 5+ UX work is required for the MVP to function.

---

## Risks And Mitigations

### 1. ESM/CJS interop between the extension bundle and `@stencil-pm/core`

**Risk:** `src/core/index.ts` is currently blocked on interop uncertainty.

**Mitigation:** Resolve this in Step 1 before any feature work. If needed, adjust the extension build config or import style once, centrally.

### 2. VS Code API mocking friction

**Risk:** Command/provider tests can become brittle if each file hand-rolls its own `vscode` mock.

**Mitigation:** Create one shared test utility layer in Step 1 and reuse it across command/provider tests.

### 3. Create-template body entry may be awkward in Input Boxes

**Risk:** Capturing multi-line body text interactively is clumsy.

**Mitigation:** Use a scaffold-body fallback for MVP and immediately open the saved file for editing.

### 4. Tree refresh drift after creates

**Risk:** Tree state can lag behind saved templates.

**Mitigation:** Make `TemplateTreeProvider` expose an explicit refresh event and call it from create/list flows.

### 5. Scope creep from architecture-only features

**Risk:** It is easy to drift into preview, Webviews, diagnostics, or Claude integration because the architecture already sketches them.

**Mitigation:** Treat those as explicit non-goals for Epic 1 and reject them during implementation review unless they are required to complete a listed MVP flow.

---

## Recommended Execution Order

1. Step 1 — Extension Foundation And Test Harness
2. Step 2 — List Command And Quick Pick Browse Flow
3. Step 3 — Run Command For No-Input And Context-Only Templates
4. Step 4 — Sequential Placeholder Input Flow
5. Step 5 — Create Template Flow
6. Step 6 — Sidebar Tree View For Collections And Templates
7. Step 7 — Basic Template Syntax Support
8. Step 8 — MVP Stabilization, Docs, And Acceptance Pass

This order preserves the planning note to ship thin, demonstrable slices:

- browse first
- then run
- then collect missing values
- then create
- then add persistent navigation
- then add minimal authoring polish
