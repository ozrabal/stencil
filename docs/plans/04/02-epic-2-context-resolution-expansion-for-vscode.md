# Plan: Epic 2 — Context Resolution Expansion for VS Code

**Goal:** Expand the VS Code adapter's context resolution so run-template execution can use richer live IDE state while staying inside current `@stencil-pm/core` context contracts and preserving non-blocking fallback behavior.

**Primary source documents:**

- `docs/epics/04-vscode-run-template-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Referenced but missing source:**

- `docs/epics/04-vscode-run-template-epics.md` references `docs/promptvault-run-template.md`, but that file is not present in this workspace.
- This plan therefore treats `docs/epics/04-vscode-run-template-epics.md` as the authoritative source for Epic 2 scope unless the missing spec is restored before implementation starts.

**Current code baseline:**

- `packages/vscode-extension/src/providers/contextResolver.ts`
- `packages/vscode-extension/src/services/getStencil.ts`
- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/runTemplateTarget.ts`
- `packages/vscode-extension/test/unit/providers/contextResolver.test.ts`
- `packages/vscode-extension/test/unit/services/getStencil.test.ts`
- `packages/vscode-extension/README.md`

## Scope Lock

This plan covers Epic 2 only.

In scope:

- map richer VS Code runtime data to Stencil-compatible `$ctx.*` keys
- expand the VS Code adapter-owned context provider with stable editor, workspace, selection, and diagnostics values
- define adapter fallback behavior for missing editor, workspace, and file-backed document state
- verify how adapter context composes with existing core providers for system, project, and git values
- document key ownership so later epics do not duplicate context logic or hide syntax work inside the adapter

Out of scope for this epic:

- inline `{{input:...}}` parsing or any new placeholder syntax from Epic 3
- Copilot Chat delivery from Epic 4
- clipboard fallback implementation from Epic 6
- LM API execution from Epic 7
- changing core resolver semantics, value precedence, or interactive prompting rules
- adding unstable or tool-version-sensitive context that cannot be represented as a plain string value

## Planning Notes Applied

- Each implementation step below ends in a user-observable run flow through the current extension path, not only internal scaffolding.
- The slices keep Epic 2 bounded to context expansion, but they are shaped so the first future multi-target wave can reuse the same richer context in Copilot Chat, LM API, and fallback delivery modes without reworking provider boundaries.
- Epic 3 remains contract work. This plan does not treat adapter-side context expansion as permission to preprocess inline input syntax or create VS Code-only placeholder semantics.

## Repo Facts That Matter

- Core already owns the built-in cross-adapter providers for:
  - `date`, `os`, `cwd`
  - `current_branch`, `git_user`
  - `project_name`, `language`
- The VS Code adapter currently adds only:
  - `active_file`
  - `active_selection`
  - `workspace_folders`
  - `active_language_id`
  - `diagnostics_count`
- `ContextProvider.resolve()` returns `Promise<Record<string, string>>`, so all adapter-provided values must remain string-valued.
- The context engine merges providers left-to-right, and later providers override earlier ones on collision.
- The resolver leaves unknown tokens in place; missing context must therefore degrade to unresolved or unchanged output instead of blocking execution on its own.
- The current run path already makes Epic 2 easy to validate manually: create a template using `$ctx.*`, run it, and inspect the resolved output in the editor.

## Desired Outcome

At the end of Epic 2:

- the VS Code adapter exposes a documented, materially richer set of stable IDE-derived context values
- adapter-owned keys are clearly separated from core-owned keys
- existing keys remain backward compatible unless there is an explicit migration decision
- missing IDE state never causes a hard failure; the provider simply omits unavailable keys
- run-template behavior remains end to end compatible with the current editor delivery path
- later delivery targets can consume the richer context without changing provider contracts

## Context Ownership Guardrails

Use this decision rule throughout implementation:

- Keep a value in core if it is not VS Code specific and can be resolved in a portable Node runtime.
- Keep a value in the VS Code adapter if it depends on live editor state, workspace UI state, document diagnostics, or VS Code-only APIs.
- Do not rename existing public context keys casually. Prefer additive expansion over replacement.
- Do not encode structured JSON blobs into one context value just to avoid adding explicit keys. Prefer small, well-named string keys.
- Do not introduce keys that depend on fragile editor internals, hidden commands, or optional extensions.

## Recommended Contract For Epic 2

These are the recommended adapter-owned additions because they fit the current architecture and string-only context contract:

**Keep existing keys as-is:**

- `active_file`
- `active_selection`
- `workspace_folders`
- `active_language_id`
- `diagnostics_count`

**Add stable editor and workspace keys:**

- `active_file_name`
- `active_file_relative_path`
- `active_workspace_folder`
- `workspace_folder_count`
- `active_selection_start_line`
- `active_selection_end_line`
- `active_selection_line_count`

**Add stable diagnostics detail keys:**

- `diagnostics_error_count`
- `diagnostics_warning_count`

**Defer for a later epic unless the missing spec file clearly requires them:**

- git-derived aliases already covered by core under different names
- symbol-under-cursor or AST-derived context
- open editors list
- SCM diff hunks
- notebook-specific context
- terminal state
- JSON-encoded arrays or objects

## Validation Baseline

Run before editing:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
pnpm --filter stencil-vscode build
```

Default validation after each implementation step:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
```

Full validation before closing the epic:

```bash
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

## Manual Validation Template

Use these template bodies during manual checks:

```markdown
Current file: {{$ctx.active_file}}
Relative file: {{$ctx.active_file_relative_path}}
File name: {{$ctx.active_file_name}}
Language: {{$ctx.active_language_id}}
Workspace: {{$ctx.active_workspace_folder}}
Workspace count: {{$ctx.workspace_folder_count}}
Selection: {{$ctx.active_selection}}
Selection start: {{$ctx.active_selection_start_line}}
Selection end: {{$ctx.active_selection_end_line}}
Selection lines: {{$ctx.active_selection_line_count}}
Diagnostics total: {{$ctx.diagnostics_count}}
Errors: {{$ctx.diagnostics_error_count}}
Warnings: {{$ctx.diagnostics_warning_count}}
Branch: {{$ctx.current_branch}}
Project: {{$ctx.project_name}}
```

For each user-visible slice:

1. Open a workspace containing `.stencil/` templates.
2. Open a file inside a workspace folder.
3. Select text when the step covers selection keys.
4. Run `Stencil: Run Template`.
5. Verify resolved output in the untitled Markdown editor.
6. Repeat once with no active editor or with an untitled/non-file editor when the step covers fallback behavior.

## Implementation Sequence

### Step 1 — Freeze The Current Context Contract With Characterization Tests

**Objective:** Protect the current provider behavior before adding new keys or fallback branches.

**Files to change:**

- `packages/vscode-extension/test/unit/providers/contextResolver.test.ts`
- `packages/vscode-extension/test/unit/services/getStencil.test.ts`
- optionally `packages/vscode-extension/README.md`

**Actions:**

1. Expand unit coverage for the current provider contract:
   - file-backed active editor
   - empty selection
   - no workspace folders
   - active editor on a non-file scheme
   - diagnostics lookup only when an active document exists
2. Add a composition test through `getStencil()` so the extension-level `Stencil` instance still exposes both core and VS Code context together.
3. Record current string formats explicitly:
   - `workspace_folders` remains newline-separated unless a migration is intentionally chosen later
   - `diagnostics_count` remains a string
4. Do not add new production behavior in this step except where tests expose an obvious bug.

**User-observable slice:** existing `$ctx.active_file`, `$ctx.active_selection`, `$ctx.workspace_folders`, `$ctx.active_language_id`, and `$ctx.diagnostics_count` continue to resolve exactly as they do today.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- contextResolver
pnpm --filter stencil-vscode test:unit -- getStencil
```

**Completion gate:** the baseline provider behavior is locked by tests and safe to extend.

---

### Step 2 — Lock The Expanded Key Contract And Ownership Matrix

**Objective:** Make the Epic 2 contract explicit before implementation spreads across code and tests.

**Files to change:**

- `packages/vscode-extension/src/providers/contextResolver.ts`
- `packages/vscode-extension/README.md`
- optionally `docs/epics/04-vscode-run-template-epics.md` only if maintainers want to backfill the missing spec reference later

**Actions:**

1. Add a short provider-level contract comment describing:
   - which keys are adapter-owned
   - that values are strings only
   - that unavailable state is omitted instead of emitted as empty strings
2. Document the ownership split in the extension README:
   - core-owned keys
   - VS Code-owned keys
   - fallback rule for missing IDE state
3. Make one deliberate compatibility decision before adding code:
   - preserve existing key names and add new keys only
   - or introduce aliases if a better name is required
4. Reject any candidate key that would require new core parsing rules, structured payload parsing, or version-sensitive commands.

**User-observable slice:** maintainers have one explicit contract to implement against, which prevents accidental drift between docs, tests, and templates.

**Validation:**

- Review the documented key list against `docs/stencil-architecture.md` Section 3.6 and Section 4.2.
- Confirm no key in the adapter duplicates `date`, `os`, `cwd`, `current_branch`, `git_user`, `project_name`, or `language`.

**Completion gate:** the exact Epic 2 key surface is decided and documented before the provider grows.

---

### Step 3 — Add Stable Editor And Workspace Context Keys

**Objective:** Expand the provider with the highest-value editor and workspace data that maps cleanly to plain strings.

**Files to change:**

- `packages/vscode-extension/src/providers/contextResolver.ts`
- `packages/vscode-extension/test/unit/providers/contextResolver.test.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- optionally `packages/vscode-extension/test/fixtures/workspace-template-syntax/` if a dedicated template fixture improves coverage

**Actions:**

1. Add editor-derived keys:
   - `active_file_name`
   - `active_file_relative_path`
   - `active_selection_start_line`
   - `active_selection_end_line`
   - `active_selection_line_count`
2. Add workspace-derived keys:
   - `active_workspace_folder`
   - `workspace_folder_count`
3. Keep formatting simple and predictable:
   - use workspace-relative paths only when a containing workspace folder is known
   - use 1-based line numbers unless there is a strong repo convention to stay 0-based
   - emit counts as strings
4. Preserve current behavior for missing state:
   - no active editor means omit editor and selection keys
   - no matching workspace folder means omit workspace-relative keys, not fake them
5. Add unit tests for:
   - file inside a workspace folder
   - file outside workspace folders
   - multi-root workspace
   - empty selection versus non-empty selection
   - active editor with a non-file URI
6. Add at least one run-service level test that proves the new keys are visible during template resolution, not only at provider-unit level.

**User-observable slice:** a user can run a template against the active file and see richer file, workspace, and selection metadata resolved into the prompt body.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- contextResolver
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Open a file inside the workspace and select multiple lines.
2. Run a template that references the new editor and workspace keys.
3. Verify file name, relative path, active workspace folder, and selection line metadata resolve correctly.

**Completion gate:** editor and workspace expansion works in the real run flow, not only in isolated provider tests.

---

### Step 4 — Expand Diagnostics Context Without Coupling To UI State

**Objective:** Add more useful diagnostics detail while keeping the provider cheap, string-only, and non-blocking.

**Files to change:**

- `packages/vscode-extension/src/providers/contextResolver.ts`
- `packages/vscode-extension/test/unit/providers/contextResolver.test.ts`
- `packages/vscode-extension/test/unit/services/getStencil.test.ts`

**Actions:**

1. Add:
   - `diagnostics_error_count`
   - `diagnostics_warning_count`
2. Define the counting rule explicitly:
   - counts are for the active document only
   - severity mapping follows VS Code `DiagnosticSeverity`
   - `diagnostics_count` remains total active-document diagnostics for backward compatibility
3. Keep diagnostics independent from run-mode or delivery-mode concerns.
4. Omit diagnostics keys when no active document exists rather than emitting `0` from nowhere.
5. Add tests for:
   - mixed severities
   - no diagnostics
   - no active editor
   - active non-file document if diagnostics are still available
6. Verify composition with core providers still behaves correctly when the active editor is absent but git/project context still resolves.

**User-observable slice:** a template can distinguish total diagnostics from error-only and warning-only counts for the active file.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- contextResolver
pnpm --filter stencil-vscode test:unit -- getStencil
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Open a file with known warnings or errors.
2. Run a template that prints `diagnostics_count`, `diagnostics_error_count`, and `diagnostics_warning_count`.
3. Verify the resolved values match the Problems view for the active file.

**Completion gate:** diagnostics detail is available without changing the non-blocking provider model.

---

### Step 5 — Harden Missing-State Fallbacks And Precedence Behavior

**Objective:** Ensure richer context does not make the run flow brittle when editor, workspace, or git state is incomplete.

**Files to change:**

- `packages/vscode-extension/src/providers/contextResolver.ts`
- `packages/vscode-extension/test/unit/providers/contextResolver.test.ts`
- `packages/vscode-extension/test/unit/services/getStencil.test.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/README.md`

**Actions:**

1. Add or tighten tests for degraded scenarios:
   - no workspace open
   - untitled editor
   - output editor active instead of a source file
   - file outside workspace
   - empty selection
   - git provider returns nothing but VS Code provider still resolves editor keys
2. Verify precedence behavior remains architecture-compliant:
   - adapter keys do not override core keys accidentally
   - custom context, if configured later, still has the documented override behavior through core registration order
3. Confirm that missing context never causes:
   - a thrown provider error
   - blocked run execution
   - accidental placeholder prompting for `$ctx.*` values outside existing core rules
4. Update README fallback notes so users know that VS Code-derived values are opportunistic and context-sensitive.

**User-observable slice:** the same template can run in both rich-editor and reduced-context situations, resolving what is available and degrading cleanly for the rest.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- contextResolver
pnpm --filter stencil-vscode test:unit -- getStencil
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Run the template once with a normal workspace file selected.
2. Run it again with no active file or with an untitled editor active.
3. Confirm the command still completes and only the unavailable keys are omitted or left unresolved.

**Completion gate:** richer context remains opportunistic, not mandatory.

---

### Step 6 — Finish With Smoke Coverage, Docs, And Acceptance Pass

**Objective:** Close Epic 2 with repo-level validation and maintainer-facing documentation.

**Files to change:**

- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/README.md`
- optionally `packages/vscode-extension/docs/manual-acceptance.md` if that checklist exists and should be extended

**Actions:**

1. Extend smoke coverage only where the current harness can verify a real run flow without brittle editor state orchestration.
   - If smoke cannot reliably assert resolved context content, keep that detail in unit coverage and document the manual acceptance path instead of forcing flaky tests.
2. Update README context documentation with:
   - final key list
   - ownership split
   - fallback behavior
   - examples of templates that use the new keys
3. Run a full acceptance pass across:
   - single-root workspace
   - multi-root workspace
   - selected text present and absent
   - diagnostics present and absent
   - active editor missing
4. Record any keys intentionally deferred because the missing PromptVault spec could not be verified.

**User-observable slice:** the extension documentation and tests match the actual richer context behavior users see when they run templates.

**Validation:**

```bash
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Completion gate:** Epic 2 is finished only when the documented key contract, automated coverage, and manual run behavior all agree.

## Suggested Implementation Order Inside The Code

Work in this order to minimize churn:

1. Tests first for current behavior.
2. Contract and ownership docs second.
3. Editor/workspace key expansion.
4. Diagnostics detail expansion.
5. Degraded-state hardening.
6. Smoke/docs/final acceptance.

## Risks And Watchpoints

- The missing `docs/promptvault-run-template.md` means any key mapping beyond the current epic doc is partially inferred. Do not over-expand the contract without either restoring that file or making an explicit maintainer decision.
- `workspace_folders` already uses newline-separated encoding. Changing its format would be a compatibility break for any template that already consumes it.
- Relative-path calculation in multi-root workspaces can become ambiguous. Prefer `active_workspace_folder` plus `active_file_relative_path` over inventing a more complex serialized structure.
- Selection-derived keys should only exist when the selection is meaningful. Avoid emitting misleading values for empty selections.
- Diagnostics counts must remain cheap and local to the active document. Do not turn Epic 2 into workspace-wide analysis work.

## Epic Completion Checklist

- The final adapter-owned context key list is documented.
- Existing keys remain compatible or have an explicit migration note.
- New keys resolve through the real run flow, not only unit tests.
- Missing editor, workspace, or git state does not block execution.
- The provider still returns plain string values only.
- Full extension validation passes with `pnpm --filter stencil-vscode test` and `pnpm --filter stencil-vscode build`.
