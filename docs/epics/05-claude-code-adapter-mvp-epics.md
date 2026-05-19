# Claude Code Adapter MVP Epics

> Purpose: define implementation epics for delivering Epic 2 from `docs/epics/03-next-functional-epics.md` as a real Claude Code adapter MVP.
> Audience: maintainers who will later break this work into detailed implementation plans.
> Constraint: this document defines epics and scope boundaries only. It does not prescribe step-by-step implementation tasks.

## Context

The repo already contains a `packages/claude-code-plugin/` package with:

- a plugin manifest
- a router skill and direct sub-skills
- stub shell scripts
- package-level README scaffolding

But the Claude Code adapter is not implemented yet:

- all skills are TODO stubs
- all shell scripts are TODO stubs
- the core package exposes a TypeScript API, but there is no public CLI entry point yet
- there is no adapter-specific smoke coverage or verified JSON bridge contract

The architecture and PRD are already clear about the intended adapter shape:

- Claude Code uses `SKILL.md` files as the command-routing layer
- shell scripts are the bridge from skills into Node.js/core behavior
- the adapter owns conversational prompting and user-facing messaging
- the core stays stateless and never prompts the user directly
- the MVP command surface is:
  - `/stencilinit`
  - `/stencilcreate`
  - `/stencillist`
  - `/stencilshow`
  - `/stencilrun`
  - `/stencildelete`

This epic breakdown turns that contract into a Claude Code-specific roadmap without collapsing into detailed implementation planning.

## Planning Principles

- Keep Claude Code UX in the adapter. Do not move conversational prompting into core.
- Reuse the core facade for template logic instead of reimplementing parsing, validation, or storage in shell scripts.
- Treat the shell layer as a thin transport boundary with a typed JSON contract, not as a second business-logic layer.
- Deliver by vertical user flows that end in real Claude Code command behavior, not only package scaffolding.
- Keep the MVP limited to Phase 1 Claude Code behavior:
  - project-local storage
  - basic CRUD subset
  - run with inline args and conversational fill
- Do not absorb Phase 2 management features into the MVP:
  - search
  - edit
  - copy
  - global template support
  - dry-run
  - collection commands
  - config-driven behavior beyond what core already requires

## Epic 1 — Claude Code Plugin Foundation and Command Routing

**Goal:** Turn the current Claude Code package scaffolding into a stable adapter shell with a clear command-routing contract.

**Why now:** Every user-facing flow depends on predictable routing between the main `/stencil` entrypoint, direct command skills, and the script bridge beneath them.

**Scope:**

- finalize the Claude Code plugin manifest and package metadata for the MVP command set
- define the router-skill behavior for subcommand dispatch and help output
- align direct skills and router aliases around one supported command vocabulary
- define adapter-local argument conventions for command name, template name, and inline `key=value` inputs
- establish the boundary between:
  - skill instructions
  - shell wrapper behavior
  - Node/core invocation
- keep the current package structure coherent with the architecture document

**Out of scope:**

- actual template business logic
- interactive placeholder collection details
- destructive-action semantics
- smoke tests beyond what is needed to prove routing contracts

**Exit criteria:**

- the Claude Code package has one clear routing model for `/stencil` and the direct sub-skills
- command names and adapter surface are stable enough for later epics to build on without reworking plugin structure

## Epic 2 — Core CLI and JSON Bridge for Claude Code

**Goal:** Create the adapter-facing command-line bridge that lets Claude Code skills invoke core behavior through thin shell scripts with structured results.

**Why now:** The architecture assumes shell scripts calling a Node.js CLI, but the current repo only exposes the core as a TypeScript library. The Claude Code adapter cannot become real until that bridge exists.

**Scope:**

- define a public CLI entry point or equivalent adapter-facing Node invocation layer for Claude Code
- establish command coverage for the MVP flows the adapter needs:
  - init
  - create
  - list
  - show
  - run/resolve
  - delete
  - validation support where needed by create/show flows
- define the JSON response contract for success, validation issues, unresolved inputs, and typed failures
- define stderr and exit-code behavior for shell/script failures versus domain failures
- implement shell wrappers as thin transport only
- align the bridge contract with structured core errors instead of inventing Claude-specific data formats ad hoc

**Key design boundary:**

- shell scripts may normalize command-line invocation details
- shell scripts should not duplicate template logic that already belongs in core
- Claude Code conversational behavior should consume the JSON contract rather than parsing unstructured text

**Exit criteria:**

- Claude Code has a stable machine-readable bridge into core
- skills can rely on structured results for later conversational flows instead of TODO placeholders or plain-text scraping

## Epic 3 — Project Bootstrap and Template Inspection Flows

**Goal:** Deliver the first usable Claude Code read-oriented flows: initialize Stencil in a project, list templates, and inspect a template.

**Why now:** These flows are the safest first end-to-end slice for proving that the plugin can discover project state, talk to core, and present results conversationally without requiring complex editing or multi-turn runtime input logic.

**Scope:**

- implement `/stencilinit` for project-local `.stencil/` bootstrap
- decide and implement the MVP bootstrap artifact set:
  - directory structure
  - optional sample template
  - initial guidance shown to the user
- implement `/stencillist` for listing available project templates
- implement `/stencilshow <name>` for template inspection
- define Claude-friendly presentation for:
  - empty state
  - template summaries
  - frontmatter/body display
  - validation warnings surfaced during inspection when appropriate
- keep discovery limited to project scope for the MVP

**Out of scope:**

- global templates
- collection management commands
- search and filtering beyond the MVP surface
- template mutation beyond bootstrap

**Exit criteria:**

- a user can initialize Stencil in a repo and browse or inspect templates entirely from Claude Code
- the adapter demonstrates a real read path through the shell bridge and core without manual filesystem inspection

## Epic 4 — Conversational Template Authoring MVP

**Goal:** Implement `/stencilcreate` as a conversational template-authoring flow that produces valid MVP template files through core-backed persistence.

**Why now:** Creation is one of the core value propositions for Claude Code users, and it proves that the adapter can translate a multi-turn conversation into a persisted template artifact without inventing adapter-only template semantics.

**Scope:**

- implement `/stencilcreate <name>` as a conversational flow for collecting:
  - description
  - optional tags if supported in the MVP interaction
  - placeholder metadata needed by the MVP contract
  - template body
- define the Claude-side authoring UX for body entry and revision before save
- validate candidate templates through core-backed rules before persistence
- surface validation failures and correctable issues conversationally
- save template files into the project-local `.stencil/` structure via core
- define behavior for collisions, invalid names, and cancelled creation

**Decision pressure from current product docs:**

- the PRD Phase 1 flow assumes conversational template creation
- the architecture keeps template validation and persistence in core, not in skill logic
- MVP authoring should stay compatible with the supported template language rather than adding Claude-only shortcuts

**Exit criteria:**

- a user can create a valid template from Claude Code without editing files manually
- saved templates are normal Stencil files that can be listed, shown, and later run through the same adapter

## Epic 5 — Run Template Execution and Conversational Input Completion

**Goal:** Make `/stencilrun` the primary happy-path workflow by resolving templates, collecting missing inputs conversationally, and handing the resolved prompt back into Claude Code execution.

**Why now:** This is the core user-facing outcome of the adapter MVP and the main behavior that differentiates Stencil from static prompt files.

**Scope:**

- implement `/stencilrun <name> [key=value ...]`
- support inline explicit values passed in the initial command
- resolve project/context/default values through core-backed resolution
- surface unresolved required values as conversational follow-up questions owned by the adapter
- define the re-entry pattern between Claude prompts and repeated resolve calls until the template is fully resolved or cancelled
- define the user-visible handoff from “resolved template text” to “Claude executes the prompt”
- surface placeholder provenance clearly enough for the user to understand explicit, default, and context-filled values
- keep the MVP aligned with supported core placeholder semantics, including inline `{{input:...}}` contracts where already supported

**Compatibility and scope boundary:**

- this epic should cover the basic conversational completion loop
- it should not absorb later-phase features such as:
  - dry-run mode
  - explicit override/edit-after-summary workflows
  - collection-aware run UX
  - broader config-driven run behavior

**Exit criteria:**

- a user can run a template from Claude Code with a mix of inline args, defaults, context values, and conversationally collected inputs
- the happy path matches the intended MVP “resolve then execute in conversation” behavior

## Epic 6 — Safe Deletion and Destructive Command Semantics

**Goal:** Implement `/stencildelete` as a safe, explicit destructive flow that behaves predictably inside a conversational tool.

**Why now:** Delete is part of the MVP command surface, but destructive behavior in Claude Code needs a clearer UX contract than read-only commands.

**Scope:**

- implement `/stencildelete <name>`
- define confirmation behavior before deletion
- define user-visible outcomes for:
  - successful deletion
  - missing template
  - cancellation
  - permission or filesystem failures
- keep deletion logic delegated to core-backed storage operations where possible
- make sure the command semantics are precise for project-local templates

**Out of scope:**

- bulk deletion
- global/project precedence rules
- edit/rename/copy workflows

**Exit criteria:**

- users can safely remove templates from Claude Code without ambiguous outcomes
- destructive behavior is explicit and adapter-owned rather than implicit shell behavior

## Epic 7 — Claude Code Error Presentation, Smoke Coverage, and MVP Hardening

**Goal:** Make the Claude Code adapter reliable enough to ship by hardening its user messaging, script behavior, and smoke-level verification.

**Why now:** The MVP crosses skills, shell scripts, Node execution, filesystem operations, and conversational follow-up. Without adapter-specific hardening, regressions will be hard to isolate and the user experience will feel brittle.

**Scope:**

- define consistent Claude-facing presentation for:
  - typed core errors
  - validation failures
  - empty-state results
  - user cancellations
  - shell/CLI execution failures
- add smoke coverage for:
  - skill routing
  - script invocation
  - JSON output shape
  - at least the core happy-path command flows feasible in the package’s test harness
- document adapter-specific assumptions and local testing expectations
- verify that the MVP respects offline-first and permission-related PRD constraints

**Out of scope:**

- Phase 2 feature expansion
- generalized end-to-end automation for every future adapter
- non-MVP template language features

**Exit criteria:**

- Claude Code MVP flows are covered by adapter-specific smoke verification
- failure and cancellation paths are clear enough that users do not have to infer what happened from raw script output

## Recommended Delivery Order

```text
Epic 1 — Claude Code Plugin Foundation and Command Routing
  -> Epic 2 — Core CLI and JSON Bridge for Claude Code
  -> Epic 3 — Project Bootstrap and Template Inspection Flows
  -> Epic 4 — Conversational Template Authoring MVP
  -> Epic 5 — Run Template Execution and Conversational Input Completion
  -> Epic 6 — Safe Deletion and Destructive Command Semantics
  -> Epic 7 — Claude Code Error Presentation, Smoke Coverage, and MVP Hardening
```

## Resolved Cross-Epic Decisions

- The Claude Code adapter should use the existing skill-plus-shell architecture described in `docs/stencil-architecture.md`.
- The adapter should depend on structured core behavior through a JSON bridge, not on plain-text parsing.
- Conversational prompting for unresolved values belongs in the Claude Code adapter, not in core.
- The MVP remains limited to project-local storage and the Phase 1 command surface.
- Search, edit, copy, collections, global templates, dry-run, and richer confirmation/override workflows belong to later epics, not this MVP breakdown.

## Notes for Later Plan Breakdown

- Break future plans into thin vertical slices that end in real Claude Code command flows.
- Keep the first implementation wave focused on a coherent happy path:
  - init
  - create
  - show
  - run
- Treat the CLI/JSON bridge as contract work that may require coordinated core and adapter changes.
- Do not hide adapter gaps inside shell-script business logic. If a behavior belongs in core or in the Claude conversational layer, keep it there explicitly.
