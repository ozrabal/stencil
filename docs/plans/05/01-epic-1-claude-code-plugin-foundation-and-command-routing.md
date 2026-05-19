# Plan: Epic 1 — Claude Code Plugin Foundation And Command Routing

**Goal:** turn `packages/claude-code-plugin/` from static scaffolding into a stable Claude Code adapter shell with one routing model, one command vocabulary, and one explicit shell-to-core contract boundary that later epics can build on.

**Primary source documents:**

- `docs/epics/05-claude-code-adapter-mvp-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Primary repo inputs:**

- `packages/claude-code-plugin/.claude-plugin/plugin.json`
- `packages/claude-code-plugin/skills/**/SKILL.md`
- `packages/claude-code-plugin/scripts/*.sh`
- `packages/core/src/stencil.ts`
- `packages/core/src/index.ts`

## Scope Boundary

This plan covers Epic 1 only:

- plugin manifest and package metadata
- router behavior for `/stencil`
- direct command skill alignment
- adapter-local argument conventions
- explicit ownership boundaries between skill text, shell transport, and future Node/core invocation
- smoke coverage needed to prove routing and contract stability

Keep these out of scope here:

- real template CRUD behavior
- conversational placeholder collection
- destructive delete semantics
- full core CLI implementation
- adapter-side shell business logic that duplicates core

## Repo Facts That Must Shape The Plan

- `packages/claude-code-plugin/` exists, but every skill is still a TODO stub.
- The plugin manifest currently lists only seven skills and no further contract detail.
- The package README currently documents hyphenated commands like `/stencil-init`, while the epic and PRD define the MVP surface as unhyphenated slash commands:
  - `/stencilinit`
  - `/stencilcreate`
  - `/stencillist`
  - `/stencilshow`
  - `/stencilrun`
  - `/stencildelete`
- The current shell layer contains only three stub scripts:
  - `detect-context.sh`
  - `resolve-template.sh`
  - `validate-template.sh`
- `@stencil-pm/core` already exposes the facade methods later epics need, including:
  - `init()`
  - `create()`
  - `list()`
  - `get()`
  - `resolve()`
  - `delete()`
  - `validate()`
- `@stencil-pm/core` does not yet expose a CLI entry point. That bridge belongs to Epic 2 and must stay explicit.

## Planning Decisions To Lock Before Editing

### 1. Use the epic/PRD command surface as the external truth

Epic 1 should normalize the user-facing Claude command names to the unhyphenated MVP vocabulary from the product docs. If internal folder names stay hyphenated temporarily, the user-facing help and routing contract must still present one canonical surface.

### 2. Keep `/stencil` as the router and direct commands as first-class entry points

Both entry styles are required:

- `/stencil <subcommand> ...`
- direct command skills such as `/stencilrun ...`

They must share the same command vocabulary, help text, argument rules, and shell bridge behavior.

### 3. Treat the shell layer as transport only

Shell scripts may:

- normalize command names and arguments
- locate the package root
- invoke the future Node bridge
- propagate exit codes and JSON output

Shell scripts must not:

- parse template files
- implement placeholder resolution rules
- invent fallback Stencil business logic

### 4. Keep adapter gaps explicit until Epic 2 lands

Because the core CLI bridge does not exist yet, Epic 1 should not fake business behavior in shell scripts. Until Epic 2 lands, routed commands should either:

- stop at a stable, explicit “bridge not implemented yet” adapter response, or
- use a dedicated test-only fixture bridge to prove argument forwarding in smoke tests

The distinction between real transport and temporary verification scaffolding must remain obvious.

### 5. Break work into vertical slices ending in real Claude Code command flows

The first implementation wave must prioritize coherent, demonstrable command flows for:

- `init`
- `create`
- `show`
- `run`

`list` should be kept aligned in the vocabulary and routing table, but it does not need to drive the first validation wave ahead of those four. `delete` should be reserved in the contract without pulling destructive UX into this epic.

## Desired Outcome After Epic 1

At the end of this epic:

- the Claude Code package exposes one stable command vocabulary
- `/stencil` can show help, reject unknown subcommands cleanly, and route known subcommands consistently
- direct command skills mirror the router contract
- adapter argument rules are documented and enforced consistently
- the shell boundary is thin and shared rather than duplicated per skill
- there is package-local validation proving routing behavior without pretending Epic 2 already exists

## Baseline Validation Before Editing

Current baseline is mostly structural because the package has no test harness yet.

```bash
test -f packages/claude-code-plugin/.claude-plugin/plugin.json
find packages/claude-code-plugin/skills -name SKILL.md | sort
bash -n packages/claude-code-plugin/scripts/*.sh
pnpm --filter @stencil-pm/core test
```

Expected baseline:

- plugin manifest is present
- skill stubs are present
- existing shell stubs are syntactically valid
- core tests remain green before adapter work begins

## Validation Standard To Add In This Epic

Epic 1 should leave the package with a repeatable local validation path such as:

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
pnpm --filter @stencil-pm/core test
```

Recommended package-local test coverage:

- manifest references only existing skill directories
- every documented command appears in router help and direct skills
- `/stencil` routes canonical subcommands and aliases correctly
- unknown commands fail with the expected adapter response
- inline `key=value` tokens pass through unchanged
- the current “bridge unavailable” failure shape is explicit and stable until Epic 2 replaces it

## Recommended Files To Change

Expected updates:

- `packages/claude-code-plugin/.claude-plugin/plugin.json`
- `packages/claude-code-plugin/package.json`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/skills/stencil/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/scripts/*.sh`

Recommended new files:

- `packages/claude-code-plugin/scripts/lib/common.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/scripts/lib/args.sh`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/fixtures/*.json`

Exact filenames may vary, but the implementation should preserve these separations:

- skill instructions
- shared shell transport helpers
- per-command shell entry points
- package-local routing and contract tests

## Implementation Sequence

## Step 1 — Normalize The Claude Command Surface

**Objective:** resolve the current mismatch between repo docs and product docs before behavior is added.

**Files to change:**

- `packages/claude-code-plugin/.claude-plugin/plugin.json`
- `packages/claude-code-plugin/README.md`
- all skill frontmatter blocks under `packages/claude-code-plugin/skills/`

**Actions:**

1. Choose the canonical external command names from the epic and PRD:
   - `/stencil`
   - `/stencilinit`
   - `/stencilcreate`
   - `/stencillist`
   - `/stencilshow`
   - `/stencilrun`
   - `/stencildelete`
2. Update README and skill descriptions so they consistently use that vocabulary.
3. Decide whether internal skill directory names will also be renamed now or only mapped through metadata.
4. If directories remain hyphenated internally, document that this is an implementation detail and not part of the public command contract.
5. Add package metadata and scripts needed for later validation work in this epic.

**Validation:**

```bash
rg -n "/stencil-" packages/claude-code-plugin
rg -n "/stencil(init|create|list|show|run|delete)\\b" packages/claude-code-plugin
```

**Completion gate:** the package describes one command surface only, with no public hyphenated-vs-unhyphenated ambiguity.

---

## Step 2 — Lock The Routing And Argument Contract

**Objective:** define exactly what the adapter accepts and which layer owns each responsibility.

**Files to change:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/skills/stencil/SKILL.md`

**Recommended files to add:**

- `packages/claude-code-plugin/scripts/lib/args.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`

**Actions:**

1. Define the router grammar for `/stencil`:
   - `/stencil`
   - `/stencil help`
   - `/stencil <subcommand>`
   - `/stencil <subcommand> <template-name> [key=value ...]`
2. Define the direct command grammar:
   - `/stencilinit`
   - `/stencilcreate <name>`
   - `/stencilshow <name>`
   - `/stencilrun <name> [key=value ...]`
   - `/stencillist`
   - `/stencildelete <name>`
3. Lock argument rules:
   - first positional token after the command is the template name when that command requires one
   - remaining tokens in `run` are literal inline `key=value` inputs
   - the adapter does not parse or coerce values beyond splitting on the first `=`
   - missing required positional values are detected in the adapter before shell bridge invocation
4. Lock boundary ownership explicitly:
   - skill files own user-facing guidance and routing instructions
   - shell helpers own transport normalization and process invocation
   - Node/core bridge owns real Stencil operations and structured domain output
5. Define the temporary Epic 1 failure contract for unimplemented bridge execution so all commands fail the same way until Epic 2 replaces it.

**Validation:**

```bash
rg -n "key=value|template name|bridge" packages/claude-code-plugin/README.md packages/claude-code-plugin/skills/stencil/SKILL.md
```

**Completion gate:** one explicit adapter contract exists for command names, arguments, and layer ownership.

---

## Step 3 — Implement The Shared Shell Transport Foundation

**Objective:** replace ad hoc per-script stubs with one reusable shell transport layer.

**Files to change:**

- `packages/claude-code-plugin/scripts/detect-context.sh`
- `packages/claude-code-plugin/scripts/resolve-template.sh`
- `packages/claude-code-plugin/scripts/validate-template.sh`

**Files to add:**

- `packages/claude-code-plugin/scripts/lib/common.sh`
- `packages/claude-code-plugin/scripts/lib/args.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/scripts/stencil-command.sh`

**Actions:**

1. Add shared shell helpers for:
   - strict mode
   - package-root resolution
   - common error formatting
   - argument parsing utilities
2. Introduce one common shell entry path that all command-specific scripts can delegate to.
3. Standardize transport behavior:
   - success output goes to stdout
   - transport failures go to stderr with non-zero exit status
   - domain output is reserved for future structured JSON from the Node bridge
4. Implement the temporary Epic 1 bridge stub in one place only.
5. Keep existing script names as compatibility shims if that lowers churn, but route them through the shared transport layer rather than leaving them as isolated stubs.

**Validation:**

```bash
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

**Completion gate:** every command script uses shared transport helpers instead of custom one-off shell logic.

---

## Step 4 — Deliver The `/stencil` Router Help And Dispatch Flow

**Objective:** make the main router skill behave predictably even before business logic exists.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil/SKILL.md`

**Recommended files to add:**

- `packages/claude-code-plugin/test/fixtures/router-help.txt`

**Actions:**

1. Replace the TODO router text with concrete instructions for:
   - showing help when invoked with no subcommand
   - showing help for `help`
   - routing supported subcommands only
   - rejecting unknown subcommands with a short corrective message
2. Keep help output focused on the first-wave commands:
   - `init`
   - `create`
   - `show`
   - `run`
   - plus `list` and `delete` as part of the supported vocabulary
3. Make the router send users to the direct command or shared transport path rather than embedding business behavior in the skill text.
4. Ensure the help text describes the exact inline argument pattern for `run`.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** `/stencil`, `/stencil help`, and `/stencil <unknown>` have stable, test-backed behavior.

**Real command flow delivered at the end of this step:**

1. User invokes `/stencil`.
2. Claude shows the canonical Stencil help text.
3. User invokes `/stencil run review-checklist component=AuthService`.
4. Claude routes using the shared contract instead of a TODO stub.

---

## Step 5 — Deliver Direct Command Routing For `init` And `show`

**Objective:** establish the first direct-command vertical slices on the safer, simpler command shapes.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`

**Actions:**

1. Replace both TODO skill files with concrete invocation instructions tied to the shared transport contract.
2. For `init`, define a zero-argument route with clear handling for accidental extra tokens.
3. For `show`, define a required template name positional argument with adapter-side missing-argument handling.
4. Ensure both direct commands match `/stencil init` and `/stencil show <name>` exactly.
5. Use the shared temporary bridge failure until Epic 2 provides a real CLI bridge.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** `init` and `show` work as direct commands and through the router with identical argument expectations.

**Real command flows delivered at the end of this step:**

1. `/stencilinit`
2. `/stencilshow review-checklist`
3. `/stencil show review-checklist`

Each flow reaches the same validated routing path and produces either a stable transport handoff or the explicit temporary bridge-unavailable response.

---

## Step 6 — Deliver Direct Command Routing For `create` And `run`

**Objective:** finish the first-wave happy path commands named in the planning notes.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`

**Actions:**

1. Replace both TODO skill files with concrete command-routing behavior.
2. For `create`, require the template name positional argument and reject missing names before any transport invocation.
3. For `run`, require the template name positional argument and preserve all remaining `key=value` tokens in order.
4. Ensure `run` does not attempt placeholder prompting in Epic 1. It only validates and forwards the routing contract.
5. Confirm parity between:
   - `/stencilcreate <name>` and `/stencil create <name>`
   - `/stencilrun <name> [key=value ...]` and `/stencil run <name> [key=value ...]`
6. Keep inline args literal. Do not embed Claude-specific placeholder resolution shortcuts in the skill layer.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** the first-wave command set from the planning notes has stable direct-command and router parity.

**Real command flows delivered at the end of this step:**

1. `/stencilcreate migration-plan`
2. `/stencilshow migration-plan`
3. `/stencilrun migration-plan module=payments language=typescript`
4. `/stencil init`

These are still routing-contract flows, not full business flows. That limitation must remain explicit.

---

## Step 7 — Align `list` And Reserve `delete` Without Pulling Later Scope Forward

**Objective:** finish the stable command vocabulary without accidentally implementing later-phase management UX.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Add `list` to the same validated routing contract as the first-wave commands.
2. Keep `delete` present in help and direct command routing, but do not invent confirmation semantics or file deletion behavior in this epic.
3. Make the README explicit that `delete` command structure is stabilized here while destructive behavior is delivered in the later deletion epic.
4. Verify that all six direct commands and all `/stencil <subcommand>` routes are documented in one place.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** the full MVP command vocabulary is stable, even though later epics still own real `list`/`delete` behavior details.

---

## Step 8 — Add Routing Smoke Coverage And Final Acceptance Pass

**Objective:** leave Epic 1 shippable as a foundation, not just as edited markdown and shell stubs.

**Files to add:**

- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/fixtures/*.json`

**Files to change:**

- `packages/claude-code-plugin/package.json`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Add a package-local test runner, preferably with plain `node --test`, so the adapter can be validated without introducing unnecessary framework weight.
2. Add smoke tests covering:
   - manifest-to-skill consistency
   - canonical command names in docs and skills
   - router help coverage
   - required positional argument checks
   - `run` inline arg forwarding
   - shared temporary bridge failure shape
3. Add a concise README section that explains what Epic 1 now guarantees and what still waits for Epic 2.
4. Run the full final validation pass.

**Final validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

**Completion gate:** Epic 1 leaves behind a stable, testable routing shell with explicit limits, ready for Epic 2 to supply the real CLI/JSON bridge.

## Handoff To Epic 2

Epic 2 should start from this exact contract:

- canonical command surface is already locked
- router and direct skills already agree on arguments
- shell transport is centralized
- temporary bridge-unavailable behavior is already test-backed

Epic 2 should replace only the transport target, not redesign:

- command names
- skill layout
- user-facing help grammar
- inline `key=value` rules
- shell ownership boundaries

That is the main success criterion for Epic 1: later work should plug into this shell instead of reopening it.
