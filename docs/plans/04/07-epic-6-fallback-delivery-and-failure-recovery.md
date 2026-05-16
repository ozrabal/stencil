# Plan: Epic 6 — Fallback Delivery and Failure Recovery

**Goal:** Make run-template execution resilient when a preferred delivery target cannot complete by implementing clipboard delivery, formalizing fallback order, and keeping editor output as both an explicit user-facing mode and the final reliable recovery path.

**Primary source documents:**

- `docs/epics/04-vscode-run-template-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `docs/promptvault-run-template.md`

**Current code baseline:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/runConfiguration.ts`
- `packages/vscode-extension/src/services/runPreferenceStore.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/delivery/editorDelivery.ts`
- `packages/vscode-extension/src/services/delivery/copilotChatDelivery.ts`
- `packages/vscode-extension/src/services/delivery/lmApiDelivery.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

## Scope Lock

This plan covers Epic 6 only.

In scope:

- implement a real clipboard delivery adapter
- formalize fallback priority and execution rules across supported delivery targets
- keep editor output as a first-class explicit mode and as the last fallback
- define recoverable error behavior for unavailable Copilot Chat, failed Copilot handoff, unsupported runtime capability, and user cancellation
- expose the minimum command/configuration surface required to make clipboard and fallback behavior intentional and testable
- add service, command, and capability coverage for success, degraded, and failure outcomes

Out of scope for this epic:

- new placeholder or inline input parsing work from Epic 3
- deeper Copilot adapter feature work beyond fallback integration
- LM API panel UX redesign or conversational state
- unrelated tree-view redesign or template authoring UX
- generalized retry orchestration across multiple external providers

## Planning Notes Applied

- Each step ends in a user-observable run flow, not only a service refactor.
- The first implementation wave is kept coherent across Copilot Chat, LM API execution, and explicit fallback modes.
- Clipboard is introduced as both an explicit user choice and a recovery target, but editor remains the explicit durable destination.
- Epic 3 remains contract work. This plan does not add adapter-only input preprocessing.

## Repo Facts That Matter

- The extension already has a multi-target orchestration layer in `runTemplateService.ts`.
- Copilot Chat and LM API adapters exist and are wired into the service.
- Editor delivery is fully implemented and already used as the only real fallback surface.
- Clipboard appears in the `RunTemplateDeliveryTarget` union and in capability probing, but today it is still `implemented: false` and has no adapter.
- Current fallback behavior is hard-coded and Copilot-specific:
  - unavailable Copilot Chat falls back directly to editor
  - unsupported Copilot chat mode falls back directly to editor
  - Copilot delivery exceptions fall back directly to editor
  - LM API does not currently fall back; it returns `target-unavailable` or `delivery-failed`
- Epic 5 added command/configuration seams, but the contributed surface still excludes clipboard:
  - `stencil.run.defaultTarget` does not allow `clipboard`
  - there is no `stencil.runTemplateToClipboard` command
  - `normalizeRunProfile()` has no clipboard branch
- The architecture document explicitly assigns fallback messaging to the shared run service and says editor delivery remains a first-class explicit target.
- The PRD requires clear failure messages and describes fallback to clipboard/editor output when direct integration is unavailable.

## Desired Outcome

At the end of Epic 6:

- users can explicitly run a template to the clipboard
- Copilot Chat delivery degrades intentionally to clipboard first and editor second when configured recovery allows it
- LM API execution can also degrade through the same explicit fallback policy instead of failing in a target-specific ad hoc way
- editor output remains available as its own command and can still serve as the final recovery path
- cancellation stays non-destructive and does not trigger fallback
- outcome messaging tells the user what happened, where the resolved prompt ended up, and what failed
- Epic 8 can harden behavior without having to reinterpret fallback semantics

## Cross-Epic Guardrails

- Keep `deliveryTarget`, `mode`, and fallback target separate.
  - `deliveryTarget` is the requested primary destination.
  - `mode` is how that destination behaves.
  - fallback target is the recovery destination after a recoverable delivery problem.
- Do not trigger fallback for input cancellation or explicit user cancellation during LM execution.
- Do not silently discard the original failure reason when falling back.
  - the service outcome and user message must preserve both the failure cause and the delivered fallback surface
- Do not make fallback policy command-specific.
  - the service should own fallback sequencing so command, tree-item, and future callers behave the same way
- Do not remove editor as an explicit mode just because clipboard exists.
- Do not auto-fallback from one unavailable mode into a different semantic mode on the same target.
  - for example, unsupported Copilot `agent` mode should recover through fallback delivery, not silently convert to Copilot `ask`

## Recommended Contract For Epic 6

Define one service-owned fallback policy contract and keep it typed.

### Supported Explicit Targets After This Epic

- `editor`
- `copilot-chat`
- `lm-api`
- `clipboard`

### Supported Explicit Modes After This Epic

- `editor`: `default`
- `copilot-chat`: `insert`, `send`
- `lm-api`: `execute`
- `clipboard`: `default`

`clipboard` should reject `insert`, `send`, and `execute` as invalid for that target.

### Recommended Fallback Policy Shape

Add a normalized fallback policy concept such as:

- requested target
- ordered fallback targets
- whether fallback is allowed for target-unavailable
- whether fallback is allowed for delivery failure
- whether fallback is allowed for mode-unavailable or chat-mode-unavailable

Recommended default policy:

- `copilot-chat`:
  - on unavailable, chat-mode-unavailable, or delivery-failed -> `clipboard`, then `editor`
- `lm-api`:
  - on target-unavailable or delivery-failed -> `clipboard`, then `editor`
- `clipboard`:
  - on unavailable or delivery-failed -> `editor`
- `editor`:
  - no fallback

Cancellation rule:

- `cancelled` at placeholder-input or `lm-api-execution` stops immediately with no fallback attempt

### Recommended Outcome Shape

The current `completed-with-fallback` outcome is close but too narrow because it assumes one implicit editor fallback.

Extend it so it can represent:

- `requestedDeliveryTarget`
- `fallbackDeliveryTarget`
- `fallbackReason`
- `failedStage` or `failureKind`
- final `delivery`

Keep `delivery-failed` for the case where both primary and fallback delivery paths fail.

### Recommended User Message Rules

- Explicit clipboard success:
  - `Ran "template". Copied resolved prompt to clipboard.`
- Copilot fallback success:
  - `Copilot Chat is unavailable because ... Copied the resolved prompt to clipboard instead.`
- Clipboard-to-editor fallback success:
  - `Clipboard delivery failed because ... Opened the resolved prompt in a new editor instead.`
- Total failure:
  - include both the primary failure and fallback failure in one error message
- Cancellation:
  - remain informational and do not mention fallback

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
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

## Manual Validation Matrix

Use at least these templates during manual checks.

### A. No-input fallback template

```markdown
---
name: fallback-no-input
description: Primary target unavailable flow
version: 1
---

Summarize the current file: {{$ctx.active_file_name}}
```

### B. Inline-input fallback template

```markdown
---
name: fallback-inline-input
description: Input and degraded delivery flow
version: 1
---

Review this code for {{input:focus_area:performance}} issues.
Context:
{{$ctx.active_selection}}
```

### C. LM execution fallback template

```markdown
---
name: fallback-lm-api
description: LM unavailable or failed delivery flow
version: 1
---

Produce a review checklist for the current module and list the top three risks.
```

### D. Clipboard explicit mode template

```markdown
---
name: fallback-clipboard-explicit
description: Explicit clipboard run flow
version: 1
---

Generate a prompt for a follow-up review of {{$ctx.active_file_name}}.
```

For each user-visible slice:

1. Open an Extension Development Host with a workspace containing `.stencil/` templates.
2. Open a file and create a non-empty selection when validating input and context behavior.
3. Invoke the command path added or changed in that step.
4. Verify the final surface:
   - Copilot Chat opened
   - clipboard contains the resolved prompt
   - or a new editor opened with the resolved prompt
5. Verify the notification explains both the failed primary target and the final fallback surface when degradation occurs.
6. Repeat the same flow with simulated unavailable runtime capability where the step requires it.

## Implementation Sequence

### Step 1 — Freeze Existing Fallback Semantics With Characterization Coverage

**Objective:** Protect the current Copilot-to-editor behavior before widening Epic 6 to clipboard and generalized fallback sequencing.

**Files to change:**

- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Actions:**

1. Add or tighten service tests for all current degraded paths:
   - unavailable Copilot Chat
   - unsupported Copilot chat mode
   - Copilot delivery exception
   - LM target unavailable without fallback
   - cancellation short-circuiting without fallback
2. Add outcome-message assertions for:
   - `completed`
   - `completed-with-fallback`
   - `delivery-failed`
   - `target-unavailable`
3. Add capability tests that make the current clipboard state explicit:
   - runtime probe exists
   - implementation is still false before this epic’s production changes
4. Add command-level tests that confirm the default and explicit command paths surface the same service-owned fallback messages.

**User-observable slice:** current users still see the existing Copilot-to-editor fallback behavior, but it is now locked by tests.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- capabilities
pnpm --filter stencil-vscode test:unit -- runTemplate
```

**Completion gate:** fallback behavior is no longer implicit or accidental from a testing standpoint.

---

### Step 2 — Implement Clipboard Delivery As A Real Explicit Target

**Objective:** Ship clipboard delivery end to end before using it as a recovery destination.

**Files to add:**

- `packages/vscode-extension/src/services/delivery/clipboardDelivery.ts`
- `packages/vscode-extension/test/unit/services/clipboardDelivery.test.ts`

**Files to change:**

- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`

**Actions:**

1. Implement a clipboard delivery adapter around `vscode.env.clipboard.writeText`.
2. Return a proper `RunTemplateDeliveryResult` for clipboard with user-facing labels such as:
   - action: `copied`
   - target label: `clipboard`
3. Mark clipboard capability as `implemented: true` and `supportedModes: ['default']`.
4. Update mode validation so clipboard rejects unsupported modes predictably.
5. Register the clipboard adapter in `runTemplateService.ts`.
6. Add unit coverage for:
   - successful clipboard copy
   - unavailable clipboard runtime
   - clipboard write failure producing a typed failure

**User-observable slice:** an internal or test-invoked run can now copy the resolved prompt to the clipboard as a true delivery result instead of a stub.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- clipboardDelivery
pnpm --filter stencil-vscode test:unit -- runTemplateService
```

**Manual validation:**

1. Invoke a temporary test harness or explicit command path targeting `clipboard`.
2. Confirm the system clipboard contains the resolved prompt text.
3. Confirm the completion message says the prompt was copied, not opened.

**Completion gate:** clipboard is a real target with capability truth, adapter behavior, and tests.

---

### Step 3 — Generalize Fallback Sequencing Inside `runTemplateService`

**Objective:** Replace the current Copilot-specific editor fallback branch with one reusable fallback policy that can handle Copilot Chat, LM API, and clipboard consistently.

**Files to change:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`

**Actions:**

1. Extract fallback decision logic into a service-local helper or dedicated module, for example:
   - resolve fallback chain for requested target
   - attempt fallback targets in order
   - stop on first successful fallback delivery
2. Replace `attemptEditorFallback()` with a generalized fallback attempt function.
3. Update `completed-with-fallback` so it records:
   - requested target
   - actual fallback target used
   - reason for fallback
4. Apply the same fallback policy to:
   - Copilot `target-unavailable`
   - Copilot `chat-mode-unavailable`
   - Copilot delivery exception
   - LM `target-unavailable`
   - LM delivery exception
   - clipboard delivery exception
5. Preserve non-fallback outcomes for:
   - user cancellation
   - no target selected
   - unresolved placeholders after prompting
6. Make total failure report both the original target failure and the final fallback failure.

**Recommended implementation order inside the step:**

1. Generalize the outcome shape.
2. Add fallback-chain tests for service-level dry execution.
3. Migrate Copilot fallback to clipboard -> editor.
4. Migrate LM failure handling to the same chain.
5. Add clipboard -> editor recovery.

**User-observable slice:** when Copilot Chat cannot complete, the prompt is copied to clipboard first and only falls back to editor if clipboard cannot be used.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- runTemplateService
```

**Manual validation:**

1. Disable or simulate missing Copilot Chat and run a Copilot-targeted template.
2. Confirm the prompt lands in the clipboard.
3. Simulate clipboard failure and confirm the prompt then opens in an editor.
4. Simulate LM model unavailability and confirm the same clipboard-first behavior.

**Completion gate:** fallback policy is target-aware, ordered, and owned by the run service instead of bespoke Copilot branches.

---

### Step 4 — Expose Clipboard As An Explicit User-Facing Run Mode

**Objective:** Make clipboard delivery intentional in the command palette, tree view, and configuration surface rather than only an invisible recovery mechanism.

**Files to change:**

- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/providers/templateTreeProvider.ts`
- `packages/vscode-extension/src/services/runConfiguration.ts`
- `packages/vscode-extension/src/services/runPreferenceStore.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/providers/templateTreeProvider.test.ts`

**Actions:**

1. Add an explicit command id such as `stencil.runTemplateToClipboard`.
2. Register the command in extension activation and wire it to `{ deliveryTarget: 'clipboard' }`.
3. Add the command to `package.json` contributions:
   - command palette
   - template tree context menu
4. Extend `stencil.run.defaultTarget` to include `clipboard`.
5. Update `normalizeRunProfile()` to handle `clipboard` cleanly:
   - normalize mode to `default`
   - ignore `chatMode`
   - warn on invalid clipboard mode combinations
6. Ensure last-used profile persistence can round-trip clipboard profiles without additional changes or test gaps.
7. Add command and configuration tests for:
   - explicit clipboard command
   - clipboard as configured default target
   - picker or last-used flows resolving to clipboard

**User-observable slice:** users can choose `Stencil: Run Template to Clipboard` directly, and clipboard can be selected as the default run target.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode test:unit -- templateTreeProvider
```

**Manual validation:**

1. Run `Stencil: Run Template to Clipboard` from the command palette.
2. Run the same command from the template tree context menu.
3. Set `stencil.run.defaultTarget` to `clipboard`, run `Stencil: Run Template`, and confirm the clipboard path is used.

**Completion gate:** clipboard is a supported, discoverable explicit mode, not only a hidden service behavior.

---

### Step 5 — Tighten Failure Messaging And Recovery Transparency

**Objective:** Make degraded execution understandable without forcing users to infer what failed and where the prompt finally went.

**Files to change:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/errors.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Actions:**

1. Normalize fallback success messages around a consistent pattern:
   - original target failure reason
   - final fallback surface
   - template name when useful
2. Ensure `showRunTemplateOutcomeMessage()` distinguishes:
   - explicit clipboard success
   - fallback-to-clipboard success
   - fallback-to-editor success
   - total delivery failure
3. Make message wording truthful for runtime capability failures versus thrown delivery exceptions.
4. Ensure cancellation messaging stays concise and does not imply an error or fallback.
5. Add tests covering the exact messages for the most important degraded paths.

**User-observable slice:** fallback and failure notifications now explain the outcome clearly enough that users know whether to paste from the clipboard or look at a newly opened editor.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- runTemplate
```

**Completion gate:** every degraded path has a user-facing message that accurately describes both failure and recovery.

---

### Step 6 — Run Full Multi-Target Acceptance And Close The Epic

**Objective:** Validate the first coherent delivery wave end to end: Copilot Chat, LM API, clipboard, and explicit editor fallback.

**Files to change:**

- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- optional manual validation notes if the repo keeps them

**Actions:**

1. Add final matrix coverage for these service paths:
   - Copilot success
   - Copilot unavailable -> clipboard
   - Copilot unavailable + clipboard unavailable -> editor
   - Copilot send failure -> clipboard
   - LM unavailable -> clipboard
   - LM delivery failure -> clipboard or editor if clipboard fails
   - explicit clipboard success
   - explicit clipboard unavailable -> editor
   - explicit editor success
   - cancellation without fallback
2. Run the full unit and smoke suite.
3. Manually validate one coherent user workflow per primary target:
   - default Copilot run
   - default LM run
   - explicit clipboard run
   - explicit editor run
4. Verify command/configuration behavior still matches Epic 5 semantics after clipboard is added to the surface.

**User-observable slice:** the extension now has a complete recoverable run flow across the first-wave delivery targets.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Completion gate:** Epic 6 is done only when fallback behavior is consistent across targets, user messaging is explicit, and the multi-target flow is verifiably runnable.

## Acceptance Checklist

- Clipboard delivery is implemented and tested as a first-class adapter.
- `runTemplateService.ts` owns fallback sequencing and messaging.
- Copilot Chat no longer falls back directly to editor when clipboard is healthy.
- LM API failures have the same recovery model as Copilot Chat where appropriate.
- Editor remains an explicit command target and the final recovery path.
- Clipboard is available in commands and configuration.
- Cancellation never triggers fallback.
- Unit and smoke validation cover supported and degraded flows.
