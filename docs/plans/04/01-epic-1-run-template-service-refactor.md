# Plan: Epic 1 — Run Template Service Refactor

**Goal:** Refactor the existing VS Code `stencil.runTemplate` implementation into an explicit orchestration service that preserves the current editor-output flow while creating stable seams for later Copilot Chat, LM API, and fallback delivery work.

**Primary source documents:**

- `docs/epics/04-vscode-run-template-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Current code baseline:**

- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/services/runTemplateTarget.ts`
- `packages/vscode-extension/src/services/placeholderInput.ts`
- `packages/vscode-extension/src/services/output.ts`
- `packages/vscode-extension/src/commands/shared.ts`
- `packages/vscode-extension/src/types.ts`
- `packages/vscode-extension/package.json`

## Scope Lock

This plan covers Epic 1 only.

In scope:

- extract the current run flow into a dedicated service
- preserve current template target resolution from command args, active template, and Quick Pick
- preserve sequential placeholder prompting and current cancellation behavior
- define extension-level run options for delivery target and mode selection
- centralize success, cancellation, and recoverable-error handling
- keep the existing editor-output path working end to end

Out of scope for this epic:

- inline `{{input:...}}` syntax adoption and parser changes from Epic 3
- Copilot Chat delivery implementation from Epic 4
- clipboard fallback implementation from Epic 6
- LM API streaming panel implementation from Epic 7
- tree view redesign, Webviews, preview panels, diagnostics, or syntax work beyond what already exists

## Planning Notes Applied

- Each step below ends in a user-observable run flow, not only scaffolding.
- The refactor is shaped so the first multi-target implementation wave can later add Copilot Chat, LM API execution, and explicit fallback modes without rewriting selection, prompting, or error handling again.
- Epic 3 remains contract work. This refactor must not bury future inline-input support inside VS Code-only preprocessing. Keep placeholder collection behind a service seam so input semantics can later move with core contract changes.

## Repo Facts That Matter

- The extension already has a working run path in `src/commands/runTemplate.ts`.
- The current run path already does the following:
  - resolves a template target from command args, active file, or Quick Pick
  - calls `stencil.resolve()`
  - prompts sequentially for unresolved declared placeholders
  - re-resolves and opens the result in a new Markdown editor
- The current implementation is still command-centric:
  - orchestration lives directly in `runTemplate.ts`
  - output is hard-coded to `openResolvedTemplateOutput()`
  - no internal run-mode or target abstraction exists yet
- `packages/vscode-extension/package.json` is still on VS Code `^1.96.0`.
- No Copilot Chat adapter, LM API adapter, clipboard adapter, or run-mode configuration exists yet.

## Desired Outcome

At the end of Epic 1:

- there is one extension-owned run orchestration service for template execution
- commands and tree actions call that service instead of duplicating run logic
- the editor-output run flow still works exactly as the supported fallback path
- the service accepts explicit run options even if only the editor delivery adapter is implemented in this epic
- cancellation, recoverable failure, and success messaging are handled consistently in one place
- later epics can add Copilot Chat, clipboard, and LM API delivery adapters without moving placeholder prompting or target selection again

## Recommended Validation Baseline

Run before editing:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

Default validation after each implementation step:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

Recommended manual validation after each user-visible slice:

1. Open the Extension Development Host with a workspace that contains `.stencil/` templates.
2. Run `Stencil: Run Template` from the Command Palette.
3. Verify selection, prompting, output opening, and cancellation behavior for the scenario covered by that step.

## Implementation Sequence

### Step 1 — Freeze Existing Run Behavior With Characterization Coverage

**Objective:** Lock the current user-visible run behavior before moving logic out of `runTemplate.ts`.

**Files to change:**

- `packages/vscode-extension/test/unit/extension.test.ts`
- new unit tests under `packages/vscode-extension/test/unit/` for run flow coverage
- optionally `packages/vscode-extension/docs/manual-acceptance.md`

**Actions:**

1. Add unit coverage for the current `runTemplate` command path:
   - explicit template target argument
   - active-template auto-target resolution
   - Quick Pick fallback
   - no unresolved placeholders
   - unresolved placeholders followed by sequential `showInputBox()` prompts
   - user cancellation during input collection
   - missing template after selection
2. Capture the current success and informational messages so the refactor preserves observable behavior intentionally.
3. Add or update a short manual acceptance section for the run flow if the existing manual doc does not already cover it.
4. Do not change production behavior in this step except where tests expose an obvious bug.

**User-observable slice:** the current run flow still works, but it is now protected by tests.

**Validation:**

```bash
pnpm --filter stencil-vscode test
```

**Completion gate:** the existing editor-output run flow is described by tests and can be safely refactored.

---

### Step 2 — Introduce A `RunTemplateService` Without Changing Behavior

**Objective:** Move orchestration out of the command module into one dedicated service while preserving the current flow.

**Files to add:**

- `packages/vscode-extension/src/services/runTemplateService.ts`

**Files to change:**

- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Define a small service entrypoint such as `runTemplate(request): Promise<RunTemplateOutcome>`.
2. Move the existing orchestration into that service in this order:
   - resolve target template name
   - load template
   - run initial resolution
   - collect unresolved placeholder inputs
   - run final resolution
   - deliver output
   - return a typed outcome
3. Keep the command handler thin:
   - gather workspace and command args
   - call the service
   - show outcome-driven messages only if they are not already handled inside the service
4. Add typed service outcomes for:
   - `completed`
   - `cancelled`
   - `no-target-selected`
   - `unresolved-after-prompt`
5. Do not introduce new delivery targets yet. The service should still use the existing editor output path.

**Implementation note:** the main point of this step is ownership, not new behavior. If the command still knows too much after the extraction, the service seam is too weak.

**User-observable slice:** `Stencil: Run Template` still behaves the same, but the run flow now comes from a dedicated service.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
```

**Completion gate:** `runTemplate.ts` is only a command adapter; orchestration lives in one reusable service.

---

### Step 3 — Separate Run Request, Run Options, And Delivery Contract

**Objective:** Create explicit internal contracts for future multi-target execution without yet implementing Copilot Chat or LM API delivery.

**Files to add:**

- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/src/services/delivery/editorDelivery.ts`

**Files to change:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/output.ts` or replace it with the new delivery adapter
- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Define internal request types:
   - template target input
   - run delivery target
   - run mode
   - invocation source such as command palette or tree item
2. Keep the initial enum/surface small and explicit. Recommended values:
   - delivery target: `editor`, `copilot-chat`, `clipboard`, `lm-api`
   - run mode: `default`, `insert`, `send`, `execute`
3. Implement validation rules for invalid combinations now, even if only one combination is supported in this epic.
   - `editor` should accept only the modes that make sense for editor output
   - `copilot-chat`, `clipboard`, and `lm-api` should return a typed unsupported outcome for now, not fall through accidentally
4. Convert the existing editor output helper into an adapter that satisfies a shared delivery interface.
5. Update the run service so it resolves delivery through the interface rather than calling the editor helper directly.

**Why this step matters:** Epic 1 explicitly requires extension-level run options for output target and mode selection. Those options can stay internal in this epic, but they need a real contract before later epics add more adapters.

**User-observable slice:**

- the normal run flow still opens a new editor
- unsupported non-editor targets fail explicitly and predictably if invoked by tests or internal callers

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
```

**Manual validation:**

1. Run a template normally and confirm output still opens in a new editor.
2. Add a focused unit test that invokes the service with `copilot-chat` or `lm-api` and confirms the result is a typed unsupported outcome rather than a thrown generic error.

**Completion gate:** the service routes delivery through a target abstraction, and unsupported future targets are intentional.

---

### Step 4 — Centralize Cancellation, Recoverable Errors, And Outcome Messaging

**Objective:** Make the service own the run lifecycle result instead of leaking mixed control flow across commands and helpers.

**Files to change:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/errors.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/services/placeholderInput.ts`
- `packages/vscode-extension/src/services/runTemplateTarget.ts`

**Actions:**

1. Normalize all non-exceptional exits into typed outcomes:
   - Quick Pick cancelled
   - input prompt cancelled
   - unsupported target
   - unresolved placeholders remain after prompt
2. Reserve thrown errors for actual faults:
   - core/storage/config failures
   - impossible state such as missing template metadata after selection
3. Move success and informational message text behind one outcome-to-message mapper.
4. Ensure helper modules return structured results rather than showing their own messages except where the VS Code API forces the interaction boundary.
5. Add test coverage that proves:
   - cancelling template selection does not show an error
   - cancelling input prompts does not create partial output
   - unresolved placeholders after prompt produce one deliberate informational result

**Implementation note:** this is where the service becomes the single place that later Copilot Chat, fallback, and LM API paths can plug into without duplicating cancellation and recoverable-failure policy.

**User-observable slice:** cancellation and recoverable failures are consistent regardless of how the run was started.

**Validation:**

```bash
pnpm --filter stencil-vscode test
```

**Completion gate:** run lifecycle policy is centralized and test-covered.

---

### Step 5 — Add An Internal Capability Layer For Future Delivery Targets

**Objective:** Introduce capability probing now so future delivery adapters can plug into the service without changing the orchestration contract again.

**Files to add:**

- `packages/vscode-extension/src/services/delivery/capabilities.ts`

**Files to change:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- tests covering capability outcomes

**Actions:**

1. Define a capability model for delivery targets, separate from the delivery implementations themselves.
2. Add probes or placeholders for:
   - editor availability
   - Copilot Chat availability
   - LM API availability
   - clipboard availability
3. Keep capability probing side-effect free in this epic.
4. Make the run service consult capability checks before invoking a delivery adapter.
5. Return typed outcomes such as:
   - `unsupported-target`
   - `target-unavailable`
   - `mode-unavailable`
6. Do not add automatic fallback selection yet. Epic 6 will decide fallback priority. In this epic, the service should only expose the conditions needed for later fallback policy.

**Important boundary:** this step is preparation for the first multi-target wave. It should not sneak in Copilot-specific behavior or LM API execution logic.

**User-observable slice:**

- default editor runs still work
- explicit non-editor requests fail with capability-aware outcomes instead of generic unsupported messages

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
```

**Completion gate:** the service can distinguish "not implemented", "not available here", and "invalid mode" without changing command code.

---

### Step 6 — Expose The New Service Contract Through Commands And Tree Actions

**Objective:** Ensure every current run entrypoint uses the same orchestration request shape.

**Files to change:**

- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/providers/templateTreeProvider.ts`
- `packages/vscode-extension/src/types.ts`

**Actions:**

1. Update command argument parsing so it constructs one canonical run request shape for the service.
2. Ensure tree-view run actions pass the same request contract, not a parallel ad hoc object.
3. Preserve current target resolution priority:
   - explicit command arg or tree item
   - active template
   - Quick Pick
4. Add tests showing the same service handles:
   - command palette run
   - tree item run
   - active-editor shortcut run
5. Keep user-visible behavior the same for the supported editor path.

**Why this step matters:** Epic 1’s exit criteria call for one run orchestration path. That is not fully true if tree items and commands still assemble separate logic around the service.

**User-observable slice:** the user can start the same run flow from command palette or tree view and get the same behavior.

**Validation:**

```bash
pnpm --filter stencil-vscode test
```

**Manual validation:**

1. Run a template from the command palette.
2. Run the same template from the tree view.
3. Confirm selection, prompting, and output behavior match.

**Completion gate:** all current run entrypoints converge on the same service contract.

---

### Step 7 — Document Epic 1 Contracts And Integration Points For Epics 3, 4, 6, And 7

**Objective:** Finish the refactor with explicit documentation so later epics build on the new seams instead of bypassing them.

**Files to change:**

- `packages/vscode-extension/README.md`
- `packages/vscode-extension/docs/manual-acceptance.md`
- optionally `docs/epics/04-vscode-run-template-epics.md` only if a small clarification is needed

**Actions:**

1. Document the new service boundaries:
   - target resolution
   - placeholder collection
   - run options
   - delivery adapters
   - capability checks
2. Document the current supported state after Epic 1:
   - editor output is supported
   - other delivery targets are planned but not implemented
3. Add a short "next integration points" note:
   - Epic 3 may change placeholder/input contracts
   - Epic 4 adds Copilot Chat delivery adapters and capability rules
   - Epic 6 adds fallback policy
   - Epic 7 adds LM API execution and streaming UI
4. Update manual acceptance steps so future epics can reuse the same run verification baseline.

**User-observable slice:** maintainers and reviewers can understand the new contract and validate the supported editor fallback path consistently.

**Validation:**

```bash
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Completion gate:** the refactor is documented well enough that later epics can extend it instead of re-cutting the orchestration boundary.

## Final Validation

After Step 7, run:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

Manual acceptance pass:

1. Run a template with no unresolved placeholders.
2. Run a template that uses defaults only.
3. Run a template that uses `$ctx.*` values only.
4. Run a template that requires manual inputs and complete the prompts.
5. Cancel during template selection.
6. Cancel during placeholder prompting.
7. Run from both Command Palette and tree view.

Expected result:

- all supported runs still end in editor output
- no partial output is created on cancellation
- recoverable exits are informational, not stack traces
- the extension now has one run orchestration path ready for later multi-target work

## Risks And Watchpoints

- **Do not change placeholder semantics in this epic.** The current prompt planner depends on frontmatter-declared placeholders. Epic 3 may replace or expand that contract.
- **Do not add fallback policy early.** Epic 6 owns priority between Copilot Chat, clipboard, and editor output.
- **Do not couple the service to VS Code engine-specific chat APIs yet.** The repo is still on `^1.96.0`; Epic 4 and Epic 7 should own engine uplift and runtime capability handling.
- **Do not let commands keep business logic.** If `runTemplate.ts` still owns branching decisions after Step 6, the refactor is incomplete.

## Recommended Follow-On Order

After this epic is complete:

1. Epic 3 — lock the runtime input contract if inline `{{input:...}}` support is being adopted next.
2. Epic 4 — add Copilot Chat delivery modes on top of the new delivery/capability seams.
3. Epic 7 — add LM API execution through a dedicated adapter and extension-owned surface.
4. Epic 6 — add explicit fallback policy across Copilot Chat, clipboard, and editor output.
