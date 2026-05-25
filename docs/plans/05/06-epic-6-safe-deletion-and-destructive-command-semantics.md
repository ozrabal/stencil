# Plan: Epic 6 — Safe Deletion And Destructive Command Semantics

**Goal:** turn `/stencildelete <name>` into a safe, explicit Claude Code flow that confirms intent before mutation, keeps destructive behavior in the adapter UX, and delegates actual file deletion to the existing core bridge with precise project-local semantics.

**Primary source documents:**

- `docs/epics/05-claude-code-adapter-mvp-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Primary repo inputs:**

- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/core/src/stencil.ts`
- `packages/core/src/storage.ts`
- `packages/core/src/cli.ts`
- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/errors.ts`
- `packages/core/test/cli.test.ts`
- `packages/core/test/storage.test.ts`
- `packages/core/test/stencil.test.ts`

## Scope Boundary

This plan covers Epic 6 only:

- the public `/stencildelete <name>` flow
- explicit confirmation before mutation
- clear user-visible outcomes for:
  - successful deletion
  - missing template
  - cancellation
  - permission or filesystem failures
- project-local deletion semantics for the Claude Code MVP
- automated and manual validation that destructive behavior is explicit and predictable

Keep these out of scope here:

- bulk deletion
- rename, edit, copy, or restore workflows
- global template deletion UX
- collection management features outside what is already implied by template location
- shell-script business logic that duplicates template lookup or mutation logic owned by core

## Baseline Verified Before Planning

Verified locally in the current repo:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
pnpm --filter @stencil-pm/claude-code-plugin test
```

Current baseline behavior:

- `@stencil-pm/core` tests pass: `334` tests green.
- Claude adapter shell lint passes.
- Claude adapter tests pass: `14` tests green.
- the real bridge already supports `delete` through the shared transport and returns handled JSON on stdout.
- public Claude adapter commands invoke core with `--project-only`, including `delete`, so MVP delete scope is already limited to the current project's `.stencil/` tree.
- `Stencil.delete(name)` currently delegates directly to storage and returns `boolean`.
- `LocalStorageProvider.deleteTemplate(name)` currently:
  - returns `false` when the project-local template file is not found
  - throws `StorageOperationError` on filesystem deletion failure
- the current delete skill is still an Epic 1 placeholder and explicitly says not to add confirmation prompts yet.
- bridge smoke currently proves raw delete transport works, but it does not yet prove the Claude-side confirmation, cancellation, or destructive messaging contract.

## Repo Facts That Must Shape The Plan

- Epic 2 is already implemented. Epic 6 is not about inventing a new CLI bridge.
- public Claude adapter deletion is already project-only because `packages/claude-code-plugin/scripts/lib/bridge.sh` passes `--project-only` for `delete`.
- the architecture assigns conversational prompting to the Claude adapter, not to core.
- the shell layer is already thin and should stay thin.
- the current core delete contract is intentionally minimal:
  - `deleted: true` means a project-local template file was removed
  - `deleted: false` means no project-local template with that name was found
- because public commands are project-only, a global-only template should be presented as "not found in this project", not as a deletable target.
- the safest MVP delete UX can reuse existing read-path behavior:
  - inspect the target first through `show`
  - ask for explicit confirmation
  - then call `delete`
- the planning notes require thin vertical slices that end in real command flows, so each implementation step should finish in a working `/stencildelete` flow, not only in docs or transport edits.

## Planning Decisions To Lock Before Editing

### 1. Keep confirmation in the Claude skill layer

Core owns:

- template lookup
- project-local visibility rules
- deletion
- structured error output

Claude adapter owns:

- warning language
- confirmation wording
- cancellation handling
- success and failure presentation

Shell scripts may only:

- validate command shape
- invoke `show` and `delete` through the shared bridge
- propagate stdout, stderr, and exit codes

### 2. Confirm before mutation by reusing existing target inspection

Recommended MVP contract:

1. `/stencildelete <name>` first resolves the target through the existing `show` transport.
2. If the target exists, Claude presents a concise delete preview:
   - template name
   - description
   - collection if present
   - file path or project-local location
3. Claude asks for explicit confirmation.
4. Only after confirmation does Claude invoke the existing `delete` bridge command.

This avoids silent destructive behavior and avoids teaching the shell layer to inspect files itself.

### 3. Treat `deleted: false` as a first-class user outcome

Do not hide the current core contract behind vague messaging.

Recommended MVP meaning:

- if pre-delete `show` reports not found, stop before asking for confirmation
- if delete returns `deleted: false` after confirmation, present it as a handled "template no longer exists in this project" outcome

That covers races cleanly without requiring immediate core API changes.

### 4. Keep delete semantics project-local and precise

For Epic 6, `/stencildelete` should mean:

- delete one project-local template by exact name
- do not search or mutate `~/.stencil`
- do not infer collection-wide effects
- do not delete multiple templates

If a future global-template UX is added, it should be a separate command contract.

### 5. Prefer targeted contract hardening over broad core redesign

The current delete envelope may already be sufficient.

Only extend core if a real adapter need appears, for example:

- the adapter cannot distinguish a race after confirmation from another handled outcome
- the error envelope lacks data needed for user-facing deletion messages

Do not redesign delete around adapter-only concerns unless tests prove the current contract is inadequate.

### 6. Keep the first delete slice attached to the shipped happy-path wave

The first Epic 6 slice should prove this real command chain:

1. `/stencilinit`
2. `/stencilcreate <name>`
3. `/stencilshow <name>`
4. `/stencildelete <name>`

That stays aligned with the planning note to build on real `init/create/show/run` command flows rather than isolated destructive transport.

## Desired Outcome After Epic 6

At the end of this epic:

- `/stencildelete <name>` never deletes implicitly on first contact
- users can see exactly what they are about to delete
- cancellation is explicit and clean
- missing-template outcomes are unambiguous
- permission and filesystem failures surface as handled adapter errors rather than raw shell behavior
- delete remains a thin adapter flow over the existing core bridge, not a second mutation implementation

## Recommended Files To Change

Expected Claude adapter updates:

- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`

Possible core changes, only if the current delete contract proves insufficient:

- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/stencil.ts`
- `packages/core/src/storage.ts`
- `packages/core/test/cli.test.ts`
- `packages/core/test/storage.test.ts`
- `packages/core/test/stencil.test.ts`

Do not move confirmation or destructive intent checks into shell scripts.

## Implementation Sequence

## Step 1 — Freeze The Public Delete Contract Before Changing Behavior

**Objective:** replace the Epic 1 placeholder delete skill with one explicit Epic 6 contract for preview, confirmation, cancellation, and mutation timing.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`

**Actions:**

1. Lock the public command shape to `/stencildelete <name>`.
2. Document the delete flow in order:
   - validate command shape
   - inspect the template through the existing `show` path
   - if found, present a concise delete preview
   - ask for explicit confirmation
   - only on confirmation call the shared `delete` transport
3. Document the minimum destructive preview fields:
   - name
   - description
   - collection when present
   - project-local file path or clear project-local location text
4. Lock that cancellation ends the flow without invoking delete.
5. Lock that delete remains project-only for the MVP.
6. Remove or replace the current delete skill line that says not to add confirmation prompts in Epic 1.

**Validation:**

```bash
rg -n "confirmation|cancel|project-only|show|delete preview" \
  packages/claude-code-plugin/skills/stencil-delete/SKILL.md \
  packages/claude-code-plugin/README.md \
  packages/claude-code-plugin/docs/testing-in-claude.md
```

**Completion gate:** there is one unambiguous public delete contract and it clearly states that mutation happens only after confirmation.

---

## Step 2 — Characterize And Lock The Current Delete Bridge Semantics

**Objective:** prove exactly what the existing core and CLI already guarantee so the adapter can build on those semantics without guesswork.

**Files to change:**

- `packages/core/test/cli.test.ts`
- `packages/core/test/stencil.test.ts`
- `packages/core/test/storage.test.ts`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Add or tighten characterization tests for current delete behavior:
   - deleting an existing project-local template returns `status=ok` with `deleted: true`
   - deleting a missing project-local template returns `status=ok` with `deleted: false`
   - deleting remains project-only under the public bridge
2. Add a test proving that a global-only template is not deletable through the public Claude bridge:
   - create a global template in `HOME/.stencil`
   - invoke the public delete bridge from a project workspace
   - assert the adapter-visible result is equivalent to "not found in this project"
3. Add or confirm a storage/core test for delete failure mapping:
   - deletion failure becomes `StorageOperationError`
   - CLI surfaces it as `status=error`
   - the error code stays specific to storage deletion rather than generic runtime failure
4. Only if the current tests show a contract gap, extend the delete envelope with the smallest missing field needed by the adapter.
5. Do not compensate for missing contract details in `stencil-command.sh` or `bridge.sh`.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
node --test packages/claude-code-plugin/test/bridge-smoke.test.mjs
```

**Completion gate:** the delete behavior the adapter will rely on is test-backed and explicit.

---

## Step 3 — Ship The Confirmed Happy Path For A Real Template

**Objective:** land the thinnest complete destructive slice by making deletion safe for the common success case.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`

**Actions:**

1. Implement the Claude-side happy path for an existing project-local template:
   - inspect the template first
   - show the delete preview
   - ask for an explicit yes/no style confirmation
   - invoke delete only on confirmation
2. Keep the confirmation wording short and destructive:
   - make it obvious that the template file will be removed from `.stencil/`
   - do not bury the destructive action inside general prose
3. Define the success message after deletion:
   - confirm that the template was deleted
   - include the template name
   - avoid ambiguous wording like "processed" or "updated"
4. Update README and manual docs so the canonical delete walkthrough uses the real happy path:
   - `/stencilinit`
   - `/stencilcreate review-checklist`
   - `/stencilshow review-checklist`
   - `/stencildelete review-checklist`
5. Add contract-level test coverage that the delete skill text now includes:
   - a preview step
   - explicit confirmation language
   - post-confirmation delete invocation

**Validation:**

Manual happy path:

```text
/stencilinit
/stencilcreate review-checklist
/stencilshow review-checklist
/stencildelete review-checklist
```

Recommended automated validation:

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** a user can safely delete one known template through an explicit confirm-then-delete flow.

---

## Step 4 — Add Clean Cancellation And Missing-Template Outcomes

**Objective:** make `/stencildelete` predictable when the user backs out or the target is absent.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Define the cancellation branch explicitly:
   - if the user declines confirmation, stop
   - do not invoke delete
   - report that deletion was cancelled
2. Define the pre-confirmation missing-template branch:
   - if the initial `show` path returns not found, stop immediately
   - tell the user the template was not found in the current project
3. Define the post-confirmation race branch:
   - if delete returns `deleted: false`, present that the template no longer exists in this project
   - do not pretend deletion succeeded
4. Keep the wording aligned with project-only semantics:
   - avoid mentioning global templates in the public flow
   - do not imply Claude searched outside the project
5. Extend test and manual docs to cover:
   - cancel at confirmation
   - delete a name that never existed
   - delete the same template twice

**Validation:**

Manual cancellation flow:

```text
/stencildelete review-checklist
```

Expected manual result:

- Claude shows the target preview
- user declines
- Claude reports cancellation
- `/stencilshow review-checklist` still works afterward

Manual missing-template flow:

```text
/stencildelete does-not-exist
```

Automated validation:

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** cancellation and missing-template behavior are explicit enough that users never have to infer whether a destructive action happened.

---

## Step 5 — Harden Permission And Filesystem Failure Presentation

**Objective:** make destructive failures safe and understandable when the adapter cannot remove the target file.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/core/test/cli.test.ts`
- `packages/core/test/storage.test.ts`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Lock the adapter response for handled storage deletion failures:
   - explain that the template could not be deleted
   - distinguish this from cancellation and not-found
   - surface actionable context when available from the error payload
2. Decide the minimum error detail the user should see:
   - template name
   - that the failure occurred during delete
   - a concise filesystem/permission explanation if present
3. Add or extend automated coverage for storage delete failures.
4. Prefer stable tests:
   - if a real filesystem permission simulation is reliable in `storage.test.ts`, use it there
   - otherwise characterize the CLI envelope using a controlled test double or targeted unit path
5. Keep shell behavior unchanged:
   - handled domain failures should still come back as JSON on stdout
   - do not move this branch into stderr parsing

**Validation:**

Preferred validation set:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
```

Optional manual validation if a reproducible local permission setup is available:

1. create a template
2. make the containing directory non-deletable
3. run `/stencildelete <name>`
4. verify Claude reports a delete failure rather than success or cancellation

**Completion gate:** destructive filesystem failures are safely surfaced as a distinct, handled outcome.

---

## Step 6 — Final Acceptance Pass And Documentation Hardening

**Objective:** make the delete flow shippable by documenting the final behavior and protecting the public contract with repeatable checks.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-delete/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`

**Actions:**

1. Finalize the canonical delete walkthrough in the docs.
2. Add a dedicated manual acceptance section for delete covering:
   - success
   - cancellation
   - missing template
   - repeat delete after success
3. Add light routing-contract assertions for delete where they protect real public behavior:
   - command shape
   - preview-before-delete language
   - explicit confirmation language
   - cancellation branch language
4. Keep the contract checks focused on public semantics, not implementation phrasing.
5. Run the full Epic 6 acceptance path from a clean workspace.

**Validation:**

Preferred validation set after Epic 6 lands:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
pnpm --filter @stencil-pm/claude-code-plugin test
```

Manual acceptance walkthrough:

1. `/stencilinit`
2. `/stencilcreate review-checklist`
3. `/stencilshow review-checklist`
4. `/stencildelete review-checklist`
5. confirm deletion
6. verify `/stencilshow review-checklist` now reports missing
7. recreate the template
8. run `/stencildelete review-checklist` again
9. cancel at confirmation
10. verify `/stencilshow review-checklist` still succeeds
11. run `/stencildelete does-not-exist`
12. verify Claude reports the template is not found in the current project

**Completion gate:** the delete flow is documented, reproducible, and protected by bridge-level and contract-level validation.
