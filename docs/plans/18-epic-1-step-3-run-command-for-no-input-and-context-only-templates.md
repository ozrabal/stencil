# Plan: Epic 1 Step 3 — Run Command For No-Input And Context-Only Templates

**Goal:** Replace the current placeholder `Stencil: Run Template` command with the first real execution flow: select or resolve a template, call `stencil.resolve()` with no manual inputs, and open the resolved prompt in a new editor tab when defaults and `$ctx.*` values are sufficient.

**Primary inputs:**

- `docs/plans/15-epic-1-vscode-extension-mvp.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `packages/vscode-extension/*`
- `packages/core/*`

**This document plans Step 3 only.** It does not implement sequential placeholder prompting, confirmation UI, dry-run mode, Tree View actions, syntax highlighting, preview panels, diagnostics, or Claude Code VS Code integration.

---

## Locked Scope For This Step

These decisions from `15-epic-1-vscode-extension-mvp.md` must remain true while implementing this step:

- Keep Epic 1 on the Phase 2 MVP surface only.
- Use direct `@stencil-pm/core` imports through the extension’s local core bridge.
- Keep output delivery extension-local and simple: open the resolved prompt in a new editor tab.
- Use sequential Input Boxes only in Step 4. Step 3 must not prompt manually for placeholder values.
- Do not introduce Webviews, preview panels, CodeLens, diagnostics, autocomplete, or cross-extension output targets.
- Keep orchestration out of `extension.ts`; put reusable logic in command/service helpers.

Additional Step 3 decisions to lock before editing:

- Reuse the Step 2 Quick Pick item contract from `src/services/templateQuickPick.ts` instead of building a second picker for run flow.
- Extend the existing `registerWorkspaceCommand()` wrapper to pass command arguments through, rather than bypassing the wrapper for `runTemplate.ts`.
- Treat the current-file path as a convenience resolver only when the active document is an actual Stencil template file already discoverable by `stencil.list()`.
- Do not try to infer placeholder values from editor selection, current file contents, or ad hoc heuristics in this step.
- If `stencil.resolve()` returns `unresolvedCount > 0`, stop with a clear informational message that manual placeholder collection is not available until the next step.
- Success notification should be concise and post-run only. No confirmation dialog before opening the resolved prompt.

---

## Repo Facts That Affect The Plan

- Step 1 and Step 2 foundations already exist in `packages/vscode-extension`:
  - `src/services/getStencil.ts` caches one `Stencil` instance per workspace root.
  - `src/services/workspace.ts` resolves the active workspace and enforces `.stencil/` presence.
  - `src/commands/shared.ts` wraps commands with workspace/setup checks and shared error handling.
  - `src/services/errors.ts` already maps `StencilError` values to VS Code messages.
  - `src/services/templateQuickPick.ts` already maps `Template[]` into grouped Quick Pick items.
- `src/commands/runTemplate.ts` is still a placeholder informational command.
- `src/commands/listTemplates.ts` already proves the Step 2 selector contract works:
  - `await stencil.list()`
  - `showQuickPick(...)`
  - `openTextDocument(...)`
- `registerWorkspaceCommand()` currently ignores command arguments and always invokes handlers with only `{ stencil, workspace }`.
- `TemplateTreeProvider` is still placeholder-only, so Step 3 can support tree-item-origin arguments at the command boundary without depending on Step 6 UI to exist yet.
- `@stencil-pm/core` already exposes the exact APIs Step 3 needs:
  - `stencil.list()`
  - `stencil.get(name)`
  - `stencil.resolve(templateName, explicitValues)`
- `ResolutionResult` already includes:
  - `resolvedBody`
  - `placeholders`
  - `unresolvedCount`
- The resolver contract is adapter-safe for this slice:
  - explicit inputs win first
  - then context
  - then frontmatter defaults
  - unresolved placeholders remain unresolved without prompting
- The architecture document describes richer output targets and a `3+` placeholder Webview threshold, but the Epic 1 plan explicitly forbids pulling those into this step.

---

## Step 3 Outcome

At the end of this step:

- `Stencil: Run Template` can resolve its target template from one of three entry paths:
  - explicit command argument
  - current template file context
  - Step 2 Quick Pick fallback
- the command calls `stencil.resolve(templateName, {})` for the initial run path
- templates with no unresolved placeholders open as resolved Markdown content in a new editor tab
- templates satisfied entirely by defaults and/or `$ctx.*` values execute successfully without manual prompting
- templates that still need user input stop cleanly with an informational message that the run requires placeholder input
- success and failure messaging is deliberate, with core exceptions still routed through shared error handling
- the unit and smoke test baseline remains green

**Demonstrable user flow for this step:**

1. Open a workspace with `.stencil/` templates.
2. Run `Stencil: Run Template`.
3. Pick a template with no manual input requirements.
4. The resolved prompt opens in a new editor tab.
5. A short success message confirms which template ran and that output was opened in the editor.

---

## Validation Gates

**Baseline validation before editing:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Validation during Steps 3.1 through 3.5:**

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

1. Open a workspace with at least:
   - one template with no placeholders
   - one template satisfied only by defaults
   - one template using `$ctx.*` only
   - one template that still requires manual input
2. Run `Stencil: Run Template` from the Command Palette and select each template in turn.
3. Confirm the first three cases open a new editor tab with resolved content.
4. Confirm the manual-input template does not open unresolved content and instead shows an informational “requires input” message.
5. Open a template file under `.stencil/` and rerun `Stencil: Run Template` to verify the current-file shortcut path.

---

## Implementation Sequence

### Step 3.1 — Freeze The Command Entry Contract

**Objective:** lock how `runTemplate` receives preselected targets before editing production code.

**Files:** no production edits yet

**Actions:**

1. Define the accepted preselection sources for this step:
   - a string template name passed as the command argument
   - a lightweight object containing `templateName`
   - current active template file context when no argument is supplied
   - Quick Pick fallback when neither of the above resolves a template
2. Record that tree-item support is contract-level only in this step:
   - the command should accept a future object argument shape
   - Step 6 will become the first real UI producer of that object
3. Lock the priority order:
   - explicit command argument
   - current template file context
   - Quick Pick selection
4. Record that any unsupported argument shape should be ignored rather than treated as an error.

**Why this matters:** Step 3 needs reusable routing now, and Step 6 should be able to plug into it without refactoring the run command signature again.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** there is one explicit, testable contract for how a run target is chosen.

---

### Step 3.2 — Extend The Shared Command Wrapper To Forward Arguments

**Objective:** keep `runTemplate.ts` on the shared workspace/setup/error path while allowing argument-driven invocation.

**Files to change:**

- `packages/vscode-extension/src/commands/shared.ts`
- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Extend the command wrapper so registered handlers can receive the raw command argument list in addition to `{ stencil, workspace }`.
2. Add minimal extension-local typing for the run-command preselection shape, for example:
   - string template name
   - object with `templateName`
   - optional future metadata from tree items
3. Keep the wrapper generic:
   - do not make it specific to `runTemplate`
   - do not move run-target parsing into `shared.ts`
4. Preserve current behavior for `listTemplates` and `createTemplate`:
   - same workspace checks
   - same `.stencil/` setup enforcement
   - same shared `showCommandError()` handling
5. Update unit tests around extension activation or wrapper typing only if the signature change requires it.

**Why here:** bypassing the wrapper would duplicate setup/error behavior and create an unnecessary one-off command model.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** commands can keep using the shared wrapper while still receiving invocation arguments.

---

### Step 3.3 — Add Reusable Template Target Resolution Helpers

**Objective:** centralize the logic that turns command context into one concrete template selection.

**Files to add:**

- `packages/vscode-extension/src/services/runTemplateTarget.ts`

**Files to change:**

- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Add a helper that resolves a template target from the locked priority order:
   - parse explicit command argument
   - attempt current-file resolution
   - otherwise show the Step 2 Quick Pick
2. Implement current-file resolution conservatively:
   - inspect `window.activeTextEditor`
   - if the active document path is under the current workspace and inside `.stencil/`
   - call `stencil.list()` and match against `template.filePath`
   - use the matched template’s `frontmatter.name`
3. Reuse `buildTemplateQuickPickItems()` and `isTemplateQuickPickTemplateItem()` for the fallback selector.
4. Keep the helper focused on selection only:
   - do not call `stencil.resolve()`
   - do not open output documents
   - do not show success messages
5. Handle selection edge cases deliberately:
   - empty template list: show the same explicit informational message as Step 2 or a run-specific equivalent
   - Quick Pick cancel: return without error
   - active file is not a template: silently fall back to Quick Pick

**Why this shape:** the command needs one place to determine “what template are we running?” so later tree actions and Step 4 prompting reuse the same entry path.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** `runTemplate.ts` can request one resolved target without owning picker or path-matching details.

---

### Step 3.4 — Add A Minimal Output Service For Resolved Prompt Documents

**Objective:** isolate the “open resolved prompt in a new editor” behavior behind one helper.

**Files to add:**

- `packages/vscode-extension/src/services/output.ts`

**Actions:**

1. Implement a small helper that:
   - creates an untitled text document from `resolvedBody`
   - uses `language: 'markdown'`
   - opens the document with `window.showTextDocument()`
2. Return enough metadata for the caller to produce a clear success message, for example:
   - delivery target label such as `new editor`
   - optionally the created document URI if tests need to assert it
3. Keep the service intentionally narrow:
   - no clipboard
   - no terminal
   - no Claude Code integration
   - no configuration switch for output target
4. Keep failure behavior simple: let VS Code or unexpected exceptions bubble into the shared command error handler.

**Why now:** Step 3’s output path is intentionally simple, but it is still better as a reusable service than as inline command code.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the run command has one stable helper for Step 3 output delivery.

---

### Step 3.5 — Replace The Placeholder Run Command With The Real No-Input Execution Flow

**Objective:** deliver the first real template execution slice without introducing Step 4 placeholder prompting.

**Files to change:**

- `packages/vscode-extension/src/commands/runTemplate.ts`

**Actions:**

1. Keep `registerRunTemplateCommand()` on the shared `registerWorkspaceCommand()` wrapper.
2. Replace the placeholder informational message with this flow:
   - resolve the target template through the new selection helper
   - if no target is returned, exit quietly
   - call `await stencil.resolve(templateName, {})`
3. Branch on the `ResolutionResult`:
   - if `unresolvedCount === 0`, open the resolved body through `output.ts`
   - if `unresolvedCount > 0`, show an informational message that the template requires placeholder input and is not yet runnable in this step
4. Add a short success notification after output opens, including:
   - template name
   - delivery target, e.g. `Opened resolved prompt in a new editor`
5. Do not add any of the following here:
   - manual prompting
   - confirmation summary
   - editable review dialog
   - output target settings
   - partial resolution preview
6. Let parse, validation, config, storage, and template-not-found failures continue to flow through `showCommandError()`.

**Implementation note to lock:** if the current-file path resolves to a template whose `stencil.resolve()` still reports unresolved placeholders, do not try to “help” by scraping values from the file or active selection. Step 3 stops cleanly and Step 4 adds prompting.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** `Stencil: Run Template` is functionally usable for templates that need no manual placeholder input.

---

### Step 3.6 — Add Unit Coverage For Routing, Resolution Outcomes, And Output Delivery

**Objective:** verify the new run flow without relying only on manual Extension Host testing.

**Files to add:**

- `packages/vscode-extension/test/unit/services/runTemplateTarget.test.ts`
- `packages/vscode-extension/test/unit/services/output.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Files to change:**

- `packages/vscode-extension/test/unit/extension.test.ts`
- `packages/vscode-extension/test/unit/commands/listTemplates.test.ts`

**Actions:**

1. Add target-resolution tests that verify:
   - explicit string argument wins
   - explicit object argument with `templateName` wins
   - current active template file resolves to the correct template name
   - non-template active file falls back to Quick Pick
   - cancelled Quick Pick returns no target
2. Add output-service tests that verify:
   - untitled Markdown document creation
   - resolved content is passed to `openTextDocument(...)`
   - `showTextDocument(...)` is called once
3. Add run-command tests that verify:
   - no-placeholder template resolves and opens output
   - defaults-only template resolves and opens output
   - `$ctx.*`-only template resolves and opens output
   - unresolved template shows the “requires input” informational message and does not open output
   - command argument path bypasses Quick Pick
   - Quick Pick fallback path still works
4. Update existing extension registration tests only as needed if helper imports or command signatures changed.
5. Keep smoke coverage minimal unless the existing activation smoke test needs adjustment.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the Step 3 flow is covered at the selection, output, and command layers with stable automated tests.

---

### Step 3.7 — Update Package Documentation To Reflect Real Run Behavior

**Objective:** keep the extension package docs aligned with what the command actually does after Step 3.

**Files to change:**

- `packages/vscode-extension/README.md`

**Actions:**

1. Replace any placeholder wording that says run behavior is not implemented yet.
2. Document the actual Step 3 behavior:
   - command palette entry point
   - template selection via current file or Quick Pick
   - no-input/default/context-only templates open resolved output in a new editor
   - templates that still require manual input will be supported in the next step
3. Keep the README scoped to current truth only. Do not document Step 4 prompting or later integrations early.

**Validation:**

```bash
pnpm --filter stencil-vscode build
```

**Completion gate:** extension docs match the real Step 3 execution behavior.

---

## Step Exit Checklist

Step 3 is complete when all of the following are true:

- `src/commands/runTemplate.ts` no longer shows the placeholder deferred-work message
- the run command can resolve a template via command argument, current file, or Quick Pick fallback
- `stencil.resolve(templateName, {})` is the only resolution path used in this step
- templates satisfied by no placeholders, defaults, and/or `$ctx.*` values open resolved content in a new untitled Markdown editor
- templates that still need manual values stop with a deliberate informational message
- shared workspace/setup/error handling still flows through `registerWorkspaceCommand()`
- no manual placeholder prompting, preview UI, confirmation summary, or alternate output targets were added
- `pnpm --filter stencil-vscode typecheck`
- `pnpm --filter stencil-vscode build`
- `pnpm --filter stencil-vscode test`

---

## Explicit Non-Goals

- Sequential placeholder input collection
- Enum placeholder Quick Picks
- Webview forms for `3+` placeholders
- Pre-execution confirmation summary
- Dry-run mode
- Tree View run action UI
- Clipboard, terminal, or Claude Code output targets
- Syntax highlighting, diagnostics, autocomplete, or CodeLens
- Any adapter-side placeholder inference beyond core defaults and registered context providers

---

## Risks And Mitigations

### 1. Command argument shape may drift before Tree View lands

**Risk:** Step 3 invents an argument shape that Step 6 later has to undo.

**Mitigation:** keep the accepted preselection contract minimal and name-based:

- string template name
- object with `templateName`

Do not encode tree-specific UI state into the command contract yet.

### 2. Current-file resolution could duplicate core discovery logic poorly

**Risk:** a path-based resolver could drift from actual visible-template precedence rules.

**Mitigation:** resolve current-file context by calling `stencil.list()` and matching `filePath`, rather than reconstructing template identity from directory names or frontmatter parsing in the extension.

### 3. Users may mistake the unresolved-placeholder stop as a failure

**Risk:** a template that needs manual input may look broken instead of merely incomplete for Step 3.

**Mitigation:** the informational message should explicitly state that the template requires placeholder input and that sequential input support lands in the next step.

### 4. Output document behavior can be awkward if implementation opens file-backed docs instead of untitled content

**Risk:** opening a physical file or overwriting something would violate the locked scope.

**Mitigation:** use `workspace.openTextDocument({ content, language: 'markdown' })` and keep output delivery entirely in a new untitled editor.
