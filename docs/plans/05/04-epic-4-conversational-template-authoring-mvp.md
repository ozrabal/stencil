# Plan: Epic 4 — Conversational Template Authoring MVP

**Goal:** implement `/stencilcreate <name>` as a real Claude Code conversational authoring flow that collects template data in chat, persists a valid project-local Stencil template through the existing core CLI bridge, and proves the saved template immediately through `show` and `run`.

**Primary source documents:**

- `docs/epics/05-claude-code-adapter-mvp-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Primary repo inputs:**

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/core/src/stencil.ts`
- `packages/core/src/cli.ts`
- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/placeholders.ts`
- `packages/core/src/validator.ts`
- `packages/core/test/cli.test.ts`
- `packages/core/test/stencil.test.ts`

## Scope Boundary

This plan covers Epic 4 only:

- Claude-side conversational authoring for `/stencilcreate <name>`
- collection of template description, optional tags, placeholder metadata needed for the MVP, and template body
- body review before save
- core-backed validation before persistence
- collision, invalid-name, and cancel behavior for create
- post-save verification through `show` and a real `run` flow
- automated coverage needed to keep the create contract stable

Keep these out of scope here:

- saving a template from an arbitrary prior conversation
- edit, copy, rename, search, and collection commands
- global template UX
- dry-run mode
- post-resolution confirmation and override UX for `/stencilrun`
- shell-script business logic that duplicates core validation, parsing, or persistence

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
- Claude adapter tests pass
- the real core CLI bridge already supports `create`
- the public Claude bridge already invokes `create` through stdin JSON with `--project-only`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs` already proves a mechanical `init -> list -> show -> create -> show -> run -> validate -> delete` bridge flow
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md` is still transport-only and explicitly says not to prompt for frontmatter fields or implement real creation UX
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md` is still transport-only and does not yet own conversational missing-input collection

## Repo Facts That Must Shape The Plan

- Epic 4 is no longer blocked on Epic 2. The core CLI and JSON bridge already exist and are under test.
- `create` already persists through `Stencil.create(frontmatter, body, collection?)` in `packages/core/src/stencil.ts`.
- the CLI create contract is already explicit:
  - command: `create`
  - public adapter usage: `/stencilcreate <name>`
  - transport usage: `node .../cli.js create --project-only --stdin-json`
  - stdin payload shape: `{ frontmatter, body, collection? }`
- the shell bridge is already thin in `packages/claude-code-plugin/scripts/lib/bridge.sh`. Epic 4 should preserve that boundary.
- the core already has reusable placeholder parsing utilities in `packages/core/src/placeholders.ts`, including:
  - `extractTemplateBodyTokens`
  - `extractInlineInputTokens`
- validation already lives in core and is enforced during create and validate flows. The adapter should surface those results, not reimplement them.
- the PRD Phase 1 flow for create is conversational and ends with a persisted template that can be shown and run.
- the planning notes require thin vertical slices that end in real Claude Code command flows and keep the first coherent implementation wave centered on:
  - `init`
  - `create`
  - `show`
  - `run`

## Planning Decisions To Lock Before Editing

### 1. Treat Epic 4 as adapter UX work on top of an existing bridge

The bridge is already real. The missing work is the Claude authoring experience and any small contract additions needed to support it cleanly.

### 2. Keep the persisted template language canonical

The adapter may guide the user conversationally, but the saved file must remain a normal Stencil Markdown template using supported syntax only:

- `{{input:name}}`
- `{{input:name:default value}}`
- `{{name}}`
- `{{$ctx.key}}`

Do not invent Claude-only placeholder syntax or hidden adapter metadata.

### 3. Prefer body-first placeholder detection over adapter-side placeholder invention

The body is the actual source of truth for runtime tokens. The skill should gather a draft body, then use core-compatible token parsing rules to detect placeholders and decide what metadata is still needed. That avoids asking the user to maintain two separate placeholder lists by hand when the body already contains the answer.

### 4. Keep placeholder metadata minimal in the MVP

For Epic 4, the adapter should collect only metadata that materially improves the MVP:

- placeholder description
- required vs optional when not already implied by inline defaults
- frontmatter default when the user chooses legacy/frontmatter-backed placeholders
- optional tags

Do not expand into Phase 3 typing UX unless the current core path already supports it with no additional conversational complexity.

### 5. End every create slice in a real artifact flow

Each implementation slice should terminate in a real command sequence, not a mock prompt:

1. `/stencilinit`
2. `/stencilcreate <name>`
3. `/stencilshow <name>`
4. `/stencilrun <name> ...`

For Epic 4 validation, prefer inline `run` values over conversational `run` fill so Epic 5 scope stays separate.

### 6. Keep cancellations and collisions explicit and adapter-owned

The user should always be able to stop before persistence. Name collisions and invalid names should be surfaced conversationally by the skill, with core and bridge errors preserved as the source of truth.

## Desired Outcome After Epic 4

At the end of this epic:

- `/stencilcreate <name>` runs as a genuine Claude conversation rather than a transport placeholder
- the user can provide a description, optional tags, a body, and placeholder metadata without editing files manually
- the adapter validates through core before save and surfaces correctable issues clearly
- saved templates are standard `.md` Stencil templates in project-local storage
- the newly created template can immediately be inspected with `/stencilshow <name>`
- the newly created template can immediately be proven usable with `/stencilrun <name> [key=value ...]`

## Recommended Files To Change

Expected Claude adapter updates:

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

Possible Claude adapter additions:

- prompt-contract fixtures or test data under `packages/claude-code-plugin/test/fixtures/`
- a small adapter-local helper document if the create flow needs canonical question phrasing examples

Core changes should be minimal and only added if the current create contract proves insufficient:

- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/placeholders.ts`
- `packages/core/test/cli.test.ts`
- `packages/core/test/stencil.test.ts`

Do not move any of this into shell scripts unless it is pure transport normalization.

## Implementation Sequence

## Step 1 — Lock The Conversational Create Contract

**Objective:** define the exact Claude-side authoring flow, the minimum data model for save, and the post-save success path before editing skill text.

**Files to change:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`

**Actions:**

1. Lock the public create flow to `/stencilcreate <name>`.
2. Define the canonical authoring order for the MVP:
   - confirm the target template name
   - collect required description
   - ask for optional tags
   - collect a draft body
   - inspect detected placeholders
   - collect missing placeholder metadata only where needed
   - show a save preview
   - persist through the existing bridge
3. Decide what the skill should accept for body entry.
   Recommended MVP: a normal Markdown block provided directly in conversation.
4. Define the placeholder strategy.
   Recommended MVP:
   - detect `{{input:...}}`, `{{name}}`, and `{{$ctx...}}` tokens from the drafted body
   - do not ask for metadata for `$ctx` tokens
   - only ask follow-up questions for user-facing placeholders that need descriptions or explicit frontmatter defaults
5. Define save-preview contents.
   Recommended minimum:
   - name
   - description
   - tags
   - placeholder summary
   - body preview
6. Define cancel wording and collision behavior.
   Recommended behavior:
   - if the user backs out before save, no file is written
   - if core reports a conflict, the skill explains the conflict and asks the user to retry with a different name rather than forcing overwrite in Epic 4

**Validation:**

```bash
rg -n "stencilcreate|body|placeholder|cancel|save preview" packages/claude-code-plugin/README.md packages/claude-code-plugin/skills/stencil-create/SKILL.md
```

**Completion gate:** the create flow is precise enough that the skill can be implemented without improvising semantics during later steps.

---

## Step 2 — Ship The Thinnest Real Authoring Slice: Description + Body + Save

**Objective:** make `/stencilcreate <name>` work end-to-end for simple templates that do not require placeholder metadata beyond what is already inferable from the body.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Replace the current transport-only create skill with concrete instructions for:
   - asking for the description
   - asking for the template body
   - constructing the stdin JSON payload expected by the bridge
2. Keep the payload aligned with the existing core CLI contract:
   - `frontmatter.name` must equal the command argument
   - `frontmatter.description` is required
   - `frontmatter.version` should be set explicitly to `1`
   - `body` is the collected Markdown body
3. Keep tags omitted in this first slice when the user does not provide them.
4. Persist by calling the shared `create` transport path rather than adding any new shell logic.
5. After save, direct the happy path immediately into `/stencilshow <name>`.

**Validation:**

Manual Claude happy path:

```text
/stencilinit
/stencilcreate simple-template
/stencilshow simple-template
```

Bridge regression path:

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** a user can create and inspect a simple template from Claude Code without touching the filesystem.

---

## Step 3 — Add Placeholder-Aware Authoring Without Moving Parsing Into Shell

**Objective:** let the create flow understand placeholders in the drafted body and gather only the metadata the MVP actually needs.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/core/src/placeholders.ts`
- `packages/core/test/cli.test.ts`

**Actions:**

1. Reuse the existing placeholder grammar from core as the source of truth for body-token interpretation.
2. Decide whether the current bridge needs an internal helper for placeholder inspection.
   Recommended approach:
   - if the skill can rely on a documented token grammar and save-time validation alone, keep core unchanged
   - if the skill needs structured token summaries to avoid ambiguous prompting, add a small internal CLI/helper contract backed by `extractTemplateBodyTokens`
3. Teach the skill to separate placeholder classes:
   - `{{$ctx.*}}`: explain that these auto-resolve and do not need metadata
   - `{{input:name}}` and `{{input:name:default}}`: ask for descriptions only if the user wants richer placeholder metadata saved in frontmatter
   - `{{name}}`: ask whether the user wants to declare matching frontmatter placeholder metadata for better later prompting and inspection
4. Keep the MVP conservative when metadata is missing.
   Recommended behavior:
   - a valid body with inline inputs may still be saved even if no frontmatter placeholder array is provided
   - the skill should only ask more questions when the body form requires it or when the user explicitly wants descriptions/defaults surfaced in `show`
5. Update the save preview to include detected placeholders and what will be written into frontmatter.

**Validation:**

Manual happy path:

```text
/stencilcreate review-checklist
description: Code review checklist
body: Review {{input:component_name}} in {{$ctx.project_name}}.
/stencilshow review-checklist
/stencilrun review-checklist component_name=AuthService
```

Automated coverage:

```bash
pnpm --filter @stencil-pm/core test -- cli
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** the create flow can author templates containing supported placeholder syntax and the saved result is immediately runnable with inline values.

---

## Step 4 — Add Optional Tags And Explicit Placeholder Metadata Collection

**Objective:** complete the PRD-level MVP authoring data set without bloating the interaction.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Add a single optional tags prompt.
   Recommended format: comma-separated names that the skill normalizes into a string array.
2. Add a constrained follow-up for placeholder metadata when the user wants it saved:
   - placeholder description
   - required/optional only when not already implied
   - frontmatter default only for legacy/frontmatter-backed placeholders or when the user explicitly prefers frontmatter defaults
3. Do not require metadata duplication when the body already contains an inline default that core can honor.
4. Update examples and skill instructions to show both:
   - minimal inline-input creation
   - richer metadata-backed creation
5. Extend bridge smoke coverage to create a template with tags and placeholder metadata, then verify `show` returns those values.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

Manual happy path:

```text
/stencilcreate write-adr
/stencilshow write-adr
```

Check that `show` displays:

- description
- tags
- placeholder summary
- body

**Completion gate:** the create flow supports the MVP data set from the PRD while still staying conversationally lightweight.

---

## Step 5 — Make Validation Failures, Invalid Names, And Collisions Conversational

**Objective:** handle the real failure modes of create without burying them in transport errors or forcing manual file cleanup.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/README.md`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Enumerate the create failure modes the skill must surface directly:
   - invalid template name
   - malformed body tokenization or validation failures
   - conflicting template name
   - permission/storage failure
   - user cancellation
2. Preserve the existing core envelope semantics:
   - `status=validation_failed` means correctable template issues
   - `status=error` means handled domain failure such as conflict or storage error
3. Update the skill so that validation failures lead to correction instructions instead of a generic failure message.
4. Keep overwrite out of scope for Epic 4.
   Recommended behavior: on collision, stop and ask the user to retry with a different template name.
5. Add regression tests for:
   - duplicate create name
   - create payload rejected by validation
   - cancelled flow leaves no file behind

**Validation:**

```bash
pnpm --filter @stencil-pm/core test -- cli
pnpm --filter @stencil-pm/claude-code-plugin test
```

Manual failure checks:

```text
/stencilcreate quick-fix
/stencilcreate invalid name
```

**Completion gate:** create failures are explicit, typed, and recoverable, with no silent partial writes.

---

## Step 6 — Tighten The Post-Save Proof Path Through `show` And `run`

**Objective:** make Epic 4 end in the exact vertical slice required by the planning notes: `init -> create -> show -> run`.

**Files to change:**

- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-show/SKILL.md`
- `packages/claude-code-plugin/skills/stencil-run/SKILL.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Update the create skill to explicitly point the user to `/stencilshow <name>` after a successful save.
2. Ensure the main documented create example is followed by a real `/stencilrun <name> key=value` example.
3. Keep Epic 4 run validation narrow:
   - prove the created template resolves
   - use inline values only where required
   - do not take on Epic 5 conversational fill
4. Add or expand a smoke test that starts from `init`, creates a template through the real create contract, shows it, and runs it successfully with inline args.
5. Verify that the chosen example body actually demonstrates Stencil value.
   Recommended example:
   - one user input placeholder
   - one `$ctx` placeholder
   - simple body text that is easy to inspect in tests

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

Manual proof path:

```text
/stencilinit
/stencilcreate review-checklist
/stencilshow review-checklist
/stencilrun review-checklist component_name=AuthService
```

**Completion gate:** Epic 4 ends in a real, user-visible happy path rather than a saved-but-unproven template artifact.

---

## Step 7 — Harden Documentation And Acceptance Coverage

**Objective:** leave behind a stable create contract that later epics can build on without rewriting the adapter boundary.

**Files to change:**

- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/skills/stencil-create/SKILL.md`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `docs/plans/05/04-epic-4-conversational-template-authoring-mvp.md` if implementation decisions require small plan drift notes

**Actions:**

1. Document the final conversational create contract in the Claude adapter README.
2. Make sure the create skill examples match the bridge contract exactly.
3. Add one acceptance-oriented smoke path for:
   - no-placeholder template
   - placeholder-bearing template with inline run values
4. Keep validation instructions current for future contributors.
5. Verify that the create flow still preserves the architecture boundary:
   - skill owns UX
   - shell owns transport only
   - core owns validation and persistence

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

**Completion gate:** the repo documents and tests the create flow strongly enough that Epic 5 can build on it without re-opening create semantics.

## Acceptance Criteria

Epic 4 is complete when all of the following are true:

- `/stencilcreate <name>` is no longer a placeholder skill
- the create flow collects required description and body conversationally
- the flow supports optional tags
- the flow supports placeholder-bearing bodies using existing Stencil syntax
- the flow gathers or preserves placeholder metadata only where the MVP needs it
- create validation failures are surfaced through handled core results, not shell parsing
- name collisions and cancellation are explicit
- the saved template is project-local, human-readable, and visible via `/stencilshow <name>`
- the saved template can be proven via `/stencilrun <name> [key=value ...]`
- automated tests still pass for core and Claude adapter packages

## Recommended Execution Order

Implement this epic in the following order:

1. Step 1 to lock the contract.
2. Step 2 to ship the first real create path.
3. Step 3 to add placeholder-aware authoring.
4. Step 4 to complete tags and metadata coverage.
5. Step 5 to harden failures and cancellation.
6. Step 6 to prove the `init -> create -> show -> run` slice.
7. Step 7 to finalize docs and acceptance coverage.

This ordering keeps each slice vertical and keeps the first useful wave focused on the required MVP flow instead of disappearing into helper work.
