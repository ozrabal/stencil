# Next Functional Epics — Post-Core Roadmap

> Purpose: define the next product epics after the core package is implemented.
> Audience: maintainers breaking roadmap items into implementation tasks.
> Assumption: `@stencil-pm/core` is complete, including the remaining core-gap work in `docs/epics/02-core-gap-epics.md`.

## Planning Principles

- Prioritize the first end-to-end user experience before broader platform reach.
- Keep core concerns in core; adapter UX stays adapter-owned.
- Deliver by usable slices, not by scaffolding multiple adapters at once.
- Prefer the fastest high-feedback adapter first, then expand to conversational and collaboration-heavy surfaces.

## Epic 1 — VS Code Extension MVP

**Goal:** Deliver the first GUI adapter for template browsing and execution.

**Why now:** VS Code provides the fastest feedback loop for validating browsing, authoring, input, and preview flows around the implemented core.

**Scope:**

- Register extension activation and commands
- Implement Run, Create, and List commands
- Add Quick Pick template selection
- Add sequential placeholder input flow
- Add sidebar Tree View for templates and collections
- Add basic syntax support for template files
- Reuse core for all template/state logic

**Exit criteria:**

- A VS Code user can browse templates, run them, and create basic templates without using the terminal
- The extension covers the PRD Phase 2 MVP scope

## Epic 2 — Claude Code Adapter MVP

**Goal:** Ship the first complete conversational adapter for Stencil.

**Scope:**

- Implement `/stencil-init`
- Implement `/stencil-create`
- Implement `/stencil-list`
- Implement `/stencil-show`
- Implement `/stencil-run`
- Implement `/stencil-delete`
- Wire skills to shell scripts and core facade
- Handle interactive placeholder collection for unresolved required values
- Return clear success/error messages from typed core errors

**Exit criteria:**

- A user can initialize, create, inspect, run, and delete templates entirely from Claude Code
- The happy path matches PRD Phase 1 behavior

## Epic 3 — Claude Code Management and Team Workflows

**Goal:** Complete the practical day-to-day management features needed for team usage in Claude Code.

**Scope:**

- Implement `/stencil-search`
- Implement `/stencil-edit`
- Implement `/stencil-copy`
- Implement collection commands and collection-aware listing
- Expose global template support and precedence behavior
- Add pre-execution confirmation and value override flow
- Add dry-run mode
- Honor runtime config in adapter behavior where relevant

**Exit criteria:**

- Claude Code supports the full Phase 2 command surface
- Team-shared and personal templates behave predictably across project/global scope

## Epic 4 — Advanced Template Language

**Goal:** Expand Stencil from flat templates to richer reusable prompt workflows.

**Scope:**

- Typed placeholders: `enum`, `number`, `file_path`, `boolean`
- Enum options selection flows in adapters
- Conditional sections
- Template includes
- Placeholder-level validation rules
- Multi-step template execution model
- Documentation for authoring advanced templates

**Exit criteria:**

- Advanced syntax is supported consistently in core and exposed in at least Claude Code and VS Code
- Invalid advanced templates fail with actionable diagnostics

## Epic 5 — VS Code Authoring and Preview Polish

**Goal:** Make VS Code a strong authoring environment, not only a runner.

**Scope:**

- Webview-based placeholder form
- Live resolved template preview
- CodeLens actions for run/preview
- Inline diagnostics for template issues
- Autocomplete for placeholders and `$ctx.*`
- Optional direct handoff to Claude Code VS Code integration

**Exit criteria:**

- Template authoring feedback is visible inside the editor without command round-trips
- VS Code reaches the PRD Phase 3 experience level

## Epic 6 — Remote Templates and Collaboration

**Goal:** Move beyond repo-local sharing into installable and publishable template sources.

**Scope:**

- Remote template source model
- `stencil install <source>`
- `stencil publish`
- Versioning and upgrade notifications
- Collision/conflict handling across sources
- VS Code remote browse/install experience

**Exit criteria:**

- Templates can be consumed and distributed outside a single repository
- Source precedence and upgrade behavior are explicit and testable

## Epic 7 — Codex Adapter

**Goal:** Bring Stencil to Codex with a workflow suited to agent-driven execution.

**Scope:**

- Define Codex command/agent entrypoints
- Implement template discovery and execution scripts
- Support interactive fill via agent conversation flow
- Support dry-run/preview behavior
- Document adapter-specific usage and constraints

**Exit criteria:**

- Codex can execute the core Stencil flows without depending on Claude Code or VS Code components

## Epic 8 — Ecosystem and Quality Platform

**Goal:** Make Stencil maintainable and extensible as a broader community product.

**Scope:**

- Curated starter template packs
- Template testing framework
- Plugin/API extension points
- CI/CD integration workflows
- Opt-in usage analytics if still desired
- Contributor and publishing workflows for adapters/templates

**Exit criteria:**

- Stencil has a repeatable path for community contribution, template quality assurance, and long-term ecosystem growth

## Recommended Delivery Order

```text
Epic 1 — VS Code Extension MVP
  -> Epic 2 — Claude Code Adapter MVP
  -> Epic 3 — Claude Code Management and Team Workflows
  -> Epic 4 — Advanced Template Language
  -> Epic 5 — VS Code Authoring and Preview Polish
  -> Epic 6 — Remote Templates and Collaboration
  -> Epic 7 — Codex Adapter
  -> Epic 8 — Ecosystem and Quality Platform
```

## Notes for Task Breakdown

- Break each epic into thin vertical slices that end in a demonstrable user flow.
- Treat advanced template language work as cross-cutting: core first, then adapter UX.
- Do not start Codex or remote collaboration work before VS Code and Claude Code MVP flows are stable.
