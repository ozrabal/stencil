# Plan: Epic 1 Step 4 — Sequential Placeholder Input Flow

**Goal:** Replace the current Step 3 stop-message in `Stencil: Run Template` with the real MVP placeholder collection flow: resolve a template target, identify only the placeholders still missing after context/default resolution, prompt for them one by one with VS Code `InputBox` UI, re-run core resolution, and open the fully resolved prompt in a new editor tab.

**Primary inputs:**

- `docs/plans/15-epic-1-vscode-extension-mvp.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `packages/vscode-extension/*`
- `packages/core/*`

**This document plans Step 4 only.** It does not implement pre-execution confirmation, dry-run mode, Tree View actions, syntax highlighting, Webviews, preview panels, diagnostics, autocomplete, or Claude Code / other extension integration.

---

## Locked Scope For This Step

These decisions from `15-epic-1-vscode-extension-mvp.md` must remain true while implementing this step:

- Keep Epic 1 on the Phase 2 MVP surface only.
- Use direct `@stencil-pm/core` imports through the extension’s local core bridge.
- Use sequential `showInputBox()` prompting for MVP manual placeholder collection.
- Do not introduce Webviews, preview panels, CodeLens, diagnostics, autocomplete, or cross-extension output targets.
- Keep output delivery extension-local and simple: open the resolved prompt in a new editor tab.
- Keep orchestration out of `extension.ts`; put reusable logic in services/helpers.
- Do not add confirmation UI, dry-run mode, or placeholder editing/override summary in this step.

Additional Step 4 decisions to lock before editing:

- Keep `runTemplate.ts` on the current Step 3 execution path. Step 4 extends it; it does not replace the target-resolution or output-delivery services.
- Use `stencil.get(templateName)` to fetch placeholder definitions and metadata for prompting. `stencil.resolve()` alone is not enough because it returns resolution status, not placeholder descriptions.
- Preserve declared frontmatter order when prompting. Do not re-sort placeholders alphabetically.
- Prompt only placeholders that remain unresolved after the initial `stencil.resolve(templateName, {})` call.
- Treat all Step 4 prompts as plain text input, even if a template includes `type` or `options` metadata. Typed placeholder UX belongs to Phase 3.
- Use required/optional semantics only for input validation:
  - required unresolved placeholders must not accept an empty submission
  - optional unresolved placeholders may resolve to an empty string if the user submits one
- Cancellation during placeholder collection should abort the run cleanly and show a short informational cancellation message.

### Important ambiguity to resolve before editing

The parent Epic 1 plan says both:

- prompt only unresolved placeholders
- prefill input boxes with a default when present

Those cannot both be true with the current core contract, because a placeholder with a default is already resolved by `stencil.resolve()` and therefore is not part of the unresolved prompt queue.

**Lock for Step 4:** do not prompt placeholders already satisfied by defaults. As a result, default-prefill is out of scope for the Step 4 MVP flow. `InputBox.value` should only be used for retrying a partially entered value within the same prompt session if validation fails.

---

## Repo Facts That Affect The Plan

- Step 3 is already implemented in `packages/vscode-extension`:
  - `src/commands/runTemplate.ts` resolves a target through `resolveRunTemplateTarget()`
  - it calls `stencil.resolve(templateName, {})`
  - if `unresolvedCount > 0`, it currently stops with the message that manual input will arrive in the next step
  - if `unresolvedCount === 0`, it opens output through `openResolvedTemplateOutput()`
- `src/services/runTemplateTarget.ts` already handles target resolution from:
  - command args
  - active template file context
  - Quick Pick fallback
- `src/services/output.ts` already owns the “open resolved prompt in a new editor” behavior.
- `src/commands/shared.ts` already provides the shared workspace/setup/error wrapper and forwards raw command args.
- `src/services/errors.ts` already maps `StencilErrorCode` values into user-facing VS Code error messages.
- There is no placeholder prompting service yet in the extension package.
- The current extension-local types do not yet model placeholder prompt sessions or prompt queue items.
- `@stencil-pm/core` already exposes the exact APIs Step 4 needs:
  - `stencil.get(name)` to load template frontmatter and body
  - `stencil.resolve(name, explicitValues)` to compute unresolved placeholders and final output
- The core resolver behavior matters directly here:
  - explicit values win first
  - then context values
  - then frontmatter defaults
  - only remaining values are marked `source: 'unresolved'`
- `ResolutionResult.placeholders` returns `name`, `value`, and `source`, but not placeholder descriptions or `required` flags, so the adapter must join resolver output with `template.frontmatter.placeholders`.
- The existing Step 3 unit tests already cover:
  - successful no-input run
  - defaults-only run
  - context-only run
  - unresolved-placeholder stop behavior
- Step 4 should replace the unresolved-placeholder stop assertion with real sequential prompting coverage, not duplicate the Step 3 message path.

---

## Step 4 Outcome

At the end of this step:

- `Stencil: Run Template` still resolves its target through the existing Step 3 entry paths
- templates requiring manual values no longer stop at the “next step” placeholder message
- the extension prompts for unresolved placeholders one at a time in frontmatter order
- required placeholders cannot be submitted empty
- optional unresolved placeholders can be intentionally submitted as empty strings
- cancelling any placeholder prompt aborts the run cleanly
- after prompt collection, the command re-runs `stencil.resolve(templateName, explicitValues)`
- fully resolved prompts open in a new editor tab through the existing output service
- if placeholders are still unresolved after prompting, the command stops with an actionable message instead of opening partially resolved content
- the unit and smoke test baseline remains green

**Demonstrable user flow for this step:**

1. Open a workspace with `.stencil/` templates.
2. Run `Stencil: Run Template`.
3. Select a template with unresolved placeholders.
4. The extension prompts one field at a time.
5. After the final answer, the resolved prompt opens in a new editor tab.
6. Cancelling a prompt aborts the run without opening unresolved output.

---

## Validation Gates

**Baseline validation before editing:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Validation during Steps 4.1 through 4.5:**

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

1. Open a workspace with at least these templates:
   - one template with a single required placeholder and no default
   - one template with multiple required placeholders
   - one template with a mix of context/default-resolved placeholders and one unresolved placeholder
   - one template with an optional placeholder that has no default
2. Run `Stencil: Run Template` and verify:
   - only unresolved placeholders are prompted
   - prompts appear in declared frontmatter order
   - required placeholders reject empty submit
   - optional unresolved placeholders can be submitted empty
   - after the last prompt, the resolved output opens in a new editor tab
3. Repeat and cancel:
   - at the first prompt
   - after entering one earlier placeholder but before finishing the rest
4. Confirm cancellation does not open an output document and shows only the intended informational cancellation message.

---

## Implementation Sequence

### Step 4.1 — Freeze The Prompting Contract Against The Current Core API

**Objective:** lock the execution model before code changes so the implementation does not drift into confirmation UI, default overrides, or Webview behavior.

**Files:** no production edits yet

**Actions:**

1. Record the exact Step 4 run flow:
   - resolve template target with `resolveRunTemplateTarget()`
   - load template metadata with `stencil.get(templateName)`
   - run `stencil.resolve(templateName, {})`
   - build a prompt queue from unresolved placeholder names joined against frontmatter definitions
   - collect explicit values sequentially
   - re-run `stencil.resolve(templateName, explicitValues)`
   - open resolved output only when `unresolvedCount === 0`
2. Lock that the prompt queue source of truth is:
   - unresolved placeholder names from `ResolutionResult.placeholders`
   - frontmatter metadata from `Template.frontmatter.placeholders`
3. Lock that prompt order is frontmatter declaration order, filtered down to placeholders whose initial resolution source is `unresolved`.
4. Lock that Step 4 will not:
   - prompt placeholders resolved by context or defaults
   - offer override of context/default values
   - show a pre-run summary or confirmation
   - switch to `showQuickPick()` for enums
5. Lock post-prompt failure behavior:
   - if final `unresolvedCount > 0`, show an informational message listing the still-missing placeholder names
   - do not open partially resolved content

**Why this matters:** this step contains the main scope boundary between the MVP input loop and the richer UX planned later.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** there is one unambiguous contract for what Step 4 will and will not prompt.

---

### Step 4.2 — Add Extension Types And A Pure Prompt-Queue Builder

**Objective:** separate queue construction from UI so prompt order and unresolved filtering can be tested without mocking VS Code.

**Files to add:**

- `packages/vscode-extension/src/services/placeholderInput.ts`

**Files to change:**

- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Add extension-local types for the Step 4 input flow, for example:
   - `PlaceholderPromptItem`
   - `PlaceholderPromptResult`
   - `PlaceholderPromptCancellation`
2. In `placeholderInput.ts`, add a pure helper that accepts:
   - `Template`
   - initial `ResolutionResult`
3. Build a prompt queue by:
   - reading `template.frontmatter.placeholders ?? []`
   - finding which placeholder names are `source === 'unresolved'` in the initial resolution result
   - returning queue items only for those names, in declaration order
4. Store on each queue item the data the UI layer needs:
   - placeholder name
   - description
   - `required`
   - any existing retry value for the current session
5. Treat missing metadata as a hard inconsistency:
   - if `ResolutionResult` reports an unresolved declared placeholder that is not found in frontmatter, throw an adapter error
   - let the shared command error path surface it

**Implementation notes to lock:**

- Keep this helper pure and deterministic.
- Do not call `showInputBox()` or `stencil.resolve()` inside the queue builder.
- Do not add fallback regex parsing of the body; Step 4 depends on declared placeholders only, matching the core resolver contract.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** unresolved placeholder filtering and order are testable without VS Code UI mocks.

---

### Step 4.3 — Implement The Sequential `showInputBox()` Collection Service

**Objective:** encapsulate the manual input loop in one reusable service instead of embedding UI state into `runTemplate.ts`.

**Files to change:**

- `packages/vscode-extension/src/services/placeholderInput.ts`

**Actions:**

1. Add a service function that accepts the prompt queue from Step 4.2 and returns either:
   - an explicit values map: `Record<string, string>`
   - a cancellation result
2. Prompt sequentially with `vscode.window.showInputBox()` once per queue item.
3. Configure each prompt with clear, minimal text:
   - title: `Stencil: Run Template`
   - prompt: placeholder description
   - placeHolder: placeholder name
4. Validate per prompt:
   - if the placeholder is required, reject empty submission and re-show the same prompt with the attempted value preserved
   - if the placeholder is optional, accept empty string as a valid explicit value
5. On cancel:
   - stop immediately
   - return a cancellation result to the caller
   - do not convert cancel into an exception
6. Keep collection-side behavior minimal:
   - no summary screen
   - no back button
   - no edit of previous answers
   - no side effects beyond returned values

**Implementation notes to lock:**

- Use the `validateInput` option when it is sufficient for required-empty checks; do not create a second notification channel for routine validation.
- Preserve previously typed text only when re-showing the same prompt after validation failure.
- Keep this service text-only. No enum picker, file picker, or boolean-specific UX in this step.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the extension has one service that can gather placeholder values sequentially and report cancellation without touching command orchestration.

---

### Step 4.4 — Integrate Placeholder Collection Into `runTemplate.ts`

**Objective:** replace the Step 3 unresolved-placeholder stop path with the real Step 4 run flow.

**Files to change:**

- `packages/vscode-extension/src/commands/runTemplate.ts`

**Actions:**

1. Keep the existing command wrapper and target-resolution flow unchanged:
   - `registerWorkspaceCommand(...)`
   - `resolveRunTemplateTarget(...)`
2. After a target is resolved:
   - call `stencil.get(templateName)`
   - if it returns `null`, surface the same missing-template failure path used elsewhere
3. Run the initial resolution with no explicit values:
   - `const initialResult = await stencil.resolve(templateName, {})`
4. Branch on the initial result:
   - if `initialResult.unresolvedCount === 0`, preserve the current Step 3 success path unchanged
   - otherwise, build the prompt queue and collect explicit values
5. After prompt collection:
   - if cancelled, show one short informational cancellation message and return
   - otherwise, call `stencil.resolve(templateName, explicitValues)` again
6. Handle the final resolution result:
   - if `unresolvedCount === 0`, open resolved output via `openResolvedTemplateOutput()` and show the existing success message
   - if `unresolvedCount > 0`, show an informational message listing the unresolved placeholder names and stop
7. Remove the Step 3 transitional message:
   - `Manual input collection will arrive in the next step.`

**Why this sequence:** it keeps Step 3’s working execution path intact for already-resolved templates while extending only the unresolved branch.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** `runTemplate.ts` supports both already-resolved templates and sequentially prompted templates through one command flow.

---

### Step 4.5 — Add Focused Unit Coverage For Queue Building, Prompting, And Run Integration

**Objective:** verify the input loop thoroughly without relying only on manual F5 testing.

**Files to add:**

- `packages/vscode-extension/test/unit/services/placeholderInput.test.ts`

**Files to change:**

- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/extension.test.ts`

**Actions:**

1. Add pure queue-builder tests that verify:
   - unresolved placeholders are selected by name from `ResolutionResult.placeholders`
   - queue order follows frontmatter order, not resolver array order by accident
   - context/default-resolved placeholders are not included
2. Add prompt-service tests that verify:
   - one required placeholder is collected successfully
   - multiple placeholders are prompted sequentially
   - required empty input is rejected and retried
   - optional unresolved placeholder can resolve to empty string
   - cancellation returns a cancellation result instead of throwing
3. Update `runTemplate.test.ts` to cover:
   - unresolved template now prompts and then resolves successfully
   - command does not open output when prompt collection is cancelled
   - final unresolved placeholders show the actionable informational message
   - already-resolved templates still bypass placeholder prompting
4. Remove or replace the Step 3 transitional assertion that expected the “manual input collection will arrive in the next step” message.
5. Keep smoke coverage minimal unless a regression in activation/registration requires extra assertions.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Completion gate:** Step 4 behavior is covered at the pure-helper, prompt-service, and command-integration levels.

---

### Step 4.6 — Manual End-To-End Verification In The Extension Host

**Objective:** confirm the UX matches the intended MVP behavior inside a real VS Code extension session.

**Files:** no production edits

**Actions:**

1. Launch the Extension Development Host.
2. Verify these cases from the Command Palette:
   - template with no manual inputs still runs directly
   - template with one unresolved required placeholder prompts once and resolves
   - template with two or more unresolved placeholders prompts sequentially in order
   - template with mixed context/default/manual values prompts only for the missing manual values
   - optional unresolved placeholder can be submitted empty
3. Verify cancellation cases:
   - cancel on the first prompt
   - cancel after one earlier value has already been entered
4. Verify no unresolved content is opened after cancellation or failed completion.
5. Verify the final success message still references the template name and output destination.

**Validation:**

```bash
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Completion gate:** the real Extension Development Host behavior matches the planned MVP interaction model.

---

## File Plan

**Expected files to change:**

- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/services/placeholderInput.ts`
- `packages/vscode-extension/src/types.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/extension.test.ts`

**Expected files to add:**

- `packages/vscode-extension/test/unit/services/placeholderInput.test.ts`

**Files that should stay out of scope for Step 4:**

- `packages/vscode-extension/src/providers/templateTreeProvider.ts`
- `packages/vscode-extension/src/commands/createTemplate.ts`
- `packages/vscode-extension/src/commands/listTemplates.ts`
- `packages/vscode-extension/syntaxes/*`
- any Webview or preview UI files

---

## Risks And Guards

- **Default-prefill ambiguity:** resolved by locking Step 4 to prompt unresolved placeholders only.
- **Scope creep into richer placeholder UX:** avoid `showQuickPick()`, Webviews, previews, and confirmation steps.
- **Command bloat:** keep queue-building and `showInputBox()` orchestration in `placeholderInput.ts`, not in `runTemplate.ts`.
- **Inconsistent prompt order:** always derive queue order from frontmatter declaration order.
- **Opening unresolved output:** guard success strictly on final `unresolvedCount === 0`.
- **Cancellation being treated as an error:** cancellation should be a normal informational exit, not an exception.

---

## Exit Criteria

- `Stencil: Run Template` can complete templates that require manual placeholder input.
- The extension prompts missing values sequentially with `showInputBox()`.
- Only unresolved placeholders are prompted.
- Required placeholders reject empty input; optional unresolved placeholders may resolve to empty string.
- Cancellation exits cleanly without opening output.
- The command re-runs core resolution after input collection and opens output only when fully resolved.
- `pnpm --filter stencil-vscode typecheck`
- `pnpm --filter stencil-vscode build`
- `pnpm --filter stencil-vscode test`
