# VS Code Run Template Epics

> Purpose: define implementation epics for bringing the PromptVault-style "run template" experience into the Stencil VS Code extension.
> Audience: maintainers who will later break these epics into detailed implementation plans.
> Constraint: this document defines epics and scope boundaries only. It does not prescribe step-by-step implementation tasks.

## Context

The current VS Code extension already supports a basic `stencil.runTemplate` flow:

- resolve a target template from command args, active file, or quick pick
- resolve declared placeholders through core context providers
- prompt for unresolved declared placeholders
- open the resolved prompt in a new editor

The spec in [docs/promptvault-run-template.md](/Users/piotrlepkowski/Private/stencil/docs/promptvault-run-template.md) describes a substantially broader feature:

- delivery into Copilot Chat instead of editor-only output
- multiple run modes and chat modes
- richer IDE-derived context values
- support for inline `{{input:...}}` variables in prompt bodies
- clipboard fallback targets
- optional Language Model API execution with streamed output

That spec also assumes a PromptVault-specific architecture and a placeholder format that does not fully match current Stencil contracts. In particular:

- the current extension is named `Stencil`, not `PromptVault`
- current core resolution is based on declared frontmatter placeholders plus `$ctx.*` context variables
- the current extension engine target is VS Code `^1.96.0`, while some proposed chat features require newer versions
- the existing run flow is command-centric and tree-view based, not service/adapters based

The epics below translate the spec into a Stencil-compatible roadmap and isolate the places where core and extension contracts may need to evolve.

## Planning Principles

- Extend the existing `stencil.runTemplate` flow instead of replacing it wholesale.
- Keep template parsing and resolution rules coherent with `@stencil-pm/core`.
- Treat Copilot Chat handoff as the primary user-facing outcome, while retaining editor output as a supported explicit alternative and fallback.
- Keep editor output as a supported explicit run mode even after Copilot Chat and clipboard delivery ship.
- Raise the minimum VS Code engine as needed to rely on newer Copilot Chat capabilities directly, while still handling missing runtime capabilities cleanly.
- Include LM API panel execution in the first implementation wave, but keep it isolated from the default Copilot Chat path.
- Accept template language evolution where needed; do not constrain the extension to frontmatter-only inputs if inline `{{input:...}}` support is the chosen product contract.

## Epic 1 — Run Template Service Refactor

**Goal:** Restructure the current run command into an explicit orchestration layer that can support multiple output targets without duplicating selection, resolution, and cancellation logic.

**Why now:** The current command implementation is sufficient for editor output, but the new feature set needs a stable orchestration seam before new targets and UI variants are added.

**Scope:**

- extract the current `runTemplate` command flow into a dedicated extension service
- preserve existing target resolution behavior from command args, active template, and quick pick
- preserve current placeholder prompting behavior and cancellation semantics
- define extension-level run options for output target and mode selection
- centralize success, cancellation, and recoverable-error handling for run execution

**Out of scope:**

- new placeholder language features
- LM API streaming panel
- tree view or editor UI polish beyond what is required for wiring new commands

**Exit criteria:**

- the extension has one run orchestration path that can dispatch to multiple delivery targets
- existing run behavior remains intact when using the editor-output fallback path

## Epic 2 — Context Resolution Expansion for VS Code

**Goal:** Expand the VS Code adapter’s context resolution so templates can use richer live IDE state during run execution.

**Why now:** The spec’s value proposition depends on context-aware prompts, and the current adapter only exposes a narrow set of VS Code variables.

**Scope:**

- review the spec’s proposed variables and map them to Stencil-compatible context keys
- expand the VS Code context provider with editor, workspace, diagnostics, and selected-text data where stable
- decide which proposed values belong in the extension adapter versus shared core providers
- define fallback behavior for missing editor, workspace, or git state
- keep context naming and precedence aligned with current `$ctx.*` resolution rules

**Key design boundary:**

- if new context values can be represented as `$ctx.*` keys, they should remain adapter-owned
- if the feature requires a new placeholder syntax or new core resolution semantics, that must be called out separately and not smuggled into adapter work

**Exit criteria:**

- the extension can resolve a materially richer set of VS Code context values without breaking current core contracts
- missing context never blocks execution unless the template already requires a value through existing core rules

## Epic 3 — Input Variable Strategy and Template Syntax Alignment

**Goal:** Adopt inline `{{input:...}}` variables as a supported template contract and align Stencil’s parsing and resolution model around that decision without creating ambiguous input semantics.

**Why now:** This is a foundational product decision, not an optional extension affordance. The rest of the run flow depends on having a clear contract for how user-supplied inputs are declared and resolved.

**Scope:**

- define inline `{{input:...}}` syntax as a first-class supported template feature for run-template scenarios
- decide how inline inputs coexist with or supersede current frontmatter-declared placeholders
- implement the chosen parsing/resolution contract in a way that keeps core and extension behavior aligned
- define expected behavior for defaults, duplicate variable names, validation, and unresolved values
- align user-input UX with existing required/optional placeholder semantics where possible

**Decision pressure from current codebase:**

- current placeholder prompting depends on frontmatter metadata such as description and required state
- inline `{{input:Name:default}}` syntax becomes part of the supported template language, so core validation and resolution contracts may need to evolve with it

**Exit criteria:**

- the project has a clear, documented contract for user-supplied run-time variables that includes inline `{{input:...}}` syntax
- the implementation path keeps core and extension semantics aligned rather than treating inline inputs as an extension-only fork

## Epic 4 — Copilot Chat Delivery Modes

**Goal:** Deliver resolved templates into GitHub Copilot Chat as the primary run experience, with support for insert and send behaviors plus supported chat modes.

**Why now:** This is the core user-facing shift described by the spec and the main reason to evolve beyond opening a new editor document.

**Scope:**

- introduce a Copilot Chat delivery adapter around `workbench.action.chat.open`
- support default insert behavior and explicit direct-send behavior
- support chat mode selection where the host VS Code version exposes compatible behavior
- add availability and capability checks for Copilot Chat integration
- define fallback behavior when Copilot Chat is unavailable or command execution fails

**Compatibility considerations:**

- the extension should move beyond `^1.96.0` so newer Copilot Chat capabilities can be used directly
- runtime capability checks should still handle partial feature availability or missing Copilot support gracefully

**Exit criteria:**

- a user can run a template into Copilot Chat without leaving the extension workflow
- insert-versus-send behavior is explicit and resilient to unavailable capabilities

## Epic 5 — Run Mode Selection, Commands, and Configuration

**Goal:** Expose run modes through a coherent VS Code command and configuration surface.

**Why now:** Multiple delivery targets and chat behaviors require a user-facing selection model that is discoverable in the command palette and tree view.

**Scope:**

- define the command surface for default run, run-with-mode, and explicit target variants
- extend tree item actions and command contributions to expose run entry points clearly
- add configuration for default run mode, default chat mode, and optional mode-selection behavior
- decide whether to remember last-used mode globally, per session, or via persisted workspace/user settings
- preserve a low-friction default path for the common case

**Out of scope:**

- streaming response panel UX
- advanced authoring affordances such as code lenses or inline diagnostics

**Exit criteria:**

- users can invoke the new run behavior from the sidebar and command palette with predictable defaults
- configuration and command contributions match the supported implementation surface, not the aspirational full spec

## Epic 6 — Fallback Delivery and Failure Recovery

**Goal:** Ensure run template remains useful when direct chat integration is unavailable by providing clipboard and editor-based fallback paths while keeping editor output as a supported explicit mode.

**Why now:** The spec assumes graceful degradation, and the current extension already has an editor-output path that can be retained as a reliable backup.

**Scope:**

- formalize fallback priority between Copilot Chat, clipboard, and editor output
- add clipboard delivery with clear user messaging
- keep editor output as a first-class explicit mode, not only an internal fallback
- define recoverable error behavior for missing Copilot commands, unsupported VS Code versions, and cancelled input
- keep failures non-destructive and transparent

**Exit criteria:**

- users can still complete a run flow when preferred integrations are unavailable
- fallback behavior is intentional rather than accidental leakage from the old implementation

## Epic 7 — Language Model API Panel Execution

**Goal:** Add an optional Stencil-owned execution mode that runs prompts through the VS Code Language Model API and displays streamed responses inside the extension.

**Why now:** LM API execution belongs in the first implementation wave. It is broader than chat insertion, but it is part of the intended run-mode surface and should be designed alongside the other delivery targets rather than bolted on after MVP.

**Scope:**

- design an LM API adapter that is isolated from chat insertion modes
- define panel lifecycle and singleton behavior for streamed responses
- determine how prompt preview, response rendering, copy actions, and cancellation should work
- add model selection and capability checks consistent with current VS Code APIs
- define the extension’s behavior when no compatible model is available

**Out of scope:**

- MCP server/provider support
- generalized conversational history management

**Exit criteria:**

- the extension can execute a resolved template through the LM API and present the streamed response in a dedicated extension-owned surface
- LM API mode is optional and does not complicate the default run path

## Epic 8 — Test and Compatibility Hardening

**Goal:** Cover the expanded run-template feature set with unit, smoke, and compatibility-oriented verification.

**Why now:** The feature crosses command wiring, UI prompting, API capability checks, and multiple delivery paths. Without targeted tests, regressions will be difficult to isolate.

**Scope:**

- add unit coverage for orchestration, mode selection, fallback behavior, and context expansion
- extend existing command and service tests instead of creating parallel test conventions
- add smoke or integration coverage for core user paths that are feasible in the repo’s current VS Code test harness
- verify behavior across unsupported or partially supported VS Code/Copilot capability combinations
- define what is mocked versus what requires end-to-end verification

**Exit criteria:**

- the run-template feature is covered at the service and command level
- capability-sensitive behaviors have explicit tests for both supported and degraded paths

## Recommended Delivery Order

```text
Epic 1 — Run Template Service Refactor
  -> Epic 2 — Context Resolution Expansion for VS Code
  -> Epic 3 — Input Variable Strategy and Template Syntax Alignment
  -> Epic 4 — Copilot Chat Delivery Modes
  -> Epic 7 — Language Model API Panel Execution
  -> Epic 5 — Run Mode Selection, Commands, and Configuration
  -> Epic 6 — Fallback Delivery and Failure Recovery
  -> Epic 8 — Test and Compatibility Hardening
```

## Resolved Cross-Epic Decisions

- The extension should adopt inline `{{input:...}}` syntax as part of the supported run-template contract.
- Template language changes are acceptable where needed to keep the product contract coherent across core and extension behavior.
- The extension’s minimum VS Code engine should move beyond `^1.96.0` to support newer Copilot Chat features directly.
- Editor output remains a supported explicit run mode after Copilot and clipboard delivery ship.
- LM API panel execution belongs in the first implementation wave.

## Notes for Later Plan Breakdown

- Break future plans into vertical slices that end in a user-observable run flow, not only scaffolding.
- Keep the first implementation wave focused on a coherent multi-target run flow that includes Copilot Chat, LM API execution, and explicit fallback modes.
- Treat Epic 3 as contract work that may require coordinated core and extension changes; do not hide inline input support behind adapter-only preprocessing.
