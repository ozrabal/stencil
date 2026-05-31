# Plan: Epic 1 — Phase 2 Command Surface and Bridge Expansion

**Goal:** extend the Claude Code adapter from the current Phase 1 MVP command surface into the Phase 2 management contract without creating a second adapter architecture, duplicating core behavior in shell, or pulling later conversational UX epics into this foundation step.

**Primary source documents:**

- `docs/epics/06-claude-code-management-team-workflows-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Primary repo inputs:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/.claude-plugin/plugin.json`
- `packages/claude-code-plugin/skills/**/SKILL.md`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/scripts/lib/args.sh`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/stencil.ts`
- `packages/core/src/types.ts`
- `packages/core/test/stencil.test.ts`

## Scope Boundary

This plan covers Epic 1 only:

- the public Phase 2 command vocabulary for Claude Code
- the shell transport and CLI/JSON bridge changes needed to support that vocabulary
- scope-aware read metadata needed by later epics
- dry-run contract support on the same resolution path as normal run
- collection command-family contract locking
- bridge-backed update and copy entrypoints that later skills can build on
- docs and smoke coverage needed to make the contract stable

Keep these out of scope here:

- full conversational edit UX
- final override conversation design during run confirmation
- rich copy confirmations
- advanced collection lifecycle polish beyond the minimum contract needed now
- advanced template language work
- remote sources, install/publish, or sync workflows

## Baseline Verified In The Current Repo

The repo is already past the “invent the bridge” stage:

- the public Claude Code package exposes only the MVP commands:
  - `/stencil`
  - `/stencilinit`
  - `/stencilcreate`
  - `/stencillist`
  - `/stencilshow`
  - `/stencilrun`
  - `/stencildelete`
- `packages/claude-code-plugin/scripts/stencil-command.sh` currently routes only:
  - `init`
  - `list`
  - `create`
  - `show`
  - `run`
  - `resolve`
  - `detect-context`
  - `delete`
  - `validate`
- `packages/claude-code-plugin/scripts/lib/bridge.sh` forces `--project-only` on all public MVP flows except the internal `resolve` helper
- `packages/claude-code-plugin/.claude-plugin/plugin.json` references only the seven MVP skills
- the adapter README explicitly documents project-only behavior for the MVP
- the core already contains most Phase 2 domain capabilities:
  - `Stencil.search()`
  - `Stencil.update()`
  - `Stencil.copy()`
  - `Stencil.rename()`
  - `Stencil.collections.*`
  - runtime config loading
  - global directory discovery
  - project-over-global precedence
- the current CLI contract does **not** yet expose public `search`, `copy`, `update`, or collection commands
- the current CLI contract does **not** yet expose enough scope metadata to explain:
  - visible source vs hidden source
  - shadowed names
  - whether a visible global template is mutable in place
  - whether a run result is preview-only or execute-ready

That means Epic 1 is primarily contract expansion and adapter surface alignment, not new business logic invention.

## Planning Decisions To Lock Before Editing

### 1. Keep Phase 2 as one adapter architecture

Do not create separate transport patterns for new commands. Reuse the existing model:

- skills own user-facing wording
- shell owns normalization and process invocation
- core owns semantics and JSON outcomes

### 2. Keep shell scripts transport-only

Do not reimplement any of these in shell:

- search filtering
- collection membership logic
- project/global precedence
- mutation rules for global-only templates
- dry-run rendering
- validation interpretation

### 3. Make scope visible in the bridge, not inferred in skills

Later epics need to explain:

- what the user is looking at
- whether it is project or global
- whether a project template is shadowing a global one
- whether a mutation is allowed
- why copy is the correct path for global-only templates

That metadata must come from the bridge.

### 4. Keep public mutations explicit

Lock these rules now:

- visible global-only templates are never mutated implicitly
- edit and delete target project templates only unless the contract explicitly says otherwise
- copy is the primary adaptation path from global to project
- overwrite remains explicit, never inferred

### 5. Dry-run must reuse normal resolution

`/stencilrun --dry <name>` must use the same template loading, validation, context resolution, defaults, and unresolved-input handling as normal run. The only difference is the final handoff.

### 6. Thin slices must still end in real command flows

Each implementation step below ends with a working public Claude Code command or a public command-family subflow. Epic 1 should not stop at internal helpers only.

## Target Contract To Land In Epic 1

### Public direct commands

- `/stencilsearch <query>`
- `/stenciledit <name>`
- `/stencilcopy <source> <target>`
- `/stencilcollection <subcommand> ...`

### Existing commands extended in Epic 1

- `/stencillist [--collection <name>] [--scope project|global|all]`
- `/stencilshow <name> [--scope project|global|visible]` if scope flags are needed after implementation review
- `/stencilrun [--dry] <name> [key=value ...]`

### Recommended `stencilcollection` subcommand set to lock now

Keep the family small and Phase 2-specific:

- `create <name>`
- `list`
- `assign <template> <collection>`
- `remove <template>`

This is enough to support the PRD requirements and later Epic 3 UX without introducing broader lifecycle work yet.

### Bridge contract families that must exist by the end of Epic 1

- read/search results with scope visibility metadata
- copy results with explicit source and target scope metadata
- update results and validation-failed outcomes suitable for `/stenciledit`
- collection command results for create/list/assign/remove
- run results that distinguish dry preview from execute-ready resolution

## Recommended Implementation Steps

### Step 1. Expand the canonical command grammar, manifest, and routing contract

**Outcome:** the package publicly recognizes the Phase 2 vocabulary everywhere the adapter declares its supported surface.

**Why first:** later steps become noisy and risky if command names, help text, and skill inventory drift.

**Files to change:**

- `packages/claude-code-plugin/.claude-plugin/plugin.json`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/skills/stencil/SKILL.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/fixtures/routing-contract.json`
- add skill directories for:
  - `skills/stencil-search/`
  - `skills/stencil-edit/`
  - `skills/stencil-copy/`
  - `skills/stencil-collection/`

**Work:**

1. Extend the canonical help text in the router and README.
2. Add the new direct command names and router subcommands to the manifest and routing fixture.
3. Keep command wording aligned between README, router skill, and tests.
4. Define the accepted argument shapes now, even where later steps still deepen behavior.
5. Add explicit notes that management UX remains adapter-owned and transport stays thin.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

**Real command flow to prove before moving on:**

```text
/stencil help
```

It should show the full Phase 2 vocabulary and no obsolete MVP-only grammar.

### Step 2. Extend the core CLI command set and shared shell transport for Phase 2 operations

**Outcome:** the bridge can invoke public `search`, `copy`, `update`, and collection operations without ad hoc shell behavior.

**Why now:** every later slice depends on real transport support instead of skill-local placeholders.

**Files to change:**

- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/stencil.ts` only if small adapter-facing helpers are truly needed
- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/scripts/lib/args.sh`

**Work:**

1. Add CLI commands for:
   - `search`
   - `copy`
   - `update`
   - `collection`
2. Keep stdin JSON only for payload-shaped mutations:
   - `create`
   - `update`
   - optionally `copy` if overrides are supported immediately
3. Extend shared shell validation to enforce command shape only.
4. Preserve the existing `exit 64` and `exit 70` transport rules.
5. Continue mapping public shell verbs to core-owned operations in one place only.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Real command flow to prove before moving on:**

```text
/stencilsearch rest
```

The skill can still stay simple at this point, but the command must already route through the real bridge and return handled JSON-backed results.

### Step 3. Add scope visibility metadata to list, show, and search envelopes

**Outcome:** read flows tell Claude which template instance is visible and whether another instance is hidden by precedence.

**Why now:** later epics depend on scope clarity. Do not defer this to skill prose.

**Files to change:**

- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-search/SKILL.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Work:**

1. Extend template summary/detail envelopes with scope metadata from core.
2. Make sure the visible template still carries its existing `source`.
3. Add bridge data that answers:
   - is the visible item project or global
   - is a same-name template hidden by precedence
   - is the visible item mutable in place
4. Do not make skills compute precedence by reading files or comparing list results.
5. Update list/show/search skill docs to surface scope labels consistently.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Real command flows to prove before moving on:**

```text
/stencillist
/stencilshow <name>
/stencilsearch <query>
```

With a project template shadowing a global template of the same name, the read output should make that precedence visible.

### Step 4. Add collection-aware read flows and lock the `stencilcollection` command-family grammar

**Outcome:** users can browse collections and the repo has a stable contract for collection commands before richer organization UX lands.

**Why now:** Epic 2 and Epic 3 both depend on settled collection command shapes.

**Files to change:**

- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-collection/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Work:**

1. Extend `list` transport to accept a collection filter.
2. Add `collection list` as a first-class bridge command.
3. Keep collection result payloads simple:
   - collection names
   - template summaries when listing contents
4. Lock the public `stencilcollection` grammar in docs and tests now.
5. Keep shell scripts unaware of collection filesystem layout.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Real command flows to prove before moving on:**

```text
/stencilcollection list
/stencillist --collection backend
```

These should both resolve through core-backed collection semantics, not adapter-side filtering.

### Step 5. Add minimal collection mutation commands through the bridge

**Outcome:** the command family already supports the PRD’s essential team-organization operations, even before Epic 3 refines their UX.

**Why here:** this finishes the collection contract in Epic 1 and gives later work a stable mutation surface.

**Files to change:**

- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/skills/stencil-collection/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Work:**

1. Add handled CLI operations for:
   - `collection create <name>`
   - `collection assign <template> <collection>`
   - `collection remove <template>`
2. Reuse existing core collection and update capabilities rather than shell moves.
3. Make global-only mutation rejection explicit in the returned error payloads.
4. Keep success envelopes concise and machine-usable.
5. Document that destructive or confusing collection changes remain confirmation-driven in skills, not in shell.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Real command flow to prove before moving on:**

```text
/stencilcollection create backend
/stencilcollection assign review-checklist backend
/stencillist --collection backend
```

### Step 6. Add `/stencilcopy <source> <target>` as a real bridge-backed localization path

**Outcome:** copy becomes the explicit reuse path from project or global scope into a project-local artifact.

**Why before edit:** copy is the safe alternative to global mutation and must exist before edit semantics can lean on it.

**Files to change:**

- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/skills/stencil-copy/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Work:**

1. Add a public `copy` shell verb and CLI command.
2. Start with the required public grammar:
   - `/stencilcopy <source> <target>`
3. Include bridge data that makes source scope and target scope explicit.
4. Reject overwrite by default.
5. Reject overwrite of visible global-only targets explicitly.
6. Keep optional override payload support internal unless it is needed immediately.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Real command flows to prove before moving on:**

```text
/stencilcopy shared-review local-review
/stencilshow local-review
```

At least one smoke scenario should copy from global scope into project scope and verify the resulting template is project-local.

### Step 7. Add the update bridge and a minimal `/stenciledit <name>` contract without pulling Epic 4 into Epic 1

**Outcome:** the adapter has a real update entrypoint and validation-failed envelope for future conversational editing, while still exposing a public command now.

**Why this shape:** Epic 4 owns the trustworthy conversational edit flow. Epic 1 should only land the command surface, update transport, and stable response shapes that Epic 4 will consume.

**Files to change:**

- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/skills/stencil-edit/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Work:**

1. Add a public `update` CLI command that accepts a stdin JSON patch.
2. Define a patch shape that can cover the Phase 2 edit fields:
   - body
   - description
   - tags
   - placeholder metadata
   - collection assignment
3. Return `status=validation_failed` for correctable edit problems.
4. Return explicit mutation-not-allowed errors for visible global-only templates.
5. Keep `/stenciledit <name>` public now, but keep its skill limited to bridge-backed inspection plus contract-driven update behavior.
6. Do not implement freeform conversational patching logic in shell.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Real command flow to prove before moving on:**

```text
/stenciledit review-checklist
```

Epic 1’s acceptance bar is that the command reaches a real bridge-backed edit contract and can produce:

- editable project-template success
- correctable validation failure
- explicit global-only mutation rejection

The richer turn-by-turn edit conversation belongs to Epic 4.

### Step 8. Extend `/stencilrun` with dry-run contract support on the same resolution path

**Outcome:** the adapter can distinguish preview-only from execute-ready run results without splitting run semantics.

**Why in Epic 1:** the epic explicitly includes dry-run on `/stencilrun`, and later Epic 7 depends on a settled contract.

**Files to change:**

- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Work:**

1. Add `--dry` parsing to the public `run` command shape.
2. Keep `resolve` as the underlying semantic path.
3. Extend the run envelope so Claude can tell whether the result is:
   - preview-only
   - ready for execution confirmation
4. Preserve `needs_input` behavior for dry-run.
5. Do not add override conversation design here.
6. Update run skill docs so dry-run does not imply a separate resolver.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Real command flows to prove before moving on:**

```text
/stencilrun --dry review-checklist component_name=AuthService
/stencilrun review-checklist component_name=AuthService
```

The resolved prompt content and provenance should come from the same bridge path in both cases.

### Step 9. Finish with Phase 2 contract hardening and operator documentation

**Outcome:** the expanded surface is documented, smoke-tested, and safe for later epics to build on without reworking the contract.

**Files to change:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`

**Work:**

1. Update the README command matrix for the new Phase 2 surface.
2. Document scope semantics clearly:
   - project wins over global
   - visible global-only templates are not mutated implicitly
   - copy is the main localization path
3. Add smoke scenarios for:
   - project-over-global precedence visibility
   - global-only edit rejection
   - global-only delete rejection if the public contract still prevents it
   - global-to-project copy
   - collection create/assign/list
   - dry-run vs normal run
4. Keep handled errors, validation failures, and transport failures distinct in docs and tests.
5. Verify shell scripts remain offline-first and network-free.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Real command acceptance pass:**

```text
/stencilsearch rest
/stencillist --collection backend
/stencilcollection create backend
/stencilcollection assign review-checklist backend
/stencilcopy shared-review local-review
/stenciledit local-review
/stencilrun --dry local-review component_name=AuthService
```

## Recommended Contract Details To Keep Stable Across The Work

### Scope metadata

The exact field names can be finalized during implementation, but the bridge must expose data equivalent to:

- visible source
- whether another same-name template exists in the other scope
- whether the visible template can be mutated in place
- enough context to explain precedence without filesystem inspection

### Mutation error semantics

Use handled `status=error` envelopes for:

- global-only update rejection
- global-only delete rejection
- overwrite conflicts
- collection assignment on missing templates

Use handled `status=validation_failed` only for correctable template-shape problems.

### Run/dry-run semantics

Use one resolution model and one provenance model for both:

- normal run
- dry-run
- later override flows

Do not let skills patch final prompt text outside the bridge contract.

## Completion Gate

Epic 1 is complete when all of the following are true:

- the Claude Code package publicly exposes the Phase 2 command vocabulary
- the shared shell transport can invoke the corresponding bridge operations without business logic drift
- list, show, and search surfaces expose scope metadata needed for later precedence-aware UX
- `stencilcollection` has a stable command-family grammar and minimally working bridge-backed flows
- `/stencilcopy <source> <target>` is real and scope-explicit
- `/stenciledit <name>` has a real update contract and validation/error envelope even though Epic 4 still owns the rich conversation
- `/stencilrun --dry` shares the same bridge-backed resolution path as normal run
- README, testing docs, routing tests, and bridge smoke tests all reflect the expanded Phase 2 contract

## Final Validation Command Set

Run this full pass before closing the epic:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
pnpm --filter @stencil-pm/claude-code-plugin test
```

If any slice requires new targeted fixtures for global scope, collection layout, or update payloads, add them to the adapter and core test suites rather than validating manually against local state only.
