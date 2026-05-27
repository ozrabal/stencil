# Plan: Epic 7 — Claude Code Error Presentation, Smoke Coverage, And MVP Hardening

**Goal:** finish the Claude Code adapter as a shippable MVP by standardizing user-facing failure presentation, expanding adapter-specific smoke coverage around the real bridge, and locking one final local acceptance path for the supported Claude Code flows.

**Primary source documents:**

- `docs/epics/05-claude-code-adapter-mvp-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Primary repo inputs:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/skills/stencil/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/common.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/errors.ts`
- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`

## Scope Boundary

This plan covers Epic 7 only:

- consistent Claude-facing presentation for:
  - typed core errors
  - validation failures
  - empty-state results
  - user cancellations
  - shell and CLI runtime failures
- smoke verification for:
  - skill routing assumptions that matter to the shipped flows
  - script invocation through the shared bridge
  - JSON envelope shape and status handling
  - the MVP command flows that already exist in the adapter package
- local validation and manual acceptance documentation for the Claude Code MVP
- explicit verification that the MVP stays offline-first and respects filesystem permission failures cleanly

Keep these out of scope here:

- new Phase 2 product features
- new template language features
- broad redesign of the CLI envelope where the current contract is already sufficient
- hiding adapter gaps inside shell logic
- generalized cross-adapter end-to-end automation

## Baseline Verified Before Planning

Verified locally in the current repo:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
pnpm --filter @stencil-pm/claude-code-plugin test
```

Current baseline behavior:

- `@stencil-pm/core` tests pass: `338` tests green.
- Claude adapter shell lint passes.
- Claude adapter tests pass: `17` tests green.
- unlike the original Epic 7 write-up, the repo already has real adapter smoke coverage and a real CLI bridge.
- current plugin smoke already verifies:
  - `init -> list -> show -> create -> run -> validate -> delete` across the real shell bridge
  - project-only behavior for `list`, `show`, and `delete`
  - handled delete filesystem failures
  - `validate` returning `status=validation_failed`
  - `show` surfacing validation warnings without converting them into errors
  - `run` provenance for context and default resolution
  - internal `detect-context` availability
- current routing tests already verify:
  - manifest-to-skill alignment
  - canonical command names
  - run and delete skill contract language
  - router help alignment
  - malformed public invocations failing before bridge invocation

That means Epic 7 should not be planned as “build smoke coverage from zero.” It should be planned as a final hardening pass over an already functional adapter.

## Repo Facts That Must Shape The Plan

- The architecture keeps presentation and conversational behavior in the Claude adapter, not in core.
- The shell layer is already correctly thin:
  - argument validation and routing in `stencil-command.sh`
  - CLI discovery and invocation in `scripts/lib/bridge.sh`
  - shared stderr and exit helpers in `scripts/lib/common.sh`
- The current public bridge policy is already meaningful and should be preserved:
  - handled core outcomes return JSON on stdout with exit `0`
  - malformed adapter invocation returns stderr with exit `64`
  - bridge runtime failures return stderr with exit `70`
- The bridge already exposes a deterministic runtime-failure seam through `STENCIL_CORE_CLI_PATH`.
- The current CLI envelope already distinguishes the main handled outcomes the adapter needs:
  - `ok`
  - `needs_input`
  - `validation_failed`
  - `error`
- The planning notes require thin vertical slices that end in real Claude Code command flows. Epic 7 should therefore harden shipped flows like:
  - `/stencilinit`
  - `/stencilcreate`
  - `/stencilshow`
  - `/stencilrun`
  - `/stencildelete`
    instead of creating abstract test-only work detached from actual commands.
- The PRD requires offline-first behavior and clear actionable errors.
- The architecture requires the adapter to consume structured JSON, not plain-text scraping.

## Planning Decisions To Lock Before Editing

### 1. Do not reopen the core/adapter boundary

Core owns:

- error codes and details
- validation issue structures
- template discovery and project-only semantics
- JSON envelope shape

Claude adapter owns:

- how handled outcomes are explained to the user
- what next-step command to suggest
- cancellation wording
- destructive wording
- final manual acceptance guidance

Shell scripts may only:

- validate public command shape
- resolve the CLI path
- invoke the CLI
- propagate stdout, stderr, and exit codes

### 2. Treat Epic 7 as a consistency pass, not a feature epic

The repo already implements the MVP flows. Epic 7 should tighten:

- presentation consistency
- negative-path coverage
- release confidence

It should avoid inventing new product semantics unless a real hardening gap forces a minimal contract extension.

### 3. Prefer contract tests for presentation rules and smoke tests for transport rules

Use:

- routing and documentation tests for “what the skill promises”
- real bridge smoke for “what the scripts and CLI actually do”

Do not try to test every user-facing sentence end to end through shell output because the shell intentionally returns machine-readable JSON, not Claude phrasing.

### 4. Keep empty-state messaging honest

The adapter should not infer facts the CLI does not return.

For example:

- `list` can reliably say “no project templates were found”
- `list` should not pretend it can always distinguish “not initialized” from “initialized but empty” unless the CLI explicitly returns that state

If precise empty-state differentiation is truly needed, add the smallest possible core/CLI field and test it explicitly. Do not backfill this through manual filesystem inspection in the skill.

### 5. Make runtime-failure coverage deterministic

Use the existing `STENCIL_CORE_CLI_PATH` override to prove bridge runtime failures cleanly instead of relying on brittle environment mutation or ad hoc script edits.

### 6. Keep the final hardening path anchored to real MVP flows

The final acceptance wave for Epic 7 should still center on:

1. `/stencilinit`
2. `/stencilcreate <name>`
3. `/stencilshow <name>`
4. `/stencilrun <name>`
5. `/stencildelete <name>`

Supplement that with explicit failure and cancellation checks instead of replacing it with isolated unit work.

## Desired Outcome After Epic 7

At the end of this epic:

- every public Claude Code MVP command has a clear, documented handled-outcome contract
- users never have to infer what happened from raw JSON or raw shell failure text when a handled core outcome exists
- adapter tests cover the remaining meaningful failure classes, not only the happy path
- bridge runtime failures are explicitly separated from handled domain failures
- local validation steps and manual Claude acceptance steps are documented enough to support shipment
- the Claude Code MVP is hardened without pushing business logic into shell scripts

## Recommended Files To Change

Expected Claude adapter updates:

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

Possible core changes, only if the current envelope proves insufficient:

- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`

Do not add business logic to:

- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`

unless a change is strictly about transport failure handling or testability.

## Implementation Sequence

## Step 1 — Freeze One Shared MVP Hardening Contract

**Objective:** write one authoritative adapter-facing hardening contract before adding more tests so later changes do not drift command by command.

**Files to change:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`

**Actions:**

1. Add one “handled outcomes” section that defines the adapter-wide meaning of:
   - `status=ok`
   - `status=needs_input`
   - `status=validation_failed`
   - `status=error`
   - malformed invocation exit `64`
   - bridge runtime failure exit `70`
2. Lock the presentation invariant that skills should:
   - trust the JSON envelope
   - avoid manual filesystem inspection except where the command contract already requires a second command call such as delete preview via `show`
   - avoid printing raw JSON
   - avoid exposing shell internals unless the failure is genuinely a transport/runtime failure
3. Add one short command-to-outcome matrix for:
   - `init`
   - `list`
   - `show`
   - `create`
   - `run`
   - `delete`
4. State which command outcomes are handled in Claude conversation versus terminal-style transport failures.
5. Add one explicit release gate listing the validation commands required before shipment.

**Validation:**

```bash
rg -n "handled outcomes|exit `64`|exit `70`|status=ok|status=validation_failed|status=error" \
  packages/claude-code-plugin/README.md \
  packages/claude-code-plugin/docs/testing-in-claude.md
```

**Completion gate:** there is one authoritative hardening contract that every later step can implement and test against.

---

## Step 2 — Standardize Read-Path Presentation For `init`, `list`, And `show`

**Objective:** make the read-oriented commands consistent about empty state, warnings, not-found behavior, and next-step guidance.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-init/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-list/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Ensure `stencil-init` distinguishes only states the bridge actually returns:
   - first bootstrap
   - already initialized
   - handled error
2. Tighten `stencil-list` empty-state language so it stays honest with the current envelope:
   - say no project templates were found
   - suggest `/stencilinit` and `/stencilcreate <name>` without pretending the adapter knows more than it does
3. Lock `stencil-show` presentation rules for:
   - success
   - warnings-only validation issues
   - handled template-not-found and related errors
4. Standardize next-step suggestions:
   - `init` points to `list`, `show`, `run`, and `create`
   - `list` points to `create` and `init`
   - `show` points back to `list` or onward to `run`
5. Ensure these skills explicitly avoid revalidating or reinterpreting core warning/error semantics.

**Validation:**

```bash
rg -n "already initialized|no project templates were found|validation warnings|/stencillist|/stencilcreate|/stencilrun" \
  packages/claude-code-plugin/skills/stencil-init/SKILL.md \
  packages/claude-code-plugin/skills/stencil-list/SKILL.md \
  packages/claude-code-plugin/skills/stencil-show/SKILL.md
```

**Completion gate:** `init -> list -> show` has one consistent read-path presentation contract with no hidden filesystem inference.

---

## Step 3 — Standardize Interactive And Destructive Presentation For `create`, `run`, And `delete`

**Objective:** make create, run, and delete handle correction, cancellation, not-found, and destructive outcomes in one consistent adapter voice.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. In `stencil-create`, lock:
   - cancellation before save means no write
   - `validation_failed` means the template draft is correctable
   - `status=error` means a handled conflict or storage failure
   - success points to `show` and `run`
2. In `stencil-run`, lock:
   - only unresolved required inputs are asked
   - cancellation during input collection stops the loop
   - declining final execution confirmation stops cleanly
   - handled validation failures and handled template-not-found errors are surfaced without raw JSON
3. In `stencil-delete`, lock:
   - preview before mutation
   - explicit confirmation before delete
   - cancellation with no mutation
   - `deleted: false` as a first-class “no longer exists in this project” outcome
   - handled storage failure presentation
4. Make sure all three skills explicitly distinguish:
   - correctable template problems
   - handled domain failures
   - runtime bridge failures outside the JSON envelope

**Validation:**

```bash
rg -n "validation_failed|correctable|cancel|explicit confirmation|deleted: false|status=error|template was not found" \
  packages/claude-code-plugin/skills/stencil-create/SKILL.md \
  packages/claude-code-plugin/skills/stencil-run/SKILL.md \
  packages/claude-code-plugin/skills/stencil-delete/SKILL.md
```

**Completion gate:** `create -> run -> delete` follows one consistent correction, cancellation, and destructive-action contract.

---

## Step 4 — Turn The Documentation Contract Into Routing-Contract Assertions

**Objective:** stop presentation regressions by promoting the hardening rules from prose into targeted package tests.

**Files to change:**

- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/fixtures/routing-contract.json` if needed

**Actions:**

1. Add assertions for the read-path skills:
   - `init` documents first-bootstrap and already-initialized behavior
   - `list` documents empty-state handling
   - `show` documents warning surfacing and handled errors
2. Add assertions for the interactive skills:
   - `create` documents cancellation and validation correction
   - `run` documents final execute-or-cancel behavior and handled failures
   - `delete` continues to document preview, confirmation, and cancellation
3. Add assertions that no skill reintroduces contradictory public command names or raw-shell guidance.
4. Keep these tests narrow and textual. They should verify the contract language, not simulate full Claude conversations.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** presentation-critical skill promises are now regression-tested alongside routing and manifest rules.

---

## Step 5 — Expand Bridge Smoke To Cover The Missing MVP Hardening Matrix

**Objective:** extend the real bridge smoke tests from “one working flow plus a few negatives” into a deliberate MVP hardening matrix.

**Files to change:**

- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Keep the current happy-path smoke as the anchor:
   - `init`
   - `list`
   - `show`
   - `create`
   - `run`
   - `validate`
   - `delete`
2. Add read-path edge cases through the real shell bridge:
   - `init` when the project is already initialized
   - `list` empty state in a project with no project-local templates
   - `show` for a missing template
3. Add create-path edge cases through the real shell bridge:
   - `create` returning `validation_failed` for invalid payloads
   - `create` returning handled conflict when the template already exists
4. Add run-path edge cases through the real shell bridge:
   - `run` for a missing template
   - `run` returning `validation_failed` for a broken template
   - `run` continuing to preserve `needs_input` semantics and provenance
5. Keep the tests focused on transport-visible truth:
   - command
   - status
   - error payload
   - key JSON fields needed by the skills

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** the adapter smoke suite explicitly covers the major handled outcomes for the shipped MVP commands, not only one nominal path.

---

## Step 6 — Add Deterministic Runtime-Failure And Filesystem-Failure Hardening

**Objective:** verify that bridge runtime failures and filesystem mutation failures stay clear, typed, and separate from handled domain outcomes.

**Files to change:**

- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- possibly `packages/core/test/cli.test.ts` if a missing detail in the error envelope is discovered

**Actions:**

1. Add a bridge runtime-failure test using the existing `STENCIL_CORE_CLI_PATH` override:
   - point it at a missing file
   - assert stderr failure text
   - assert exit `70`
   - assert no JSON stdout is produced
2. Add at least one deterministic create or init filesystem-failure case.
   Recommended approach:
   - use a path collision or unwritable target arrangement that reliably forces a storage/bootstrap failure
   - assert the bridge still returns a handled CLI error envelope when the failure occurs inside core
3. Keep the existing delete filesystem-failure case and align its assertions with the final error-presentation policy.
4. If needed, add one adapter-level assertion that malformed public invocation still fails before bridge execution with exit `64`.
5. Avoid brittle permission tests that depend on OS-specific chmod behavior when a deterministic path-collision fixture can prove the same error-handling boundary more reliably.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** exit `64`, exit `70`, and handled JSON failures are all separately tested and no longer easy to conflate.

---

## Step 7 — Lock Offline-First And Permission-Respecting Expectations In Docs And Tests

**Objective:** make the PRD non-functional constraints visible and verifiable at the adapter layer.

**Files to change:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs` or `bridge-smoke.test.mjs` if lightweight assertions are added

**Actions:**

1. Document that the Claude adapter:
   - depends only on local files and the bundled/core workspace CLI
   - does not require network access for MVP flows
   - should surface filesystem failures plainly when Claude Code permission settings or local filesystem conditions block mutation
2. Add one lightweight verification for offline-first assumptions.
   Recommended options:
   - a repo scan assertion that adapter scripts do not call network tools such as `curl` or `wget`
   - or a doc/test assertion that the public validation path does not include network prerequisites
3. Extend the manual testing doc with one explicit “failure environment” section covering:
   - a missing-template path
   - a validation-failure path
   - a bridge runtime-failure path
   - a local filesystem mutation failure path
4. Keep these checks adapter-focused. Do not turn Epic 7 into a general security audit.

**Validation:**

```bash
rg -n "offline|network|permission|filesystem failure|runtime failure" \
  packages/claude-code-plugin/README.md \
  packages/claude-code-plugin/docs/testing-in-claude.md
```

**Completion gate:** offline-first and permission-related MVP expectations are explicit and locally testable.

---

## Step 8 — Finish With One Final MVP Acceptance Pass

**Objective:** leave behind one repeatable acceptance routine that proves the adapter is ready to ship at the MVP boundary.

**Files to change:**

- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Update the manual Claude walkthrough so it covers:
   - bootstrap
   - create
   - show
   - run with inline values
   - run with missing-input completion
   - cancel before execution
   - delete with confirmation
   - delete cancellation
   - missing-template show or delete
   - at least one validation or runtime failure check
2. Add one local validation block with the exact commands to run before considering the package hardened:
   - `pnpm --filter @stencil-pm/core build`
   - `pnpm --filter @stencil-pm/core test`
   - `pnpm --filter @stencil-pm/claude-code-plugin lint`
   - `pnpm --filter @stencil-pm/claude-code-plugin test`
3. Re-run those commands after implementation and record any changed counts or new assertions in the final PR description or release notes.
4. Do one final contradiction pass across README, skill docs, and tests so the public contract is stated only once and repeated consistently.

**Validation:**

```bash
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** Epic 7 ends with a green local acceptance pass and a documented manual walkthrough that matches the shipped MVP.

## Final Acceptance Criteria

Epic 7 is complete when all of the following are true:

- every public Claude Code MVP command has explicit handled-outcome documentation
- routing-contract tests verify the critical presentation promises
- bridge smoke covers:
  - happy-path flow
  - missing-template behavior
  - validation-failure behavior
  - runtime bridge failure
  - filesystem mutation failure
- no new shell business logic was introduced to compensate for missing core or skill behavior
- local docs explain how to validate the MVP and how to manually exercise the public Claude flows

## Suggested Execution Order

Run the implementation in this order:

1. Step 1
2. Step 2
3. Step 3
4. Step 4
5. Step 5
6. Step 6
7. Step 7
8. Step 8

This keeps the work flowing from contract definition, to skill/document hardening, to automated verification, to final ship-readiness.
