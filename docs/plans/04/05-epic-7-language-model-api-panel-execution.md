# Plan: Epic 7 — Language Model API Panel Execution

**Goal:** Add an optional Stencil-owned execution mode that runs resolved templates through the VS Code Language Model API and displays streamed responses inside the extension.

**Primary source documents:**

- `docs/epics/04-vscode-run-template-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `docs/promptvault-run-template.md`

**Current code baseline:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/delivery/editorDelivery.ts`
- `packages/vscode-extension/src/services/delivery/copilotChatDelivery.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/esbuild.mjs`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

## Scope Lock

This plan covers Epic 7 only.

In scope:

- implement an `lm-api` delivery adapter that plugs into the existing run orchestration
- probe VS Code LM API availability and compatible model availability truthfully at runtime
- add a dedicated Stencil-owned panel for streamed LM responses
- define singleton panel lifecycle, reset behavior, and cancellation behavior
- support a minimal but explicit model-selection path consistent with current VS Code LM APIs
- define clear user-visible behavior when no compatible model is available
- add the minimum command surface needed to make LM API execution user-observable and manually testable
- add tests for orchestration, capability handling, panel lifecycle, and degraded LM outcomes

Out of scope for this epic:

- clipboard delivery and global fallback priority from Epic 6
- wider run-mode/configuration consolidation from Epic 5
- generalized multi-turn conversation history
- MCP/provider routing beyond the VS Code Language Model API
- a React-based or separately bundled webview application

## Planning Notes Applied

- Each step ends in a user-observable run flow, not only service scaffolding.
- The plan keeps Epic 7 bounded to LM API execution, but it is shaped to fit the first multi-target wave alongside Epic 4 Copilot Chat delivery and Epic 6 explicit fallback work.
- Epic 3 remains contract work. LM API execution must consume normalized runtime inputs from core and the existing placeholder-input service, not introduce LM-specific inline-input parsing.

## Repo Facts That Matter

- Epic 1 seams already exist in code:
  - `runTemplateService.ts` owns orchestration
  - delivery targets already include `editor`, `copilot-chat`, `clipboard`, and `lm-api`
  - run modes already include `execute`
- Epic 4-style command and capability wiring already exists:
  - `copilot-chat` is implemented with explicit commands and runtime probing
  - `package.json` and `@types/vscode` are already on `^1.100.0`
- LM API is still only a type-level placeholder:
  - `capabilities.ts` marks `lm-api` as `implemented: false`
  - `runTemplateService.ts` has no LM adapter registration
  - there is no LM command, panel manager, or webview surface
- The repo currently has no webview asset pipeline:
  - `esbuild.mjs` bundles only `src/extension.ts`
  - there is no existing `webview/` or panel client bundle
- The local VS Code typings already expose the APIs needed for this epic:
  - `vscode.lm.selectChatModels()`
  - `LanguageModelChatMessage.User(...)`
  - `LanguageModelChat.sendRequest(...)`
  - `LanguageModelAccessInformation.canSendRequest(...)`
  - `LanguageModelError`
- The architecture document still describes the editor-only MVP and explicitly says no fallback targets or output-target setting were required for that earlier flow. Epic 7 is part of the post-MVP extension-owned delivery layer and should stay adapter-local.

## Desired Outcome

At the end of Epic 7:

- a user can run a template through a Stencil LM API command from the sidebar or command palette
- the existing template selection, context resolution, and placeholder input flow is reused unchanged
- the resolved prompt is sent to a compatible language model through the VS Code LM API
- a singleton Stencil panel opens, shows the prompt preview, streams the response, and ends in a clear complete or error state
- the user can cancel an in-flight LM run from the panel
- missing LM support or missing compatible models produces a clear, explicit outcome instead of an opaque failure
- LM execution remains optional and does not complicate the default editor or Copilot paths

## Cross-Epic Guardrails

- Keep `deliveryTarget`, `runMode`, and LM model selection as separate concerns.
  - `deliveryTarget` answers where the prompt goes.
  - `runMode` answers how that target behaves.
  - model selection answers which LM instance should execute the request.
- Do not put LM-specific behavior into core parsing, resolution, or placeholder prompting.
- Do not silently auto-fallback from `lm-api` to Copilot Chat or editor in this epic.
  - Epic 6 owns formal fallback priority.
  - In Epic 7, the LM path should fail clearly and leave explicit rerun choices to commands and future fallback policy.
- Do not introduce a separate frontend toolchain just to render the first LM response panel.
  - The repo does not have webview bundling infrastructure today.
  - The first panel should use extension-generated HTML with a minimal inline script and message protocol.
- Do not introduce conversational statefulness beyond the current run.
  - Each run is one resolved prompt, one request, one streamed response.

## Recommended Contract For Epic 7

Add or clarify these extension-level concepts before implementing the adapter.

### Delivery Target

- `lm-api` remains the target key for Language Model API execution

### Run Mode

- `execute` is the explicit LM mode
- `default` for `lm-api` should normalize to `execute`
- `insert` and `send` are not valid LM modes

### LM Capability Shape

Extend LM capability handling so it can express:

- whether the extension build implements LM execution
- whether `vscode.lm.selectChatModels` exists in the current runtime
- whether any compatible models are currently selectable
- which model selector will be used by default
- a user-facing unavailable reason for:
  - LM API absent from the runtime
  - no compatible model available
  - access blocked or permissions not yet granted at execution time

Recommended rule:

- use a broad default selector first, preferably `{ vendor: 'copilot' }`
- avoid hard-coding a family such as `gpt-4o` in the first pass because model family names are opaque and may vary
- treat “no models returned” as `target-unavailable`
- treat permission, blocked, not-found, and unknown request errors as delivery failures surfaced both in the panel and in the run outcome

### LM Panel State

Define a single panel state object that can represent:

- template name
- prompt text
- selected model label and id
- streaming status: `idle`, `streaming`, `completed`, `cancelled`, `error`
- accumulated response text
- structured error details
- whether a cancellation token source is attached to the current run

### Delivery Result Shape

Extend `RunTemplateDeliveryResult` so non-editor surfaces can identify themselves cleanly.

Recommended additions:

- optional `surfaceLabel`
- optional `panelTitle`

Do not overload `documentUri` to represent a webview panel.

### Cancellation Outcome

Extend run outcomes to distinguish LM execution cancellation from placeholder-input cancellation.

Recommended shape:

- `kind: 'cancelled'`
- `stage: 'placeholder-input' | 'lm-api-execution'`

This keeps user messaging truthful and lets tests differentiate input dismissal from response-stream cancellation.

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

### A. No-input execution template

```markdown
---
name: lm-no-input
description: LM API no-input flow
version: 1
---

Summarize the current file and list the next refactoring step.
Current file: {{$ctx.active_file_name}}
```

### B. Inline-input execution template

```markdown
---
name: lm-inline-input
description: LM API inline-input flow
version: 1
---

Review this code for {{input:focus_area:performance}} issues.
Context:
{{$ctx.active_selection}}
```

### C. Long-response template

```markdown
---
name: lm-streaming-check
description: LM API streaming and cancellation flow
version: 1
---

Produce a detailed, numbered review of the current module, including:

1. Architecture summary
2. Possible defects
3. Refactoring options
4. Test gaps
```

### D. Mixed metadata template

```markdown
---
name: lm-metadata-overlay
description: Mixed metadata and inline input flow
version: 1
placeholders:
  - name: audience
    description: Target audience
    required: false
    default: maintainers
---

Explain the current selection to {{input:audience}}.
Selected text:
{{$ctx.active_selection}}
```

For each user-visible slice:

1. Open an Extension Development Host with a workspace containing `.stencil/` templates.
2. Open a file and create a non-empty selection when validating context and inline-input prompting.
3. Invoke the LM command path introduced in that step.
4. Verify the panel opens or reuses the existing panel and the resolved prompt is shown.
5. Verify the response status transitions are correct for success, cancellation, and error cases.
6. Repeat once in an environment without compatible LM models when the step covers degraded behavior.

## Implementation Sequence

### Step 1 — Freeze Current LM Seams And Add Characterization Tests

**Objective:** Protect the current orchestration semantics before turning `lm-api` from a placeholder into a real target.

**Files to change:**

- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Actions:**

1. Extend service tests to lock the current behavior for:
   - unsupported `lm-api` target
   - invalid mode handling for `lm-api`
   - target-unavailable outcomes once LM capability starts returning a real unavailable reason
2. Add capability tests that make today’s LM state explicit:
   - no implementation
   - supported modes reserved as `default` and `execute`
   - unavailable reason text for the placeholder state
3. Add command-level tests for future LM command wiring, initially asserting the intended request shape even before production registration lands.
4. Do not change production behavior in this step except where tests expose an obvious mismatch.

**User-observable slice:** the current editor and Copilot flows still work, and `lm-api` remains an explicit unsupported path rather than an accidental gap.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- capabilities
pnpm --filter stencil-vscode test:unit -- runTemplate
```

**Completion gate:** current LM-related seams are covered well enough to refactor without losing outcome semantics.

---

### Step 2 — Add A Truthful LM Capability Model And Explicit LM Command Wiring

**Objective:** Make LM execution an explicit extension surface with accurate runtime availability reporting, even before full panel streaming is implemented.

**Files to change:**

- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Actions:**

1. Change `lm-api` capability handling from `implemented: false` to a real runtime probe.
2. Probe for LM API support by checking the presence of `vscode.lm.selectChatModels`.
3. Select compatible models using a default selector.
   - Recommended first selector: `{ vendor: 'copilot' }`
4. Report LM capability as:
   - implemented and available when at least one compatible model exists
   - implemented but unavailable when the API is absent or no compatible models are returned
5. Normalize `runMode` for LM execution.
   - Recommended: `default` on `lm-api` resolves to `execute`
   - `insert` and `send` should return `mode-unavailable`
6. Add one explicit command contribution and registration for LM execution.
   - Recommended command id: `stencil.runTemplateWithLanguageModel`
   - Route it through `runTemplate()` with `deliveryTarget: 'lm-api'`
7. Add or update user-visible messages so LM unavailability is clear and actionable.
   - Example: `Stencil Language Model execution is unavailable because no compatible Copilot-backed chat model is available.`

**Boundary note:** this step should not create a fake panel or pretend execution succeeded. It only makes the LM path explicit and truthful.

**User-observable slice:** a user can invoke a dedicated LM command and either reach the future execution path or get a clear, specific unavailability message instead of “not supported yet.”

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- capabilities
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode typecheck
```

**Completion gate:** LM execution is a first-class command surface with accurate availability reporting.

---

### Step 3 — Implement A Minimal Singleton Response Panel And Successful LM Execution Flow

**Objective:** Ship the first real Epic 7 run flow: resolve a template, execute it through the LM API, and stream the response into a Stencil-owned panel.

**Files to change:**

- `packages/vscode-extension/src/services/delivery/lmApiDelivery.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/lmResponsePanel.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/lmApiDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/lmResponsePanel.test.ts`

**Actions:**

1. Add an LM delivery adapter under `services/delivery/`.
2. Implement one-request execution using:
   - `vscode.lm.selectChatModels(...)`
   - `vscode.LanguageModelChatMessage.User(resolvedBody)`
   - `model.sendRequest(...)`
3. Create a singleton panel manager owned by the extension process.
   - It should create the panel on first use.
   - It should reveal and reset the same panel on later runs.
4. Render a minimal HTML-based panel from the extension.
   - Do not add a separate React app or new webview build pipeline in this step.
5. Show at minimum:
   - template name
   - selected model name/id
   - prompt preview
   - response text area
   - status indicator
6. Stream response text progressively into the panel by consuming `response.text`.
7. Mark the panel complete when the stream ends normally.
8. Return a delivery result that clearly identifies the surface as the Stencil LM response panel.
9. Wire the adapter into `getDeliveryAdapter()` for `lm-api`.

**Implementation note:** keep the panel state adapter-local. This is compatible with the architecture principle that the core stays stateless while adapters may keep UI state.

**User-observable slice:** a user can run a template with the LM command and watch the model response appear in a dedicated Stencil panel instead of Copilot Chat or a plain editor.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- lmApiDelivery
pnpm --filter stencil-vscode test:unit -- lmResponsePanel
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Run `lm-no-input` through the LM command.
2. Verify the panel opens and shows the prompt preview before or as streaming begins.
3. Verify streamed text appears incrementally.
4. Close the run and repeat with `lm-inline-input`.
5. Verify placeholder prompting still happens before any LM request is sent.

**Completion gate:** the core Epic 7 happy path works end to end from a real extension command.

---

### Step 4 — Add Deterministic Error Handling And In-Panel Cancellation

**Objective:** Make LM execution resilient by distinguishing unavailable, blocked, permission, cancellation, and generic failure paths.

**Files to change:**

- `packages/vscode-extension/src/services/delivery/lmApiDelivery.ts`
- `packages/vscode-extension/src/services/lmResponsePanel.ts`
- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/lmApiDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/lmResponsePanel.test.ts`

**Actions:**

1. Add a cancellation token source per LM run.
2. Add a panel action for canceling the active request.
   - Use a minimal webview message protocol or command message back to the extension.
3. Extend the panel state machine to represent:
   - `streaming`
   - `completed`
   - `cancelled`
   - `error`
4. Extend `runTemplateService` outcome handling so LM cancellation is surfaced as:
   - `kind: 'cancelled'`
   - `stage: 'lm-api-execution'`
5. Handle `LanguageModelError` explicitly.
   - `NoPermissions`
   - `Blocked`
   - `NotFound`
   - unknown LM failure
6. Mirror these failures in two places:
   - panel status and error text
   - run outcome / notification messaging
7. Ensure cancellation does not trigger editor fallback or Copilot fallback.
8. Ensure closing the panel during a live request either:
   - cancels the request immediately, or
   - leaves the request active only if that behavior is explicitly documented
   - Recommended: closing the panel cancels the active request to keep lifecycle simple and testable

**Boundary note:** do not add retry queues, background continuation, or conversational history here. Keep the lifecycle one run at a time.

**User-observable slice:** a user can stop a long-running LM response, and LM failures are presented as intentional states rather than broken streaming.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- lmApiDelivery
pnpm --filter stencil-vscode test:unit -- lmResponsePanel
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Run `lm-streaming-check`.
2. Cancel while text is still streaming.
3. Verify the panel status changes to cancelled and no further chunks are appended.
4. Re-run immediately and verify a fresh stream starts in the same panel.
5. Simulate or mock `LanguageModelError.Blocked` and verify the panel and notification explain the failure clearly.

**Completion gate:** cancellation and LM-specific failures are deterministic and do not leak into unrelated fallback paths.

---

### Step 5 — Add Minimal Model Selection Without Letting Epic 7 Turn Into Epic 5

**Objective:** Support explicit model choice where helpful while keeping the user-facing surface small and reversible.

**Files to change:**

- `packages/vscode-extension/src/services/delivery/lmApiDelivery.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/services/lmApiDelivery.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Actions:**

1. Decide on one minimal model-selection mechanism for Epic 7.
   - Recommended: support one optional “select model” command rather than introducing broad persisted mode/config UX here.
2. Recommended command:
   - `stencil.runTemplateWithLanguageModelSelectModel`
3. When invoked:
   - query compatible models with the same selector family used for default execution
   - show a Quick Pick when more than one model is available
   - pass the chosen `model.id` into the LM adapter
4. Keep the default LM command simple.
   - It should use the first compatible model or the previously selected model only if that behavior is explicitly chosen and documented.
   - Recommended for Epic 7: no persisted last-used model yet
5. If a selected model disappears between selection and send, surface a typed LM failure and ask the user to retry, rather than silently switching models.
6. Add tests for:
   - single-model path with no picker
   - multi-model picker path
   - picker cancellation
   - selected model not found at send time

**Boundary note:** avoid broader settings such as workspace/user default model persistence unless a concrete implementation is already trivial. Epic 5 owns coherent long-term command/config rationalization.

**User-observable slice:** a user can run with the default model for speed or explicitly choose a model when multiple compatible models are available.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode test:unit -- lmApiDelivery
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Invoke the default LM command and verify it runs without any extra prompt when one compatible model is available.
2. Invoke the select-model LM command in an environment with multiple models.
3. Verify the chosen model name/id appears in the panel header.
4. Cancel the picker and verify no request is sent.

**Completion gate:** explicit model choice exists, but the LM surface is still small enough for Epic 5 to refine later.

---

### Step 6 — Harden Panel Actions, Documentation, And Acceptance Coverage

**Objective:** Close the epic with stable user-facing behavior, targeted tests, and documentation that reflects the actual implementation rather than the aspirational PromptVault spec.

**Files to change:**

- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/services/lmApiDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/lmResponsePanel.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/smoke/...` if a minimal smoke assertion is feasible
- `packages/vscode-extension/README.md` or the relevant extension docs
- `docs/plans/04/05-epic-7-language-model-api-panel-execution.md` only if implementation decisions materially diverge

**Actions:**

1. Add or tighten unit coverage for:
   - successful execution
   - unavailable LM API
   - no compatible models
   - permission/block/not-found errors
   - cancellation
   - singleton panel reuse
   - model-selection cancellation
2. Add smoke coverage only where the current harness can verify it honestly.
   - Good candidates: command registration, request wiring, panel-manager invocation with mocks
   - Avoid over-promising live LM streaming in CI if the harness cannot provide a real model
3. Document:
   - how LM execution differs from Copilot Chat delivery
   - what the panel shows
   - how cancellation works
   - what happens when no compatible model is available
   - what remains deferred to Epic 5 and Epic 6
4. Review panel wording for consistency with existing run outcome messages.
5. Confirm no new behavior regresses editor or Copilot flows.

**User-observable slice:** the LM API path is documented, test-backed, and stable enough to coexist with the other run targets.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Completion gate:** Epic 7 is implemented with bounded UX, truthful degraded behavior, and tests that match the real runtime surface.

## Acceptance Checklist

- `lm-api` is implemented as a real delivery target in the extension.
- a dedicated command exists to run templates through the Language Model API.
- the existing template-selection and placeholder-input flow is reused unchanged before LM execution.
- the extension opens a singleton Stencil-owned panel for LM responses.
- the panel shows prompt preview, model identity, response text, and status.
- streaming updates append incrementally and complete cleanly.
- the user can cancel an active LM request.
- `default` on `lm-api` resolves to `execute`, and unsupported LM modes return a typed unavailable outcome.
- missing LM API support or zero compatible models produces a clear unavailable result.
- LM errors are surfaced clearly without silently falling back to another target.
- editor and Copilot flows still pass their existing tests after LM changes land.

## Recommended Follow-Ons After Epic 7

1. Epic 5 — rationalize the full command/config surface so Copilot, LM, editor, and future clipboard modes are presented coherently.
2. Epic 6 — define explicit fallback priority and rerun affordances across LM, Copilot, clipboard, and editor targets.
3. Epic 8 — add broader compatibility hardening once the full multi-target run flow is in place.
