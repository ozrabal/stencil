# Plan: Epic 5 — Run Template Execution And Conversational Input Completion

**Goal:** turn `/stencilrun <name> [key=value ...]` into the real Claude Code happy path by resolving templates through the existing core CLI bridge, collecting only missing inputs conversationally in the adapter, and handing the fully resolved prompt back into Claude Code as the next execution step.

**Primary source documents:**

- `docs/epics/05-claude-code-adapter-mvp-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Primary repo inputs:**

- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/resolve-template.sh`
- `packages/claude-code-plugin/scripts/detect-context.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/core/src/stencil.ts`
- `packages/core/src/resolver.ts`
- `packages/core/src/context.ts`
- `packages/core/src/types.ts`
- `packages/core/src/cli.ts`
- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`
- `packages/core/test/stencil.test.ts`

## Scope Boundary

This plan covers Epic 5 only:

- the public `/stencilrun <name> [key=value ...]` flow
- inline explicit value handling
- core-backed context and default resolution
- conversational follow-up for unresolved required inputs
- repeated resolve calls until the template is fully resolved or the user cancels
- clear user-facing provenance for explicit, context, default, and unresolved values
- the adapter-owned handoff from resolved template text into Claude Code execution
- automated and manual validation needed to keep the run contract stable

Keep these out of scope here:

- dry-run mode
- collection-aware run UX
- explicit edit-after-summary or override-all workflows
- search, edit, copy, or global template UX
- shell-script business logic that duplicates resolver or prompt semantics already owned by core or the Claude skill layer

## Baseline Verified Before Planning

Verified locally in the current repo:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
pnpm --filter @stencil-pm/claude-code-plugin test
```

Current baseline behavior:

- `@stencil-pm/core` tests pass.
- Claude adapter shell lint passes.
- the real bridge smoke flow already passes for `init -> list -> show -> create -> run -> validate -> delete`.
- `run` already delegates to the core `resolve` command and returns handled JSON envelopes:
  - `status=ok` when fully resolved
  - `status=needs_input` when unresolved values remain
  - `status=validation_failed` for handled validation failures
  - `status=error` for handled typed domain failures
- `ResolutionResult` already includes enough adapter-facing data to drive prompting without shell logic:
  - `resolvedBody`
  - `placeholders`
  - `inputs`
  - `unresolvedCount`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md` is still transport-only and explicitly says not to prompt for placeholders.
- `packages/claude-code-plugin` is not fully green today for an unrelated routing-contract issue:
  - `test/routing-contract.test.mjs` fails because `.claude-plugin/plugin.json` does not expose the expected `skills` array
  - the Epic 5 plan should treat that as pre-existing baseline drift, not as a hidden requirement of the run flow itself

## Repo Facts That Must Shape The Plan

- Epic 2 is already implemented. Epic 5 is not about inventing a new bridge.
- Epic 4 already established the intended happy-path wave:
  - `/stencilinit`
  - `/stencilcreate`
  - `/stencilshow`
  - `/stencilrun`
- `packages/core/src/cli-runner.ts` already maps public adapter `run` to internal core command `resolve`.
- the current CLI contract is richer than the simplified JSON in `docs/stencil-architecture.md`; Epic 5 should build on the actual envelope in `packages/core/src/cli-contract.ts`, not regress to ad hoc JSON.
- `ResolutionResult.inputs` already carries prompt-relevant metadata such as:
  - `name`
  - `description`
  - `required`
  - `defaultValue`
  - `source`
  - `sources`
- context resolution already lives in core via `Stencil.resolve()` and registered providers. The adapter must not re-detect context values in skill text or shell.
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs` already proves:
  - unresolved run returns `status=needs_input`
  - fully explicit run returns `status=ok`
- the PRD and architecture both require the unresolved-input conversation to stay in the Claude adapter, not in core.
- the planning notes require thin vertical slices that end in real command flows, not isolated transport changes.

## Planning Decisions To Lock Before Editing

### 1. Keep the core/adapter boundary strict

Core owns:

- template loading
- validation
- context resolution
- placeholder normalization
- placeholder resolution
- structured CLI JSON

Claude adapter owns:

- conversational question wording
- deciding when to re-run `resolve`
- cancellation handling in the chat flow
- provenance presentation
- the final handoff from resolved text into Claude execution

Shell scripts may only:

- normalize invocation
- pass stdin and argv through
- propagate stdout, stderr, and exit codes

### 2. Use the existing resolve envelope as the prompting contract

For the Epic 5 MVP, the adapter should derive missing-input behavior from:

- `status=needs_input`
- `data.inputs`
- `data.placeholders`
- `data.unresolvedCount`

Do not add a second Claude-only unresolved-input format unless implementation proves the existing contract is insufficient.

### 3. Prompt only unresolved inputs

The run loop should not ask for values already satisfied by:

- explicit inline args
- `$ctx.*` context
- inline defaults
- frontmatter defaults

That keeps the adapter aligned with the resolver and avoids second-guessing core precedence.

### 4. Preserve normalized input order from core

When multiple inputs remain unresolved, ask for them in the order produced by the core normalization pipeline. Do not sort alphabetically in the adapter.

### 5. Keep the first run slice focused on the resolved happy path

The first implementation slice for Epic 5 should prove this real command chain:

1. `/stencilinit`
2. `/stencilcreate <name>`
3. `/stencilshow <name>`
4. `/stencilrun <name> key=value`

Only after that slice is stable should the conversational re-entry loop land.

### 6. Resolve the execution handoff ambiguity explicitly

The PRD leaves open whether `/stencilrun` should execute immediately or paste the resolved prompt for review first.

Recommended MVP lock:

- after full resolution, Claude shows a concise provenance summary plus the resolved prompt
- Claude asks for a simple final confirmation to continue
- on confirmation, Claude treats the resolved prompt as the next task instruction
- no editable summary, dry-run branch, or override workflow lands in Epic 5

This preserves the architecture’s “resolve then execute in conversation” contract without pulling in later-phase UX.

## Desired Outcome After Epic 5

At the end of this epic:

- `/stencilrun <name> [key=value ...]` is a real Claude conversation rather than a transport placeholder
- templates can resolve from a mix of:
  - inline explicit args
  - `$ctx.*` context values
  - inline defaults
  - frontmatter defaults
  - conversationally collected answers
- Claude only asks for values that remain unresolved after core resolution
- every conversational answer re-enters the same core `resolve` pipeline
- the user can understand where each final value came from
- a completed run hands the resolved prompt back into Claude Code in one explicit, documented execution flow

## Recommended Files To Change

Expected Claude adapter updates:

- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`

Possible core changes, only if the current resolve contract proves insufficient:

- `packages/core/src/types.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`
- `packages/core/test/stencil.test.ts`

Do not move missing-input sequencing, question phrasing, or provenance summarization into shell scripts.

## Implementation Sequence

## Step 1 — Freeze The Run MVP Contract Against The Current Bridge

**Objective:** replace ambiguity in the current run skill with one explicit Claude-side contract before editing behavior.

**Files to change:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`

**Actions:**

1. Lock the public command shape to `/stencilrun <name> [key=value ...]`.
2. Document the exact adapter flow:
   - validate command shape
   - invoke the shared `run` transport
   - inspect the returned JSON envelope
   - if `status=needs_input`, ask only unresolved questions
   - re-run `resolve` with accumulated explicit values
   - when fully resolved, show provenance and ask for final confirmation
   - on confirmation, continue with the resolved prompt as the next task
3. Lock that `detect-context` remains an internal helper, not a public slash command.
4. Lock that unresolved-input prompting lives in the skill layer, not in shell or core.
5. Document the minimum cancellation path:
   - user cancels during input collection
   - no further resolve call is made
   - no execution handoff happens

**Validation:**

```bash
rg -n "stencilrun|needs_input|confirmation|cancel|resolved prompt" \
  packages/claude-code-plugin/README.md \
  packages/claude-code-plugin/skills/stencil-run/SKILL.md \
  packages/claude-code-plugin/docs/testing-in-claude.md
```

**Completion gate:** there is one unambiguous public run contract and one explicit adapter/core boundary.

---

## Step 2 — Ship The Resolved Happy Path First

**Objective:** make `/stencilrun` correctly handle templates that already resolve from inline args, context, and defaults before adding conversational re-entry.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`

**Actions:**

1. Replace the current transport-only run skill instructions with handled-envelope behavior for:
   - `status=ok`
   - `status=validation_failed`
   - `status=error`
2. Define the Claude-facing output for a fully resolved run:
   - template name
   - concise placeholder provenance summary
   - resolved prompt block
   - final execute-or-cancel question
3. Keep the initial slice focused on templates that do not require conversational fill because all values are already available.
4. Update create success guidance so Epic 4 now points to the real run path rather than “prefer inline values because prompting is not implemented yet”.
5. Extend the manual Claude test script to include:
   - a template resolved entirely by inline args
   - a template resolved entirely by defaults/context

**Validation:**

Manual happy path:

```text
/stencilinit
/stencilcreate review-checklist
/stencilshow review-checklist
/stencilrun review-checklist component_name=AuthService
```

Automated validation:

```bash
pnpm --filter @stencil-pm/core test
node --test packages/claude-code-plugin/test/bridge-smoke.test.mjs
```

**Completion gate:** the adapter can already finish a real `init -> create -> show -> run` path when no conversational fill is needed.

---

## Step 3 — Characterize And Lock The Missing-Input Resolve Contract

**Objective:** prove that the current core resolve envelope is sufficient for adapter prompting, and only extend core if a real gap remains.

**Files to change:**

- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`
- `packages/core/test/stencil.test.ts`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Add characterization tests around `resolve` for these cases:
   - inline-only required input unresolved
   - legacy placeholder unresolved with frontmatter metadata
   - context-resolved value
   - inline default-resolved value
   - frontmatter default-resolved value
2. Assert that `status=needs_input` still carries enough data for the adapter to ask questions without opening template files manually:
   - `inputs` includes `name`, `required`, `source`, and description/default metadata where available
   - `placeholders` preserves provenance state
   - `unresolvedCount` matches the unresolved queue
3. Extend the bridge smoke test to assert the exact unresolved metadata the adapter will rely on.
4. Only if one of those assertions fails, add the missing field in core and flow it through:
   - `types.ts`
   - `cli-contract.ts`
   - `cli-runner.ts`
5. Do not work around missing metadata in the shell layer.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
node --test packages/claude-code-plugin/test/bridge-smoke.test.mjs
```

**Completion gate:** the adapter prompting contract is backed by tests instead of assumptions.

---

## Step 4 — Implement The Single-Input Conversational Re-Entry Slice

**Objective:** land the thinnest real conversational run flow by handling one unresolved input end to end through repeated `resolve` calls.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Define the first conversational slice around a template with exactly one unresolved input.
2. Update the run skill so that on `status=needs_input` it:
   - reads the unresolved input from `data.inputs`
   - asks one concise question using available description/default metadata
   - preserves already explicit values
   - re-invokes the same `run` transport with the newly answered `key=value`
3. Keep question phrasing adapter-owned:
   - use the saved description when present
   - otherwise fall back to the normalized input name
4. Define how to normalize a user answer into the explicit value set without inventing new placeholder semantics.
5. After the second resolve succeeds, use the same resolved-output handoff from Step 2.

**Validation:**

Manual Claude flow:

```text
/stencilinit
/stencilcreate ask-one
/stencilshow ask-one
/stencilrun ask-one
```

Recommended template body for the manual test:

```md
Review {{input:component_name}} in {{$ctx.project_name}}.
```

Bridge validation:

```bash
node --test packages/claude-code-plugin/test/bridge-smoke.test.mjs
```

**Completion gate:** one unresolved input can be collected conversationally and resolved through a second real bridge call.

---

## Step 5 — Expand To The Full Sequential Completion Loop

**Objective:** generalize the single-input slice into the full Epic 5 conversational fill loop for multiple unresolved values, provenance, and cancellation.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Extend the run skill from one unresolved input to repeated prompting until:
   - `unresolvedCount === 0`, or
   - the user cancels
2. Preserve answer accumulation across the loop by treating each conversational answer as one more explicit `key=value`.
3. Keep prompt order aligned with core-normalized `inputs`.
4. Make provenance visible after completion:
   - explicit values supplied up front
   - values collected conversationally
   - values supplied by context
   - values supplied by defaults
5. Add handled behavior for these run outcomes:
   - template not found
   - validation failure on resolve
   - unresolved values still remaining because the user declined to answer
   - cancellation before completion
6. Keep the user-facing wording short. The skill should not print raw JSON or expose shell details.

**Validation:**

Manual Claude flow with multiple values:

```text
/stencilcreate create-rest-endpoint
/stencilshow create-rest-endpoint
/stencilrun create-rest-endpoint entity_name=Invoice
```

Recommended manual expectations:

- Claude does not ask again for `entity_name`
- Claude does ask for the remaining unresolved input
- Claude does not ask for values already satisfied by defaults or `$ctx.*`
- the final provenance summary distinguishes explicit vs default vs context values

Automated validation:

```bash
pnpm --filter @stencil-pm/core test
node --test packages/claude-code-plugin/test/bridge-smoke.test.mjs
```

**Completion gate:** Epic 5’s real conversational completion loop works for multiple unresolved inputs without moving logic into shell.

---

## Step 6 — Harden The Execution Handoff, Docs, And Acceptance Coverage

**Objective:** make the run flow shippable by locking the final execute/cancel behavior and documenting a repeatable acceptance pass.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/docs/testing-in-claude.md`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`

**Actions:**

1. Finalize the exact Claude-side handoff wording after full resolution:
   - short provenance summary
   - resolved prompt
   - explicit confirmation prompt
2. Update the README and manual Claude walkthrough so the intended Epic 5 behavior is reproducible without reading the skill source.
3. Add light contract checks in `routing-contract.test.mjs` for the run skill text only where they protect real public behavior, for example:
   - the command shape
   - the existence of `needs_input` handling language
   - the existence of explicit confirmation/cancel behavior
4. Decide how to handle the unrelated manifest-skills test drift:
   - either fix `.claude-plugin/plugin.json` as a separate pre-flight cleanup
   - or document that Epic 5 validation currently relies on bridge smoke plus targeted routing assertions until that baseline issue is removed
5. Run the full Epic 5 acceptance path from a clean project workspace.

**Validation:**

Preferred validation set after Epic 5 lands:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
node --test packages/claude-code-plugin/test/bridge-smoke.test.mjs
node --test packages/claude-code-plugin/test/routing-contract.test.mjs
```

Manual acceptance walkthrough:

1. `/stencilinit`
2. `/stencilcreate review-checklist`
3. `/stencilshow review-checklist`
4. `/stencilrun review-checklist`
5. answer missing values one by one
6. confirm the final resolved prompt
7. verify Claude continues with the resolved prompt as the active task
8. repeat once with cancellation before the final answer

**Completion gate:** the run flow is documented, manually reproducible, and protected by bridge-level and contract-level checks.

## Acceptance Criteria For The Epic

Epic 5 is done when all of the following are true:

- `/stencilrun <name> [key=value ...]` works as a real Claude Code workflow.
- inline args are passed through unchanged and win over all other sources.
- `$ctx.*` and default resolution still come from core.
- the adapter only asks about values still marked unresolved by core.
- every conversational answer re-enters the real `resolve` path rather than patching the body in skill text.
- the user can tell which values came from explicit input, context, and defaults.
- the final resolved prompt enters a documented Claude execution handoff with an explicit confirmation step.
- the happy path and missing-input path are both covered by repeatable validation.

## Recommended Execution Order

Implement this epic in this order and do not skip the gates:

1. Step 1 to freeze the run contract.
2. Step 2 to ship the already-resolved happy path.
3. Step 3 to lock the missing-input data contract with tests.
4. Step 4 to land one-input conversational re-entry.
5. Step 5 to generalize to the full sequential loop.
6. Step 6 to harden docs, routing assertions, and acceptance coverage.

This ordering keeps every wave vertically useful and anchored in a real `init -> create -> show -> run` command flow.
