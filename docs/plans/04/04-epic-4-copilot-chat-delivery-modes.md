# Plan: Epic 4 — Copilot Chat Delivery Modes

**Goal:** Deliver resolved templates into GitHub Copilot Chat as the primary VS Code run experience, with explicit insert and direct-send behaviors, bounded chat-mode support, and clear fallback behavior when Copilot Chat is unavailable.

**Primary source documents:**

- `docs/epics/04-vscode-run-template-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `docs/promptvault-run-template.md`

**Current code baseline:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/src/services/delivery/editorDelivery.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

## Scope Lock

This plan covers Epic 4 only.

In scope:

- implement a Copilot Chat delivery adapter around `workbench.action.chat.open`
- support insert behavior as the default Copilot Chat path
- support explicit direct-send behavior
- support chat-mode selection where the host/runtime can support it
- raise the VS Code engine and typings baseline as required for the supported behavior
- add runtime capability detection and failure handling for Copilot Chat delivery
- define and implement a clear fallback path when Copilot Chat is unavailable or chat handoff fails
- expose the minimum command surface needed to make Epic 4 user-observable and manually testable

Out of scope for this epic:

- LM API panel execution implementation from Epic 7
- clipboard delivery implementation from Epic 6
- full run-mode/configuration UX consolidation from Epic 5
- new placeholder parsing or input normalization beyond the Epic 3 contract
- tree view redesign, Webview authoring UX, or persistent mode preference UX

## Planning Notes Applied

- Each step ends in a user-observable run flow, not only service scaffolding.
- The plan keeps Epic 4 focused on Copilot Chat delivery, but all contracts are shaped so the first multi-target wave can still converge cleanly with Epic 7 LM API execution and Epic 6 explicit fallback modes.
- Epic 3 remains core contract work. Copilot Chat delivery must consume normalized runtime inputs from core and the existing placeholder-input service, not add VS Code-only inline-input preprocessing.

## Repo Facts That Matter

- Epic 1 seams already exist in code:
  - `runTemplateService.ts` owns orchestration
  - delivery targets already include `editor`, `copilot-chat`, `clipboard`, and `lm-api`
  - capabilities are already probed through `getDeliveryTargetCapability()`
- Epic 4 is not implemented yet:
  - `copilot-chat` is still marked `implemented: false`
  - only `editorDeliveryAdapter` exists
  - `runTemplate.ts` exposes only `stencil.runTemplate`
  - `package.json` still targets VS Code `^1.96.0`
- Epic 3-style normalized runtime input data is already present in core:
  - `ResolutionResult.inputs`
  - `buildPlaceholderPromptPlan()` already prompts from normalized input metadata rather than frontmatter only
- The local VS Code typings already include LM APIs, but there is still no extension-side Copilot Chat adapter or command surface.
- `docs/promptvault-run-template.md` defines the intended Copilot behavior:
  - insert uses `workbench.action.chat.open` with `isPartialQuery: true`
  - direct-send omits `isPartialQuery`
  - chat modes are `ask`, `edit`, and `agent`
  - that document states mode support begins at VS Code `1.100+`

## Desired Outcome

At the end of Epic 4:

- a user can run a template into Copilot Chat from the extension workflow
- the default Copilot path inserts the resolved prompt without auto-submitting
- direct-send is available as an explicit alternative
- chat modes are represented explicitly in extension contracts and only offered when supported
- missing Copilot Chat support does not produce a confusing hard failure
- editor fallback remains available and intentional until Epic 6 formalizes wider fallback policy
- Epic 5 can later rationalize command names, defaults, and persisted preferences without reworking the adapter

## Cross-Epic Guardrails

- Keep `deliveryTarget`, `runMode`, and `chatMode` as separate concepts.
  - `deliveryTarget` answers where the prompt goes.
  - `runMode` answers how that target behaves.
  - `chatMode` answers which Copilot Chat sub-mode is requested.
- Do not make Copilot Chat assumptions inside core or inside placeholder parsing.
- Do not let Epic 4 absorb LM API or clipboard implementation just because those targets already exist in the type union.
- If a temporary command or Quick Pick is needed to make Copilot delivery runnable now, keep it minimal and clearly provisional so Epic 5 can replace it with a coherent final command/config surface.

## Recommended Contract For Epic 4

Add these extension-level concepts before implementing the adapter:

### Delivery Target

- `editor`
- `copilot-chat`
- existing `clipboard` and `lm-api` entries stay in the type system for future epics

### Run Mode

- `default`
- `insert`
- `send`
- existing `execute` remains reserved for LM API

### Copilot Chat Mode

- `ask`
- `edit`
- `agent`

### Capability Shape

Extend the Copilot capability model so it can express:

- whether Copilot Chat handoff is implemented in this build
- whether the `workbench.action.chat.open` command is present at runtime
- which run modes are supported for the target
- which chat modes are supported at the current engine/runtime level
- the user-facing reason when the target or a mode is unavailable

Recommended rule:

- if the chat-open command is missing, Copilot Chat is unavailable
- if the runtime does not meet the chosen minimum for chat modes, only `ask` is supported
- if a caller asks for `edit` or `agent` when unsupported, return a typed unavailable outcome rather than silently degrading

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

Use at least these templates during manual checks:

### A. No-input template

```markdown
---
name: chat-no-input
description: Copilot Chat no-input flow
version: 1
---

Summarize the current file: {{$ctx.active_file_name}}
```

### B. Inline-input template

```markdown
---
name: chat-inline-input
description: Copilot Chat inline-input flow
version: 1
---

Review this change for {{input:focus_area:performance}} issues.
Context:
{{$ctx.active_selection}}
```

### C. Mixed metadata template

```markdown
---
name: chat-metadata-overlay
description: Mixed metadata flow
version: 1
placeholders:
  - name: review_type
    description: Review type
    required: false
    default: general
---

Run a {{input:review_type}} review on {{$ctx.active_file_name}}.
```

For each user-visible slice:

1. Open an Extension Development Host with a workspace containing `.stencil/` templates.
2. Open a file and create a non-empty selection when validating context and inline-input prompting.
3. Invoke the command path introduced in that step.
4. Verify the resolved text appears in Copilot Chat or the fallback editor as expected.
5. Repeat once with Copilot Chat disabled or unavailable when the step covers degraded behavior.

## Implementation Sequence

### Step 1 — Freeze Current Delivery Seams And Add Copilot-Target Characterization Tests

**Objective:** Protect the current service contracts before Copilot Chat behavior is introduced.

**Files to change:**

- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Actions:**

1. Extend service tests to lock the current behavior for:
   - unsupported `copilot-chat` target
   - `mode-unavailable` outcomes
   - `target-unavailable` messaging
   - current editor fallback path remaining unaffected
2. Add capability tests that make today’s Copilot state explicit:
   - not implemented
   - unavailable
   - currently supported modes list
3. Add command-level tests for passing explicit run options from command wiring into the service.
4. Do not change production behavior in this step except where tests expose an obvious mismatch.

**User-observable slice:** the current editor run still works, and Copilot Chat remains an explicit unsupported path rather than accidental behavior.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- capabilities
pnpm --filter stencil-vscode test:unit -- runTemplate
```

**Completion gate:** the current delivery abstraction is covered well enough to change without losing outcome semantics.

---

### Step 2 — Raise The VS Code Baseline And Add A Real Copilot Capability Model

**Objective:** Move the extension to a VS Code/API baseline that matches the supported Copilot Chat behavior and replace the placeholder capability stub with a real runtime probe.

**Files to change:**

- `packages/vscode-extension/package.json`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/manifest.test.ts`

**Actions:**

1. Raise `engines.vscode` and `@types/vscode` together to a version compatible with the intended chat-mode support.
   - Recommended minimum: `^1.100.0`, because the run-template spec says `mode` support begins at `1.100+`.
2. Add an explicit `RunTemplateChatMode` type, defaulting to `ask`.
3. Extend the run request and delivery contracts so Copilot-targeted calls can carry:
   - `deliveryTarget`
   - `mode`
   - `chatMode`
4. Replace the hard-coded Copilot stub in `capabilities.ts` with a runtime probe based on:
   - `vscode.commands.getCommands(true)` including `workbench.action.chat.open`
   - engine/version gating for chat-mode support
5. Extend the capability result for `copilot-chat` to include supported chat modes.
6. Keep `clipboard` and `lm-api` capability shapes compatible with the richer contract even though they remain unimplemented here.

**Implementation note:** keep capability probing isolated and deterministic so unit tests can mock it directly. Do not spread command-list probing through the service layer.

**User-observable slice:** the extension can now distinguish between:

- Copilot Chat not installed/unavailable
- Copilot Chat installed but a requested mode not supported
- Copilot Chat available for at least the default insert/ask flow

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- capabilities
pnpm --filter stencil-vscode test:unit -- manifest
```

**Manual validation:**

1. Launch the extension host without Copilot Chat available and verify the reported reason is clear.
2. Launch with Copilot Chat available and verify the capability probe marks the target as available.

**Completion gate:** the extension has a truthful runtime contract for Copilot Chat support instead of a placeholder stub.

---

### Step 3 — Implement Copilot Chat Insert Delivery End To End

**Objective:** Ship the default Epic 4 flow: resolve a template and insert it into Copilot Chat without auto-submitting.

**Files to add:**

- `packages/vscode-extension/src/services/delivery/copilotChatDelivery.ts`

**Files to change:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Actions:**

1. Implement a `copilotChatDeliveryAdapter` that calls:

   ```ts
   vscode.commands.executeCommand('workbench.action.chat.open', {
     query: resolvedBody,
     isPartialQuery: true,
   });
   ```

2. Return a delivery result that clearly identifies Copilot Chat as the target.
3. Register the adapter in `runTemplateService.ts`.
4. Mark `copilot-chat` as implemented for the insert/default path when the runtime capability probe passes.
5. Add the minimum runnable command surface needed for manual use.
   - Recommended: add one explicit command contribution for Copilot insert, for example `Stencil: Run Template in Copilot Chat`.
   - Keep this intentionally small; Epic 5 will own the final command matrix.
6. Ensure the existing `stencil.runTemplate` editor path is preserved and untouched unless explicitly invoked with Copilot options.
7. Cover with tests:
   - command wiring passes `deliveryTarget: 'copilot-chat'`
   - service calls the Copilot adapter for the no-input path
   - service still prompts unresolved inputs before handoff
   - adapter sends `isPartialQuery: true`

**User-observable slice:** a user can run a template from the extension and see the resolved prompt inserted into Copilot Chat for review before pressing Enter.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- runTemplate
```

**Manual validation:**

1. Run the Copilot insert command on the no-input template.
2. Verify Copilot Chat opens with the resolved prompt inserted and not submitted.
3. Run the same command on the inline-input template.
4. Verify unresolved inputs are prompted first and the final resolved prompt is inserted.

**Completion gate:** the default Copilot Chat insert flow works end to end from a real extension command.

---

### Step 4 — Add Explicit Direct-Send Behavior

**Objective:** Support a second explicit Copilot delivery behavior that submits the resolved prompt immediately.

**Files to change:**

- `packages/vscode-extension/src/services/delivery/copilotChatDelivery.ts`
- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`

**Actions:**

1. Extend the Copilot adapter to support both:
   - `insert`: pass `isPartialQuery: true`
   - `send`: omit `isPartialQuery`
2. Update capability reporting so `copilot-chat` supports `default`, `insert`, and `send`.
   - Recommended mapping: `default` on Copilot Chat resolves to `insert`.
3. Add the minimum explicit invocation path for send mode.
   - Recommended: a second command contribution such as `Stencil: Run Template in Copilot Chat (Send)`.
4. Ensure the outcome message reflects whether the prompt was inserted or sent.
5. Add tests that verify:
   - insert mode still passes `isPartialQuery: true`
   - send mode omits `isPartialQuery`
   - invalid `send` requests on non-Copilot targets still return typed unsupported or unavailable outcomes

**User-observable slice:** a user can choose between reviewing a prompt in chat first or sending it immediately.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- runTemplate
```

**Manual validation:**

1. Invoke the insert command and confirm the prompt is not submitted.
2. Invoke the send command and confirm the prompt is submitted immediately.
3. Repeat once with a template that requires interactive inputs first.

**Completion gate:** insert-versus-send is explicit, test-covered, and not encoded as one hidden boolean inside the command layer.

---

### Step 5 — Add Chat-Mode Support With Runtime Gating

**Objective:** Support `ask`, `edit`, and `agent` chat modes when the runtime supports them, without lying about availability on older hosts.

**Files to change:**

- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/delivery/copilotChatDelivery.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`

**Actions:**

1. Thread `chatMode` through the request pipeline and into the Copilot adapter.
2. Implement adapter behavior:
   - always allow `ask`
   - pass `mode: 'edit'` or `mode: 'agent'` only when the capability layer marks them supported
3. Add a minimal user-observable selection path.
   - Recommended: one temporary Quick Pick for Copilot Chat mode selection, or separate explicit commands if that is simpler.
   - Keep it intentionally narrow. Epic 5 will own the final UX and persistence rules.
4. Add typed outcomes for unsupported chat modes instead of silently downgrading to `ask`.
5. Update tests for:
   - runtime supports only `ask`
   - runtime supports `ask`, `edit`, and `agent`
   - requesting `agent` on an unsupported runtime returns a typed unavailable outcome
   - supported runtimes pass the `mode` argument through `executeCommand`

**Implementation note:** do not rely on silent host behavior for correctness. If the extension knows a mode is unsupported, it should not pretend the request succeeded.

**User-observable slice:** a user can choose a supported Copilot Chat mode and the extension will either honor it or explain why it cannot.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- capabilities
pnpm --filter stencil-vscode test:unit -- runTemplateService
```

**Manual validation:**

1. On a runtime that supports chat modes, run insert into `ask`, `edit`, and `agent`.
2. Confirm each mode opens the expected Copilot Chat mode with the resolved prompt.
3. On an older runtime, confirm only `ask` is offered or other modes fail with a clear explanation.

**Completion gate:** chat-mode support is explicit, capability-aware, and separated cleanly from insert/send behavior.

---

### Step 6 — Add Recoverable Failure Handling And Explicit Editor Fallback

**Objective:** Make Copilot Chat failures non-destructive by falling back to the existing editor delivery path with transparent messaging.

**Files to change:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/delivery/copilotChatDelivery.ts`
- `packages/vscode-extension/src/services/errors.ts`
- `packages/vscode-extension/src/services/delivery/types.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/errors.test.ts`

**Actions:**

1. Define which Copilot failures are recoverable:
   - chat-open command missing
   - command execution throws
   - requested chat mode unavailable
2. Preserve the requested resolved prompt text so recoverable failures can still fall back cleanly.
3. Implement explicit fallback to `editor` for the Copilot run path in this epic.
   - Keep the fallback message clear, for example: Copilot Chat unavailable, opened the resolved prompt in a new editor instead.
4. Keep cancellation semantics unchanged.
   - if the user cancels placeholder input, do not open either chat or editor
5. Return typed outcomes that distinguish:
   - Copilot succeeded
   - Copilot unavailable and editor fallback used
   - unrecoverable failure
6. Add tests for:
   - unavailable Copilot command causes editor fallback
   - `executeCommand()` throw causes editor fallback
   - editor fallback is not attempted after user cancellation

**Boundary note:** this is not the full Epic 6 fallback matrix. It is the minimum explicit fallback behavior required so Epic 4 does not strand the user when the new primary target is unavailable.

**User-observable slice:** if Copilot Chat cannot accept the prompt, the run still completes in the existing editor path and explains what happened.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit -- errors
```

**Manual validation:**

1. Run a Copilot Chat command in an environment without Copilot Chat.
2. Verify the resolved prompt opens in a new editor with a clear fallback message.
3. Simulate or mock a Copilot command failure and verify the same fallback behavior.

**Completion gate:** Copilot Chat is the primary path, but the user is not blocked when that path is unavailable.

---

### Step 7 — Harden Command/Manifest Coverage And Document Manual Acceptance

**Objective:** Finish Epic 4 with durable verification and clear operator guidance.

**Files to change:**

- `packages/vscode-extension/test/unit/manifest.test.ts`
- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/README.md`
- optionally `docs/plans/04/` cross-links from Epic 1 or Epic 3 plans if maintainers keep those updated

**Actions:**

1. Extend manifest tests for any new command contributions and activation events added in Epic 4.
2. Add smoke coverage where feasible for command registration and non-Copilot fallback behavior.
   - Do not over-promise UI automation against Copilot Chat internals if the current harness cannot verify them reliably.
3. Document:
   - supported Copilot delivery modes
   - minimum VS Code version for chat-mode support
   - what happens when Copilot Chat is unavailable
   - what remains deferred to Epic 5, Epic 6, and Epic 7
4. Add a short manual acceptance checklist for real-host validation with Copilot installed.

**User-observable slice:** the feature is documented, discoverable, and guarded against future manifest regressions.

**Validation:**

```bash
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Completion gate:** Epic 4 is closed only when command wiring, capability behavior, and degraded-path documentation are all verified.

## Exit Criteria Checklist

- `copilot-chat` is implemented as a real delivery adapter.
- insert is the default Copilot behavior.
- direct-send is available explicitly.
- chat modes are represented in the request contract and runtime-gated.
- Copilot unavailability and command failure produce intentional fallback behavior.
- the existing editor path still works as an explicit mode and as Epic 4 fallback.
- unit coverage exists for success, unsupported, unavailable, and fallback outcomes.
- manual validation exists for at least one real Copilot-enabled host.

## Suggested Next Epics After Epic 4

1. Epic 7 — implement LM API execution using the same run-service contracts and normalized input flow.
2. Epic 5 — rationalize command contributions, mode selection UX, and defaults now that Copilot delivery is real.
3. Epic 6 — formalize clipboard and broader fallback priority so degraded behavior is consistent across all delivery targets.
