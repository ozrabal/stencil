# Plan: Epic 3 — Project Bootstrap And Template Inspection Flows

**Goal:** deliver the first fully usable Claude Code read flows for Stencil by making `/stencilinit`, `/stencillist`, and `/stencilshow` work end-to-end with project-local bootstrap, project-scoped discovery, and Claude-friendly presentation.

**Primary source documents:**

- `docs/epics/05-claude-code-adapter-mvp-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Primary repo inputs:**

- `packages/core/src/stencil.ts`
- `packages/core/src/cli.ts`
- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/storage.ts`
- `packages/core/src/types.ts`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

## Scope Boundary

This plan covers Epic 3 only:

- project-local `.stencil/` bootstrap for Claude Code
- the MVP bootstrap artifact set
- project-scoped template discovery for Claude Code
- Claude-facing list and show presentation
- validation warnings surfaced during inspection
- smoke and automated coverage needed to prove those flows

Keep these out of scope here:

- conversational template authoring UX beyond what already exists mechanically through the CLI bridge
- multi-turn run UX and missing-input collection
- global template UX
- collection management commands
- search, edit, copy, and delete UX expansion
- dry-run mode

## Baseline Verified Before Planning

Verified locally in the current repo:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

Current baseline behavior:

- core tests pass
- Claude adapter routing and bridge smoke tests pass
- the real core CLI bridge already supports `init`, `create`, `list`, `show`, `resolve`, `validate`, and `delete`
- `/stencilinit` currently creates directories only
- `/stencillist` and `/stencilshow` currently expose JSON through the bridge, but the Claude skills still describe transport-only behavior

## Repo Facts That Must Shape The Plan

- Epic 1 and Epic 2 are already materially implemented in the repo, even though the epic source doc describes them as future work.
- `packages/core/src/cli-runner.ts` already returns handled JSON envelopes for:
  - `init`
  - `list`
  - `show`
  - `resolve`
  - `create`
  - `validate`
  - `delete`
- `Stencil.init()` currently creates only `.stencil/templates` and does not seed a sample template or config.
- `runInit()` in the CLI currently reports:
  - `alreadyExisted`
  - `createdPaths`
  - `projectDir`
  - `stencilDir`
    It does not report bootstrap artifacts beyond directories.
- `Stencil` defaults to global template discovery when `globalDir` is omitted. The current CLI instantiates `new Stencil({ projectDir: process.cwd() })`, which means Claude bridge flows currently inherit `~/.stencil` lookup by default.
- Epic 3 explicitly says discovery must stay limited to project scope for the MVP. That is a real contract gap that must be closed.
- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`, `stencil-list/SKILL.md`, and `stencil-show/SKILL.md` are still written as transport-only placeholders. Epic 3 must move presentation into the adapter layer rather than the shell layer.
- The planning notes require thin vertical slices that end in real Claude Code command flows and keep the first implementation wave centered on:
  - `init`
  - `create`
  - `show`
  - `run`
    Epic 3 therefore needs to validate its read flows in a happy path that includes existing `create` and `run` bridge behavior, without absorbing Epic 4 or Epic 5 UX into this plan.

## Planning Decisions To Lock Before Editing

### 1. Keep bootstrap file creation in core, not in shell

Bootstrap artifact creation belongs beside storage and template persistence rules, not in shell wrappers. The shell bridge should continue to invoke the core CLI and forward JSON only.

### 2. Keep Claude-facing presentation in skills, not in shell

The shell layer should not format list tables, inspection blocks, or empty-state copy. Skills should consume structured JSON and present it conversationally.

### 3. Make project-only scope explicit in the CLI/adapter contract

Do not rely on an implicit default if the default is wrong for the MVP. Add an explicit project-only switch or equivalent contract that the Claude adapter uses consistently for all public flows in this MVP wave.

### 4. Keep the bootstrap artifact set minimal and coherent

The bootstrap should create only what Epic 3 needs:

- `.stencil/`
- `.stencil/templates/`
- one sample template suitable for `show` and later `run`

`config.yaml` should remain optional and should not be created by default unless the implementation proves a concrete need.

### 5. Validate Epic 3 as part of the first happy path, not as an isolated read-only island

The read flows should end in a real Claude Code sequence:

1. `/stencilinit`
2. `/stencillist`
3. `/stencilshow <sample>`
4. `/stencilcreate <name>` through the existing bridge contract
5. `/stencilshow <created>`
6. `/stencilrun <created> ...` through the existing resolve bridge

That keeps the slice aligned with the planning note without dragging authoring and run UX scope into this epic.

## Desired Outcome After Epic 3

At the end of this epic:

- `/stencilinit` creates a usable local Stencil scaffold, including one sample template
- Claude tells the user what happened and what to do next
- `/stencillist` shows only project templates and handles empty state cleanly
- `/stencilshow <name>` presents template metadata, body, and validation feedback without requiring filesystem inspection
- the adapter stays thin at the shell layer and uses the existing CLI/JSON bridge contract rather than embedding Stencil logic in scripts
- the Epic 3 read flows participate in a real `init -> create -> show -> run` Claude Code validation path

## Validation Standard To Add In This Epic

Epic 3 should leave the repo with a repeatable validation path like:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

Recommended new automated coverage:

- core tests for bootstrap artifact creation and idempotency
- CLI tests for enriched `init` output
- bridge smoke tests for sample-template bootstrap
- bridge smoke tests proving project-only discovery
- adapter-side tests or assertions that keep skill-facing command examples aligned with the new happy path
- show-path tests covering validation warnings as well as valid templates

## Recommended Files To Change

Expected core updates:

- `packages/core/src/stencil.ts`
- `packages/core/src/cli.ts`
- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/types.ts` if any bootstrap metadata types need promotion
- `packages/core/test/stencil.test.ts`
- `packages/core/test/cli.test.ts`

Recommended new core files:

- `packages/core/src/bootstrap.ts` or `packages/core/src/bootstrap-template.ts`

Expected Claude adapter updates:

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

Exact filenames may vary, but preserve these separations:

- core bootstrap artifact logic
- core CLI contract and scope options
- shell transport only
- skill presentation only
- smoke coverage that exercises the real bridge

## Implementation Sequence

## Step 1 — Lock The Bootstrap Artifact And Scope Contract

**Objective:** decide the exact MVP bootstrap output and the exact mechanism that keeps Claude discovery project-local.

**Files to change:**

- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Lock the bootstrap artifact set to:
   - `.stencil/`
   - `.stencil/templates/`
   - one sample template in `.stencil/templates/`
2. Use a sample template that is immediately useful for inspection and later `run` validation.
   Recommended choice: `quick-fix.md`, because the PRD and architecture already show uncategorized starter templates under `templates/`.
3. Decide the project-only bridge contract.
   Recommended approach: add a CLI flag such as `--project-only` for storage-backed commands so the Claude adapter states its scope explicitly.
4. Decide which commands should use project-only scope in the Claude adapter MVP.
   Recommended minimum:
   - `init`
   - `create`
   - `list`
   - `show`
   - `resolve`
   - `validate`
   - `delete`
5. Extend the `init` JSON contract before implementation so the adapter can render useful guidance without inference.
   Recommended additions:
   - `sampleTemplateCreated: boolean`
   - `sampleTemplateName?: string`
   - `sampleTemplatePath?: string`
6. Document the contract in the Claude plugin README so later epics do not accidentally reintroduce global scope or shell-owned formatting.

**Validation:**

```bash
rg -n "project-only|project scope|sample template|quick-fix" packages/core packages/claude-code-plugin
pnpm --filter @stencil-pm/core test -- cli
```

**Completion gate:** the sample artifact choice, project-only mechanism, and `init` envelope fields are explicit enough to implement without further design churn.

---

## Step 2 — Implement Core Bootstrap Artifacts For `/stencilinit`

**Objective:** make `init` create a usable local scaffold instead of only empty directories.

**Files to change:**

- `packages/core/src/stencil.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/stencil.test.ts`
- `packages/core/test/cli.test.ts`

**Recommended file to add:**

- `packages/core/src/bootstrap.ts` or `packages/core/src/bootstrap-template.ts`

**Actions:**

1. Move sample-template content into core-owned code or constants so bootstrap logic is centralized and testable.
2. Update `Stencil.init()` to:
   - create `.stencil/` and `.stencil/templates/`
   - seed the sample template on first bootstrap
   - never overwrite an existing user template
3. Define predictable seeding behavior for partially initialized projects.
   Recommended rule:
   - if the project has no existing project templates and the sample file is missing, seed the sample
   - otherwise create missing directories only
4. Extend `runInit()` to report sample-template bootstrap metadata in JSON.
5. Keep the shell transport unchanged at this step; only core and CLI behavior should change.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test -- stencil
pnpm --filter @stencil-pm/core test -- cli
```

Add or update tests for:

- fresh init creates `.stencil/templates`
- fresh init seeds the sample template
- rerunning init is idempotent
- existing sample is not overwritten
- existing non-sample templates suppress unwanted reseeding
- CLI `init` envelope includes sample metadata

**Completion gate:** running the real core CLI `init` in a temp project yields a machine-readable bootstrap result that includes sample-template details and preserves idempotency.

---

## Step 3 — Make Claude Bridge Scope Explicitly Project-Only

**Objective:** prevent Claude MVP read flows from leaking global templates from `~/.stencil`.

**Files to change:**

- `packages/core/src/cli.ts`
- `packages/core/src/cli-args.ts`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Add the chosen scope flag or equivalent parsing support in the core CLI.
2. Thread that option into `new Stencil(...)` so project-only mode sets `globalDir: null`.
3. Update Claude shell transport so every public MVP command uses project-only mode consistently.
4. Keep this as contract work between core and adapter.
   Do not “solve” it in shell by filtering JSON after the fact.
5. Add tests that create:
   - one project-local template
   - one global-only template
     and prove the Claude bridge sees only the project-local one.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test -- cli
pnpm --filter @stencil-pm/claude-code-plugin test
```

Add or update tests for:

- CLI default behavior if retained
- CLI project-only behavior
- Claude bridge `list` ignores global-only templates
- Claude bridge `show` fails for global-only templates when invoked through the Claude adapter

**Completion gate:** project scope is enforced by the CLI/adapter contract, not by convention.

---

## Step 4 — Implement The `/stencilinit` Claude-Facing Flow

**Objective:** turn the current transport-only `stencil-init` skill into a real onboarding command.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Rewrite the skill behavior around the handled `init` JSON envelope rather than the current “hand off only” placeholder text.
2. Define two user-visible states:
   - first bootstrap
   - already initialized
3. For first bootstrap, have the skill present:
   - that `.stencil/` was created
   - the sample template name
   - the next commands:
     - `/stencillist`
     - `/stencilshow <sample>`
     - `/stencilrun <sample>` or `/stencilcreate <name>` as the next-wave path
4. For already initialized projects, have the skill present a shorter response that points the user to browse or inspect existing templates.
5. Keep all formatting and user guidance in the skill text.
   Do not move presentation into shell output.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
rg -n "/stencillist|/stencilshow|/stencilrun|/stencilcreate" packages/claude-code-plugin/skills/stencil-init/SKILL.md
```

Recommended manual validation in Claude Code:

1. Open a clean temp repo.
2. Run `/stencilinit`.
3. Confirm the response names the sample template and points to the next commands.
4. Run `/stencilinit` again and confirm the response switches to the already-initialized path.

**Completion gate:** `/stencilinit` is a complete first-use Claude flow, not just a bridge invocation.

---

## Step 5 — Implement `/stencillist` Empty-State And Summary Presentation

**Objective:** let users browse project templates in Claude Code without inspecting `.stencil/` manually.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Keep the bridge response as JSON summaries only.
   Do not add template bodies or validation noise to the list command.
2. Define the empty-state response.
   Recommended behavior:
   - if zero templates, say no project templates were found
   - suggest `/stencilinit` if the project is unbootstrapped
   - otherwise suggest `/stencilcreate <name>`
3. Define the non-empty summary presentation.
   Recommended summary fields per template:
   - name
   - description
   - collection if present
   - tags if present
   - version
4. Keep the list surface project-scoped and intentionally simple.
   No search, filter, or global/template-precedence UX in this epic.
5. Preserve the separation between:
   - list as a browse command
   - show as the detailed inspection command

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
pnpm --filter @stencil-pm/core test -- cli
```

Add or update tests for:

- empty list from a clean initialized project
- list after sample bootstrap
- list after creating an additional template
- project-only list behavior when a global template also exists

Recommended manual validation in Claude Code:

1. Run `/stencillist` in an empty repo before init.
2. Run `/stencilinit`.
3. Run `/stencillist` again and confirm the sample appears.
4. Create another template through the existing create bridge path and confirm both templates appear.

**Completion gate:** `/stencillist` is a usable browse flow with clear empty-state guidance and concise summaries.

---

## Step 6 — Implement `/stencilshow <name>` Template Inspection

**Objective:** make inspection detailed enough that the user can understand and trust a template without opening the file manually.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Rewrite the `stencil-show` skill around the handled `show` JSON envelope.
2. Define the standard inspection layout. Recommended sections:
   - template name and description
   - version, collection, tags, author, source, file path
   - placeholder summary if present
   - body in a fenced Markdown block
3. Surface validation feedback explicitly:
   - if `validation.valid === true` and there are warnings, show the warnings
   - if the command returns `error`, present the error and point the user to `/stencillist`
4. Keep validation ownership in core.
   The skill should display warnings; it should not re-run or reinterpret validation rules itself.
5. Add at least one warning-path test.
   A good candidate is a template with unused frontmatter placeholder metadata that validates with warnings but not errors.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test -- cli
pnpm --filter @stencil-pm/claude-code-plugin test
```

Add or update tests for:

- `show` on the bootstrap sample
- `show` on a newly created template
- `show` missing-template error path
- `show` warning path where validation is `valid: true` but `issues.length > 0`

Recommended manual validation in Claude Code:

1. Run `/stencilshow <sample>`.
2. Confirm the body is visible and readable.
3. Confirm metadata and placeholders are summarized cleanly.
4. Confirm missing-template guidance points back to `/stencillist`.

**Completion gate:** `/stencilshow` becomes the canonical inspection command, with warnings surfaced but validation logic still owned by core.

---

## Step 7 — Run The First-Wave Happy-Path Acceptance Pass

**Objective:** prove Epic 3 supports the required thin vertical slice ending in real Claude Code command flows.

**Files to change:**

- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Add or update one smoke path that executes this sequence across the real bridge:
   - `init`
   - `list`
   - `show <sample>`
   - `create <name>` using stdin JSON
   - `show <created>`
   - `run <created> ...` through `resolve`
2. Keep create/run coverage here limited to proving the Epic 3 flows fit the first happy path.
   Do not expand into conversational authoring or multi-turn run UX.
3. Document the acceptance sequence in the Claude plugin README so future contributors can manually verify the intended MVP path.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
pnpm --filter @stencil-pm/core test
```

Recommended manual acceptance sequence in Claude Code:

1. `/stencilinit`
2. `/stencillist`
3. `/stencilshow quick-fix`
4. `/stencilcreate review-checklist`
5. `/stencilshow review-checklist`
6. `/stencilrun review-checklist component_name=AuthService`

Expected outcome:

- every step works without manual filesystem inspection
- init/list/show are project-scoped
- the sample template provides a bridge into the create/show/run happy path

**Completion gate:** Epic 3 is proven as a real slice in the larger MVP wave, not as a standalone read-only demo.

## Risks And Watchpoints

- **Global-scope leakage:** if project-only scope is not made explicit, Claude may expose templates from `~/.stencil`, violating Epic 3 scope.
- **Bootstrap overwrite risk:** if sample seeding is too aggressive, rerunning init can clobber or recreate files in ways users do not expect.
- **Shell-layer creep:** formatting list or show results in shell output will make later UX changes brittle and duplicate logic across layers.
- **Sample-template churn:** changing the sample name or content later will break onboarding copy and smoke tests unless the contract is centralized.
- **Warning-path blind spot:** if tests cover only valid templates, `show` may fail to surface useful validation warnings even though the core provides them.

## Definition Of Done

- `/stencilinit` bootstraps a project-local `.stencil/` tree and sample template through core-owned logic
- `/stencillist` and `/stencilshow` operate in project-only scope for the Claude adapter
- Claude-facing skills for init, list, and show are no longer transport-only placeholders
- validation warnings are visible during `show`
- automated coverage proves bootstrap, scope, empty-state, inspection, and the `init -> create -> show -> run` happy path
