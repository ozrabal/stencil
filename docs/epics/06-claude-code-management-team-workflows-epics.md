# Claude Code Management and Team Workflows Epics

> Purpose: define implementation epics for delivering Epic 3 from `docs/epics/03-next-functional-epics.md` as the Phase 2 Claude Code management surface.
> Audience: maintainers who will later break this work into detailed implementation plans.
> Constraint: this document defines epics, boundaries, and delivery order only. It does not prescribe step-by-step implementation tasks.

## Context

The repo already has a materially implemented baseline for Claude Code and core:

- `packages/claude-code-plugin/` defines the MVP command surface, routing contract, shell bridge, README contract, and smoke-level routing coverage
- the public Claude Code package currently exposes:
  - `/stencil`
  - `/stencilinit`
  - `/stencilcreate`
  - `/stencillist`
  - `/stencilshow`
  - `/stencilrun`
  - `/stencildelete`
- the current Claude Code README explicitly keeps public flows project-scoped for the MVP
- `@stencil-pm/core` now already exposes most of the underlying data operations that Phase 2 needs:
  - `search()`
  - `update()`
  - `copy()`
  - `rename()`
  - collection management
  - runtime config loading
  - global directory discovery and project-over-global precedence

That means Epic 3 is not primarily about inventing new core primitives. It is about extending the Claude Code adapter from a basic CRUD-and-run MVP into the management layer needed for daily team usage:

- richer discovery and organization
- safe template mutation flows
- explicit project/global scope behavior
- run-time review, override, and preview flows
- configuration-aware presentation and command semantics

This document assumes the Epic 2 MVP foundation remains the baseline:

- skills own user-facing language, confirmations, and follow-up questions
- shell scripts remain a thin transport layer
- the core and its adapter-facing CLI/JSON bridge remain the source of truth for template semantics, validation, scope resolution, and structured failures

## Planning Principles

- Keep management UX in the Claude Code adapter. Do not push conversational editing or confirmation logic into core.
- Prefer explicit scope and mutation semantics over “smart” but ambiguous behavior.
- Reuse existing core capabilities through the bridge instead of recreating project/global or collection logic in shell scripts.
- Treat Phase 2 as an extension of the MVP command contract, not a second adapter architecture.
- Preserve safe defaults for destructive or confusing actions:
  - project-over-global precedence must be visible
  - mutation of global-only templates must never appear implicit
  - final execution must remain explicitly confirmed
- Keep advanced template language work out of this document:
  - typed placeholders
  - conditionals
  - includes
  - multi-step execution
- Keep remote template sources and publish/install workflows out of this document.

## Epic 1 — Phase 2 Command Surface and Bridge Expansion

**Goal:** Extend the Claude Code command and bridge contract from the MVP surface to the full management-oriented Phase 2 command set.

**Why now:** Every later epic depends on a stable public command vocabulary and a bridge contract that exposes search, update, copy, collection, scope, and dry-run outcomes without ad hoc shell behavior.

**Scope:**

- add the new public command surface for Phase 2 management:
  - `/stencilsearch <query>`
  - `/stenciledit <name>`
  - `/stencilcopy <source> <target>`
  - `/stencilcollection ...`
- extend existing commands where Phase 2 requires new flags or behaviors:
  - collection-aware listing
  - scope-aware listing and inspection where needed
  - dry-run on `/stencilrun`
- align router skill, direct skills, package docs, and shell entrypoints around one supported grammar
- extend the adapter-facing JSON contract so Claude can distinguish:
  - project versus global source
  - shadowed names and visible precedence
  - correctable validation failures during edit flows
  - preview-only versus execute-ready run results
- keep the shell layer transport-only even as the command set grows

**Out of scope:**

- conversational editing UX details
- final run confirmation and override conversation design
- collection lifecycle behavior beyond what is required to lock the contract

**Exit criteria:**

- the Claude Code adapter has a stable Phase 2 command vocabulary and bridge contract
- later epics can implement user flows without reworking routing or inventing new response shapes mid-stream

## Epic 2 — Search, Filtering, and Collection-Aware Discovery

**Goal:** Make template discovery usable at team scale by exposing search and richer list/filter behavior inside Claude Code.

**Why now:** Once a repo or personal library contains more than a handful of templates, the MVP browse/show flows stop being efficient. Discovery must improve before more mutation features become practical.

**Scope:**

- implement `/stencilsearch <query>`
- extend `/stencillist` with collection-aware and tag-aware filtering consistent with the PRD
- define Claude-facing presentation for:
  - grouped list results
  - empty search results
  - collection-filtered results
  - mixed project/global results when scope allows both
- expose enough source metadata in read flows for users to understand whether a template is:
  - project-local
  - global
  - shadowed by a project-local template of the same name
- decide whether search and list share one result presentation model or intentionally differ

**Key design boundary:**

- search semantics should come from the core bridge rather than duplicated adapter-side filtering
- Claude should present precedence and source clearly, but should not manually compute template visibility by reading the filesystem

**Exit criteria:**

- users can reliably find templates by name, description, tags, and collection from Claude Code
- discovery output remains understandable when both project and global templates are in play

## Epic 3 — Collection Management and Team Organization Flows

**Goal:** Expose project collection workflows so teams can organize shared template libraries without leaving Claude Code.

**Why now:** Team usage quickly depends on grouping templates by domain or workflow. Listing by collection is useful, but Phase 2 also needs commands that let users create and assign those collections intentionally.

**Scope:**

- implement the `stencilcollection` command family needed for Phase 2 team organization
- cover at least the PRD-required collection flows:
  - create a collection
  - assign or move templates into a collection
  - list templates within a collection
- decide the supported public subcommand vocabulary for collection management
- define how collection actions behave for:
  - uncategorized project templates
  - project templates already inside another collection
  - global-only templates that cannot be mutated in place
- define concise Claude-facing success and error presentation for collection operations

**Out of scope:**

- remote/shared collections across installed sources
- collection-specific permissions beyond the current local filesystem model
- advanced authoring UX in VS Code or other adapters

**Exit criteria:**

- a team can create collections and organize project templates into them entirely from Claude Code
- collection behavior is explicit for both movable project templates and read-only global templates

## Epic 4 — Conversational Edit Flow and Safe Mutation Semantics

**Goal:** Implement `/stenciledit <name>` as a trustworthy conversational edit flow for existing templates.

**Why now:** Editing is one of the main management gaps after the MVP. Without it, teams still have to leave Claude Code and hand-edit files for routine maintenance.

**Scope:**

- implement `/stenciledit <name>`
- define the edit model for changing:
  - description
  - tags
  - body
  - placeholder metadata
  - collection assignment when appropriate
- determine how the skill presents the current template state before editing
- validate edited templates through the bridge before persistence
- define collision and mutation rules for:
  - project-local templates
  - project templates shadowing global ones
  - global-only templates that should not be edited in place
- define cancellation and preview-before-save behavior

**Key design boundary:**

- the adapter may guide and summarize edits conversationally
- the adapter should not become a parser or patch engine for Stencil semantics; validation and final mutation remain bridge-backed

**Exit criteria:**

- a user can safely update an existing project template from Claude Code
- edit behavior is predictable when a visible template comes from global scope or is shadowed locally

## Epic 5 — Copy, Localization, and Scope-Aware Template Reuse

**Goal:** Implement `/stencilcopy <source> <target>` as the main reuse workflow for adapting shared templates into project-specific variants.

**Why now:** Copy is the cleanest bridge between personal/global template libraries and team/project workflows. It also provides the safe alternative to mutating global templates directly.

**Scope:**

- implement `/stencilcopy <source> <target>`
- define copy behavior for:
  - project to project duplication
  - global to project localization
  - copying with optional collection or metadata adjustments if the supported contract needs them
- define collision behavior and overwrite policy in Claude-facing terms
- surface source and target scope clearly in confirmation or preview steps
- make “copy then edit” a first-class intended workflow for adapting shared templates

**Out of scope:**

- remote source installation
- cross-repository publishing
- implicit global mutation or sync back to source

**Exit criteria:**

- users can duplicate both project and global templates into new project-local artifacts from Claude Code
- the workflow makes scope transitions explicit and avoids accidental overwrite or mistaken global edits

## Epic 6 — Global Scope, Precedence, and Config-Aware Claude Behavior

**Goal:** Move the Claude Code adapter from MVP project-only behavior to explicit, understandable support for personal/global templates and runtime config.

**Why now:** Epic 3 in the roadmap explicitly includes team-shared and personal template behavior. The current README still treats public Claude flows as project-only, so this is the core adapter contract shift for Phase 2.

**Scope:**

- expose global template support in public Claude flows where appropriate
- define which commands operate on:
  - project scope only
  - visible precedence result
  - both scopes with explicit source labeling
- make project-over-global precedence visible in list, show, search, copy, edit, and delete flows
- honor runtime config in adapter behavior where it affects user expectations, including:
  - default collection behavior in create/copy/edit flows
  - placeholder delimiter behavior indirectly through validation and resolution results
  - custom context effects as surfaced in run and inspection outcomes
- define whether users need explicit scope flags, adapter defaults, or both

**Key design boundary:**

- config parsing and precedence remain core concerns
- the Claude adapter’s job is to expose the resulting behavior clearly and to avoid misleading users about where a template came from or what will be mutated

**Exit criteria:**

- the Claude Code adapter no longer behaves as a project-only MVP
- users can understand which template instance is visible, which one will be mutated, and how config affects behavior

## Epic 7 — Run Review, Value Override, and Dry-Run Workflows

**Goal:** Extend `/stencilrun` from basic conversational completion into a reviewable execution flow suitable for real team use.

**Why now:** The MVP resolves missing inputs and asks for final confirmation, but Phase 2 requires users to inspect resolved values, override auto-filled values, and preview prompts without execution.

**Scope:**

- add the pre-execution summary required by the PRD
- allow users to override auto-resolved, defaulted, or previously entered values during the confirmation stage
- define the conversational loop for override requests without bypassing the bridge-backed resolution model
- implement dry-run mode for `/stencilrun --dry <name>`
- define clear distinction between:
  - resolve preview
  - dry-run completion
  - confirmed execution handoff
- surface provenance clearly enough that users can see which values came from:
  - explicit args
  - follow-up conversation
  - context
  - defaults

**Compatibility boundary:**

- override behavior should re-enter normal resolution paths instead of mutating final prompt text ad hoc
- dry-run should share the same resolution semantics as normal run and differ only in the final execution handoff

**Exit criteria:**

- users can inspect and adjust resolved inputs before execution
- dry-run gives a faithful preview of the final prompt without continuing into execution

## Epic 8 — Phase 2 Hardening, Documentation, and Smoke Coverage

**Goal:** Make the expanded Claude Code management surface reliable enough to serve as the practical daily workflow for teams.

**Why now:** Phase 2 adds more routing, more mutation flows, more scope complexity, and more confirmation states. Without targeted hardening, the adapter will become difficult to trust and maintain.

**Scope:**

- extend smoke and contract coverage for the new command surface
- add coverage for scope-sensitive behaviors:
  - project-over-global precedence
  - global-only mutation rejection
  - copy-from-global localization
  - collection operations on project-only artifacts
- add coverage for run review and dry-run flows
- update package docs and Claude testing docs for the Phase 2 surface
- ensure error presentation stays coherent across:
  - handled bridge errors
  - validation failures
  - cancellation
  - transport/runtime failures

**Out of scope:**

- full end-to-end automation of Claude’s multi-turn conversation behavior beyond what the repo can realistically verify
- future remote-template and multi-adapter compatibility matrices

**Exit criteria:**

- the Phase 2 Claude Code surface has adapter-specific verification and operator-facing documentation
- maintainers can evolve the adapter without losing confidence in management, scope, and run-review behavior

## Recommended Delivery Order

```text
Epic 1 — Phase 2 Command Surface and Bridge Expansion
  -> Epic 2 — Search, Filtering, and Collection-Aware Discovery
  -> Epic 3 — Collection Management and Team Organization Flows
  -> Epic 4 — Conversational Edit Flow and Safe Mutation Semantics
  -> Epic 5 — Copy, Localization, and Scope-Aware Template Reuse
  -> Epic 6 — Global Scope, Precedence, and Config-Aware Claude Behavior
  -> Epic 7 — Run Review, Value Override, and Dry-Run Workflows
  -> Epic 8 — Phase 2 Hardening, Documentation, and Smoke Coverage
```

## Cross-Epic Decisions To Keep Stable

- Keep mutation of visible global-only templates explicit and non-implicit:
  - edit and delete should not silently target global templates
  - copy should be the primary adaptation path for global templates
- Keep scope semantics visible in all management flows:
  - what the user is seeing
  - what the user is changing
  - why a project template wins over a global one
- Keep dry-run and pre-execution review on the same bridge-backed resolution path as normal run.
- Keep shell scripts thin even as command coverage grows.
- Keep this Phase 2 document focused on Claude Code management workflows, not advanced template language or remote distribution.
