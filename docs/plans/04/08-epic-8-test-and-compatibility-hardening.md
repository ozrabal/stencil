# Plan: Epic 8 — Test and Compatibility Hardening

**Goal:** Cover the expanded VS Code run-template surface with a deliberate verification strategy that locks down orchestration, capability-sensitive behavior, and the feasible end-to-end run flows in the repo’s current test harness.

**Primary source documents:**

- `docs/epics/04-vscode-run-template-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Current code baseline:**

- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/runConfiguration.ts`
- `packages/vscode-extension/src/services/runPreferenceStore.ts`
- `packages/vscode-extension/src/services/runProfilePicker.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/src/services/delivery/editorDelivery.ts`
- `packages/vscode-extension/src/services/delivery/clipboardDelivery.ts`
- `packages/vscode-extension/src/services/delivery/copilotChatDelivery.ts`
- `packages/vscode-extension/src/services/delivery/lmApiDelivery.ts`
- `packages/vscode-extension/src/services/lmResponsePanel.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/services/runConfiguration.test.ts`
- `packages/vscode-extension/test/unit/services/runProfilePicker.test.ts`
- `packages/vscode-extension/test/unit/services/copilotChatDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/clipboardDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/lmApiDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/lmResponsePanel.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/extension.test.ts`
- `packages/vscode-extension/test/unit/manifest.test.ts`
- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/test/runTest.mjs`

## Scope Lock

This plan covers Epic 8 only.

In scope:

- add unit coverage for orchestration, mode selection, fallback behavior, message generation, and capability probing
- harden compatibility-sensitive logic for unsupported, partially supported, and fully supported runtime combinations
- extend the current smoke harness to cover the real-host run flows that are feasible without relying on external Copilot or LM availability
- define and enforce a clear boundary between mocked verification, smoke verification, and manual compatibility verification
- keep tests aligned with the existing extension conventions instead of introducing a second testing style

Out of scope for this epic:

- new run-template feature work from Epics 1-7
- replacing the current VS Code smoke harness with a full multi-version automation rig
- end-to-end automation that depends on real Copilot Chat or real Language Model API availability
- broader CI platform redesign outside the extension test/build commands already used by the repo

## Planning Notes Applied

- The breakdown is organized as vertical hardening slices that end in a runnable and observable extension flow, not only abstract test scaffolding.
- The first verification wave is centered on the multi-target run surface that now exists: Copilot Chat, LM API execution, clipboard, and editor fallback.
- Epic 3 remains a contract decision already expressed in core and extension behavior. This plan verifies inline-input handling through the normalized resolution flow; it does not reintroduce adapter-only parsing shortcuts.

## Repo Facts That Matter

- The extension is already on VS Code engine `^1.100.0`, matching the Epic 4 compatibility direction.
- Delivery targets are already implemented in code and registered in commands:
  - `editor`
  - `clipboard`
  - `copilot-chat`
  - `lm-api`
- `runTemplateService.ts` already owns:
  - target capability checks
  - placeholder-input prompting
  - delivery dispatch
  - fallback sequencing
  - outcome and user-message mapping
- Compatibility behavior is already encoded in runtime probes:
  - Copilot Chat depends on `workbench.action.chat.open`
  - richer Copilot chat modes depend on runtime version checks
  - LM API depends on `vscode.lm.selectChatModels()`
  - clipboard depends on `vscode.env.clipboard.writeText`
- The unit test surface is already substantial, especially for `runTemplateService`, but the smoke harness is still minimal:
  - it activates the extension
  - verifies command contribution
  - verifies language association for `.stencil/**/*.md`
  - it does not yet exercise any run command end to end in a real Extension Development Host
- The current smoke runner launches VS Code with `--disable-extensions`, which is good for extension isolation but means real Copilot Chat and real Copilot-backed LM capability should not be assumed in smoke tests.
- The architecture document explicitly keeps the core adapter-agnostic and pushes user prompting, capability checks, and UX-specific error handling into the VS Code adapter. Epic 8 therefore belongs almost entirely in the extension package and its tests.
- The architecture document also calls for:
  - Vitest-based testing
  - VS Code extension tests
  - adapter-owned error presentation
- The PRD and epic doc both require:
  - clear, actionable failure messages
  - cross-platform compatibility awareness
  - graceful degraded behavior

## Desired Outcome

At the end of Epic 8:

- the multi-target run flow is protected by explicit unit tests at the service, command, capability, and configuration seams
- editor and clipboard runs are exercised in a real VS Code test host instead of only through mocks
- Copilot Chat and LM API supported and degraded paths are covered with deterministic compatibility tests
- unsupported capability combinations produce stable typed outcomes and user-facing messages
- the team has a documented test boundary for what must be mocked, what must run in smoke, and what still requires manual host verification
- future changes to Epics 4-7 can fail fast in tests instead of regressing silently

## Test Strategy Contract

Epic 8 should make the verification boundary explicit instead of pretending everything can be fully end-to-end tested.

### Unit Tests Must Own

- run-service orchestration outcomes
- fallback ordering and fallback messaging
- command registration and command-to-profile wiring
- configuration normalization and last-used preference behavior
- capability probing and version-sensitive branching
- Copilot delivery adapter request shape
- LM delivery adapter request, cancellation, and panel lifecycle

### Smoke Tests Must Own

- extension activation in a real Extension Development Host
- command contribution and command invocation wiring
- workspace fixture discovery
- a real run to editor
- a real run to clipboard, if clipboard APIs are available in the host
- stable no-input or deterministic-input flows that do not depend on external providers

### Manual Compatibility Checks Must Own

- actual Copilot Chat insert behavior
- actual Copilot Chat send behavior
- actual Copilot chat-mode behavior where the host exposes it
- actual LM API execution against a real selectable model
- UX quality of streamed output, chat handoff timing, and external-provider failure presentation

## Validation Baseline

Run before editing:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
pnpm --filter stencil-vscode test:smoke
pnpm --filter stencil-vscode build
```

Default validation after each implementation step:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
```

Additional smoke validation after steps that touch the real host harness:

```bash
pnpm --filter stencil-vscode test:smoke
```

Full validation before closing the epic:

```bash
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

## Compatibility Matrix To Encode

These combinations should be represented directly in tests, mostly unit tests.

### Delivery Capability Matrix

- `editor` available
- `editor` unavailable
- `clipboard` available
- `clipboard` unavailable
- `copilot-chat` command present on a `1.100+` runtime
- `copilot-chat` command missing
- `copilot-chat` on a pre-chat-mode runtime where only `ask` is supported
- `lm-api` with no `vscode.lm.selectChatModels`
- `lm-api` with model selector present but returning no compatible models
- `lm-api` with a compatible model available

### Run Outcome Matrix

- completed in requested target
- completed with fallback to clipboard
- completed with fallback to editor
- target unavailable with no fallback
- mode unavailable
- chat-mode unavailable
- delivery failed after all fallbacks are exhausted
- cancelled during placeholder input
- cancelled during LM execution
- unresolved after prompt collection

### Command And Settings Matrix

- default run with `selectionBehavior=defaults`
- default run with `selectionBehavior=picker`
- default run with `selectionBehavior=last-used`
- explicit command variants for editor, clipboard, Copilot Chat, Copilot send, LM API, and Copilot mode picker
- invalid target/mode/chat-mode configuration normalized to safe values with warnings

## Manual Validation Matrix

Use at least these templates during manual checks.

### A. Editor explicit target

```markdown
---
name: hardening-editor
description: Explicit editor delivery
version: 1
---

Summarize the current file: {{$ctx.active_file_name}}
```

### B. Clipboard explicit target

```markdown
---
name: hardening-clipboard
description: Explicit clipboard delivery
version: 1
---

Create a review prompt for {{$ctx.active_file_name}}.
```

### C. Copilot degraded fallback

```markdown
---
name: hardening-copilot-fallback
description: Copilot fallback flow
version: 1
---

Review this selection for {{input:focus_area:performance}} issues.
{{$ctx.active_selection}}
```

### D. LM execution flow

```markdown
---
name: hardening-lm
description: LM execution flow
version: 1
---

Produce a checklist for the current module and identify the top three risks.
```

For each manual slice:

1. Launch an Extension Development Host on a workspace with `.stencil/` templates.
2. Open a real code file.
3. Create a text selection when validating inline-input and selection-aware context.
4. Run the relevant command from the command palette and once from the tree view when applicable.
5. Verify the final surface and the final user message.

## Implementation Sequence

### Step 1 — Freeze The Hardening Target And Add Shared Run Fixtures

**Objective:** Establish one stable verification target for the expanded run flow so later tests do not drift across different fixture setups.

**Why this step first:**

- Epic 8 spans command wiring, runtime capability probing, and multiple delivery surfaces.
- The repo already has isolated unit tests, but smoke coverage has no reusable run-template workspace yet.
- A shared fixture set reduces duplicate template setup across service tests, command tests, and smoke tests.

**Implementation work:**

- add a dedicated smoke fixture workspace such as `packages/vscode-extension/test/fixtures/workspace-run-template/`
- include fixture templates for:
  - editor explicit mode
  - clipboard explicit mode
  - inline-input plus `$ctx.active_selection`
  - a fallback-oriented no-input template
- add any shared helper utilities needed by smoke tests to locate template URIs, open documents, and cleanly inspect the active editor
- keep fixture bodies intentionally small and deterministic so failures point to wiring regressions rather than content churn
- update the smoke runner entrypoint if a second workspace or additional launch arg handling is required

**Files likely touched:**

- `packages/vscode-extension/test/fixtures/workspace-run-template/**`
- `packages/vscode-extension/test/runTest.mjs`
- `packages/vscode-extension/test/smoke/extension.test.mjs`

**User-observable flow at the end of this step:**

- the Extension Development Host still activates cleanly
- the smoke workspace loads real `.stencil` templates intended for later run-command verification

**Validation after this step:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
pnpm --filter stencil-vscode test:smoke
```

**Step completion criteria:**

- there is a dedicated run-flow smoke workspace in the repo
- smoke tests still pass on the current activation and language-association checks
- later steps can reuse the same templates instead of inventing test data ad hoc

### Step 2 — Lock Service-Level Multi-Target Outcomes And Fallback Semantics

**Objective:** Make `runTemplateService.ts` the strongest regression net for the multi-target flow before expanding real-host coverage.

**Why this step next:**

- the service already centralizes the behavior Epic 8 cares about most
- Copilot, LM, clipboard, and editor branches all converge there
- if service contracts are not frozen first, smoke tests will only catch a subset of regressions

**Implementation work:**

- review `runTemplateService.test.ts` against the full outcome matrix and fill remaining gaps
- ensure tests cover:
  - explicit editor success
  - explicit clipboard success
  - explicit Copilot insert success
  - explicit Copilot send success
  - explicit LM success
  - Copilot unavailable -> clipboard fallback
  - Copilot chat-mode unavailable -> clipboard fallback
  - Copilot delivery failure -> clipboard fallback
  - clipboard failure -> editor fallback
  - LM unavailable -> clipboard fallback
  - LM delivery failure -> clipboard fallback
  - final fallback exhaustion -> `delivery-failed`
  - placeholder-input cancellation with no fallback attempt
  - LM cancellation with no fallback attempt
  - unresolved-after-prompt behavior
- harden message expectations from `showRunTemplateOutcomeMessage()` so outcome wording remains explicit and stable
- prefer extending the existing single service test file unless it becomes materially unreadable; if split, do it by behavior boundary rather than creating a brand-new convention

**Files likely touched:**

- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`

**User-observable flow at the end of this step:**

- every supported run outcome now has a deterministic, verified user-facing message and fallback result

**Validation after this step:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- runTemplateService
pnpm --filter stencil-vscode test:unit
```

**Step completion criteria:**

- `runTemplateService.test.ts` explicitly covers each supported outcome kind and fallback path
- cancellation tests prove no fallback leakage occurs on user cancellation
- service message assertions are strong enough to catch degraded UX regressions

### Step 3 — Harden Capability, Configuration, Preference, And Command Compatibility Branches

**Objective:** Prove that the extension picks the right run profile and availability behavior across the runtime combinations Epic 4-7 introduced.

**Why this step now:**

- the service can only behave correctly if upstream option resolution and capability probing are truthful
- compatibility regressions will often appear here before they show up in delivery adapters

**Implementation work:**

- extend `capabilities.test.ts` to fully encode the delivery capability matrix
- extend `runConfiguration.test.ts` to verify:
  - target normalization
  - mode normalization per target
  - chat-mode normalization based on runtime capability
  - warnings for invalid or unsupported settings
- extend `runPreferenceStore.test.ts` and `runProfilePicker.test.ts` where needed so last-used and picker behavior stay consistent with the configured surface
- extend `runTemplate.test.ts` to prove each contributed run command maps to the correct execution profile and persistence behavior
- extend `extension.test.ts` and `manifest.test.ts` when commands or configuration expectations need stronger synchronization checks
- keep compatibility simulation at the VS Code API seam with mocks rather than trying to fabricate versioned real hosts

**Files likely touched:**

- `packages/vscode-extension/test/unit/services/capabilities.test.ts`
- `packages/vscode-extension/test/unit/services/runConfiguration.test.ts`
- `packages/vscode-extension/test/unit/services/runPreferenceStore.test.ts`
- `packages/vscode-extension/test/unit/services/runProfilePicker.test.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/extension.test.ts`
- `packages/vscode-extension/test/unit/manifest.test.ts`

**User-observable flow at the end of this step:**

- the command palette, tree-item commands, default-run behavior, and saved preferences all resolve to the same supported profiles the user would actually see in the product

**Validation after this step:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- capabilities
pnpm --filter stencil-vscode test:unit -- runConfiguration
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode test:unit
```

**Step completion criteria:**

- capability tests encode every supported and degraded runtime branch
- command tests prove explicit command variants invoke the correct target and mode
- manifest and extension tests still match the contributed command/config surface

### Step 4 — Extend Smoke Coverage To Real Editor And Clipboard Run Flows

**Objective:** Move beyond activation-only smoke testing and verify that at least the stable local run flows work end to end in a real Extension Development Host.

**Why this step matters:**

- unit tests can prove logic, but they cannot prove that command registration, workspace discovery, document opening, and clipboard/editor delivery actually work together in the packaged extension
- editor and clipboard are the two run surfaces that are realistic to verify under `--disable-extensions`

**Implementation work:**

- extend `test/smoke/extension.test.mjs` to:
  - activate the extension
  - invoke `stencil.runTemplateInEditor` against a known template name
  - assert that a new document or active editor contains the resolved prompt
  - invoke `stencil.runTemplateToClipboard` against a known template name
  - assert clipboard contents when the host clipboard service is available
- if direct clipboard assertions are flaky in the host, keep the smoke flow bounded to command execution plus a best-effort clipboard read, and move the exact clipboard-content assertion back to unit tests
- avoid trying to run real Copilot Chat or real LM requests in smoke tests; document that boundary directly in test comments
- keep smoke tests deterministic by using no-input templates or command arguments that bypass interactive prompt UI

**Files likely touched:**

- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/test/runTest.mjs`
- `packages/vscode-extension/test/fixtures/workspace-run-template/**`

**User-observable flow at the end of this step:**

- a real test host can run a Stencil template into a new editor
- a real test host can invoke clipboard delivery without crashing the extension

**Validation after this step:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:smoke
pnpm --filter stencil-vscode test
```

**Step completion criteria:**

- smoke tests now execute at least one real run command
- the smoke harness covers editor delivery end to end
- clipboard delivery is exercised as far as the host runtime allows without introducing flaky external dependencies

### Step 5 — Harden Delivery Adapter And LM Panel Edge Cases

**Objective:** Close the remaining gaps at the adapter layer so provider-specific regressions are caught before they bubble up into broader service failures.

**Why this step is separate:**

- the service tests prove orchestration, but adapter tests still need to own request shape, VS Code API usage, and typed provider-specific failures
- LM execution has a second surface in the response panel that needs direct edge-case coverage

**Implementation work:**

- review and extend:
  - `copilotChatDelivery.test.ts`
  - `clipboardDelivery.test.ts`
  - `lmApiDelivery.test.ts`
  - `lmResponsePanel.test.ts`
- add or tighten assertions for:
  - exact Copilot command arguments for insert vs send
  - chat-mode propagation where supported
  - clipboard error wrapping and user-message fidelity
  - LM model selection override behavior
  - LM stream chunk accumulation
  - LM request cancellation
  - LM panel singleton reuse and reset behavior across sequential runs
  - typed error handling from the LM API layer
- keep adapter tests small and API-focused; do not duplicate service fallback scenarios here

**Files likely touched:**

- `packages/vscode-extension/test/unit/services/copilotChatDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/clipboardDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/lmApiDelivery.test.ts`
- `packages/vscode-extension/test/unit/services/lmResponsePanel.test.ts`

**User-observable flow at the end of this step:**

- target-specific delivery behaviors remain correct even when orchestration stays unchanged
- streamed LM output and cancellation remain stable across implementation refactors

**Validation after this step:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- copilotChatDelivery
pnpm --filter stencil-vscode test:unit -- lmApiDelivery
pnpm --filter stencil-vscode test:unit -- lmResponsePanel
pnpm --filter stencil-vscode test:unit
```

**Step completion criteria:**

- each delivery adapter has focused tests for its request contract and failure shape
- LM panel tests cover both happy path and state-reset edge cases
- no adapter-specific test is relying on a higher-level fallback behavior that belongs to the service

### Step 6 — Final Compatibility Pass, Documentation Of Test Boundaries, And Regression Gate

**Objective:** Close the epic by ensuring the hardening work is runnable by maintainers and clear about what still requires manual host validation.

**Why this step last:**

- once the actual coverage is in place, the team can accurately document the test boundary instead of guessing it up front
- Epic 8 should leave behind a repeatable regression gate, not just more tests

**Implementation work:**

- review test comments, fixture names, and helper naming so the compatibility intent is obvious
- document, in a short maintainer-facing note near the smoke tests or extension test docs, which paths are:
  - unit-only
  - smoke-covered
  - manual-only
- confirm `pnpm --filter stencil-vscode test` remains the one-command regression gate for the extension package
- if current tests expose brittle assumptions, normalize them now rather than leaving hidden flake for later epics
- run the full validation set and capture any follow-up work as clearly bounded backlog items instead of stretching Epic 8 into more feature changes

**Files likely touched:**

- `packages/vscode-extension/test/**`
- optionally a short maintainer note in `packages/vscode-extension/README.md` or adjacent test documentation if that package already documents local testing

**User-observable flow at the end of this step:**

- maintainers can run one predictable extension regression suite before shipping changes to the run-template feature

**Validation after this step:**

```bash
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Step completion criteria:**

- the extension regression gate is documented and green
- the mocked-versus-smoke-versus-manual boundary is explicit
- Epic 8 ends with a maintainable hardening story instead of an ad hoc pile of tests

## Exit Checklist

- shared run-template smoke fixtures exist and are used by tests
- `runTemplateService` outcome coverage matches the supported multi-target matrix
- capability, configuration, command, and preference tests cover degraded and supported branches
- smoke tests execute at least one real run flow into editor and one local delivery flow into clipboard or its nearest stable host-supported equivalent
- adapter tests cover Copilot, clipboard, and LM request/response edge cases
- `pnpm --filter stencil-vscode test` is green
- manual-only compatibility checks for real Copilot Chat and real LM execution are documented, not implied
