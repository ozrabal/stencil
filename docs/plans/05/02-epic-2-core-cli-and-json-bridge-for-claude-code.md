# Plan: Epic 2 — Core CLI And JSON Bridge For Claude Code

**Goal:** replace the current Claude Code adapter placeholder bridge with a real, machine-readable core CLI so Claude skills can invoke Stencil behavior through thin shell transport and structured JSON results.

**Primary source documents:**

- `docs/epics/05-claude-code-adapter-mvp-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Primary repo inputs:**

- `packages/core/src/stencil.ts`
- `packages/core/src/errors.ts`
- `packages/core/src/types.ts`
- `packages/core/package.json`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/scripts/lib/args.sh`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`

## Scope Boundary

This plan covers Epic 2 only:

- a public adapter-facing CLI entry point in `@stencil-pm/core`
- a stable JSON contract for handled CLI results
- transport behavior for stdout, stderr, and exit codes
- replacement of the current `bridge unavailable` placeholder in the Claude Code adapter
- thin shell integration for the MVP bridge commands
- validation coverage proving real command flows

This plan does not absorb later Claude UX work:

- multi-turn conversational copy and prompting details in skill text
- rich confirmation/override UX after resolution
- search, edit, copy, collections, global-template UX expansion
- dry-run mode
- destructive-flow polish beyond minimal bridge coverage

## Repo Facts That Must Shape The Plan

- Epic 1 is already implemented as a routing shell. The Claude adapter currently validates command shape and then stops in `stencil::bridge_unavailable()`.
- `packages/claude-code-plugin/scripts/stencil-command.sh` already centralizes adapter-side command parsing for:
  - `init`
  - `create`
  - `list`
  - `show`
  - `run`
  - `delete`
  - internal bridge commands `resolve`, `validate`, and `detect-context`
- `@stencil-pm/core` already exposes the facade methods Epic 2 needs:
  - `init()`
  - `create()`
  - `list()`
  - `get()`
  - `resolve()`
  - `delete()`
  - `validate()`
- `resolve()` already returns a rich `ResolutionResult` with:
  - `resolvedBody`
  - `placeholders`
  - `inputs`
  - `unresolvedCount`
- `create()` and `resolve()` already enforce core validation boundaries through `TemplateValidationError`.
- `packages/core/package.json` currently exports only `dist/index.js`. There is no `bin` entry and no CLI build artifact.
- `packages/claude-code-plugin/package.json` currently has no dependency on `@stencil-pm/core`, so the adapter has no declared runtime path to the future CLI.
- The architecture docs assume shell transport plus a Node CLI, but the current repo has not implemented that bridge yet.

## Planning Decisions To Lock Before Editing

### 1. Keep the core/adapter split strict

Core owns:

- template CRUD
- parsing
- validation
- resolution
- typed domain errors
- JSON serialization of handled bridge results

Claude adapter owns:

- command vocabulary
- command-shape validation already present in shell
- conversational follow-up for unresolved values
- human-facing help and messaging in skills

Shell scripts may only:

- normalize invocation
- locate the CLI
- forward JSON payloads and `key=value` args
- propagate stdout, stderr, and exit codes

### 2. Treat `resolve` and `validate` as internal bridge commands

They should remain available to the adapter because they are useful implementation primitives for:

- `/stencilrun`
- `/stencilshow`
- `/stencilcreate`

They are not part of the public slash-command surface.

### 3. Use one handled JSON envelope for every successful bridge invocation

When the CLI understands the request and reaches core successfully, it should always emit JSON to stdout, including handled domain failures. That keeps Claude-side parsing uniform.

Recommended envelope:

```json
{
  "status": "ok | needs_input | validation_failed | error",
  "command": "init | create | list | show | resolve | delete | validate",
  "data": {},
  "issues": [],
  "error": {
    "code": "TEMPLATE_NOT_FOUND",
    "message": "Template \"foo\" was not found.",
    "details": {}
  }
}
```

Contract rules:

- `status=ok`: command succeeded and `data` is populated
- `status=needs_input`: command succeeded but runtime input is incomplete; used by `resolve`
- `status=validation_failed`: command reached core but failed template validation; return structured issues
- `status=error`: handled typed domain error from core such as missing template or storage failure

### 4. Reserve non-zero exit codes for transport or process failures

Recommended behavior:

- `0`: valid JSON contract emitted to stdout
- `64`: bad CLI invocation that should have been prevented by the shell adapter but is still guarded in core
- `70`: unhandled internal failure, malformed JSON input, or CLI runtime failure before a contract response can be trusted

Recommended stream behavior:

- `stdout`: only JSON contract output
- `stderr`: only transport/runtime diagnostics
- shell validation errors continue using stderr plus exit `64`

This is the cleanest split between:

- handled domain outcomes the Claude adapter can parse
- transport/runtime failures that Claude should treat as infrastructure problems

### 5. Make the first real vertical wave end in `init`, `create`, `show`, and `run`

Per the planning notes, the first useful end-to-end implementation wave must prioritize:

- `init`
- `create`
- `show`
- `run`

`list` and `delete` still belong to Epic 2 scope, but they should land after the happy path is real.

### 6. Use stdin JSON for complex create payloads

`create` needs body text and structured frontmatter fields. Passing that through positional shell tokens would push business complexity into the adapter.

Recommended CLI input shape:

- simple commands: argv only
- `create`: JSON payload over stdin
- `resolve`: template name plus repeated `key=value` args

That keeps shell transport thin and avoids shell-escaping complexity for Markdown bodies.

## Desired Outcome After Epic 2

At the end of this epic:

- `@stencil-pm/core` exposes a real CLI artifact
- Claude shell scripts invoke the real CLI instead of `bridge unavailable`
- the bridge returns structured JSON for:
  - success
  - unresolved runtime inputs
  - validation failures
  - typed core/domain errors
- the first coherent Claude Code happy-path flows are mechanically possible through the bridge:
  - `init`
  - `create`
  - `show`
  - `run`
- package-level tests prove real bridge behavior instead of routing-only placeholders

## Baseline Validation Before Editing

Run the current baseline first:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

Expected baseline:

- core tests pass
- Claude adapter routing-contract tests pass
- shell scripts are syntactically valid
- bridge behavior still fails with exit `69` and `STENCIL_ADAPTER_BRIDGE_UNAVAILABLE`

## Validation Standard To Add In This Epic

Epic 2 should leave the repo with a repeatable validation path like:

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

Recommended new automated coverage:

- core CLI contract tests
- core CLI command tests against a temporary project workspace
- Claude adapter bridge smoke tests using the real shell transport
- JSON parsing and exit-code behavior tests
- end-to-end happy-path tests for:
  - `init`
  - `create`
  - `show`
  - `run`
- follow-up bridge tests for:
  - `list`
  - `delete`
  - `validate`
  - `resolve` with unresolved inputs

## Recommended Files To Change

Expected core updates:

- `packages/core/package.json`
- `packages/core/src/index.ts`
- `packages/core/src/cli.ts`
- `packages/core/src/cli-contract.ts`
- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli-contract.test.ts`
- `packages/core/test/cli.test.ts`

Expected Claude adapter updates:

- `packages/claude-code-plugin/package.json`
- `packages/claude-code-plugin/README.md`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/scripts/resolve-template.sh`
- `packages/claude-code-plugin/scripts/validate-template.sh`
- `packages/claude-code-plugin/scripts/stencil-command.sh`
- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/claude-code-plugin/test/fixtures/**`

Exact filenames may vary, but preserve these separations:

- CLI contract types and JSON formatting
- CLI argument parsing
- core command execution
- shell transport helpers
- adapter smoke tests

## Implementation Sequence

## Step 1 — Lock The Bridge Contract Before Writing Command Logic

**Objective:** define one JSON and exit-code contract that both core and the Claude adapter can depend on.

**Files to add:**

- `packages/core/src/cli-contract.ts`
- `packages/core/test/cli-contract.test.ts`

**Files to change:**

- `packages/core/src/index.ts`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Define a typed CLI result envelope in core.
2. Define the allowed `status` values:
   - `ok`
   - `needs_input`
   - `validation_failed`
   - `error`
3. Define per-command payload shapes:
   - `init`
   - `create`
   - `list`
   - `show`
   - `resolve`
   - `delete`
   - `validate`
4. Define the error payload shape as a projection of `StencilError`:
   - `code`
   - `message`
   - `details`
5. Define the unresolved-input payload for `resolve` using `ResolutionResult.inputs`, not a Claude-specific duplicate schema.
6. Document the stdout/stderr/exit-code policy in the adapter README so shell behavior and future skill behavior stay aligned.

**Recommended payload shape decisions:**

- `show` should include:
  - template metadata
  - raw body
  - validation result
- `create` should include:
  - saved template summary
  - validation result
- `resolve` should include:
  - `resolvedBody`
  - `placeholders`
  - `inputs`
  - `unresolvedCount`
- `list` should include template summaries only, not full bodies
- `delete` should include `deleted: boolean`

**Validation:**

```bash
pnpm --filter @stencil-pm/core exec vitest run test/cli-contract.test.ts
```

**Completion gate:** the bridge contract is explicit in code and docs, and every later step can target it without revisiting envelope design.

---

## Step 2 — Add A Public Core CLI Entry Point And Packaging

**Objective:** make `@stencil-pm/core` executable as a Node CLI artifact that adapters can call.

**Files to add:**

- `packages/core/src/cli.ts`
- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-runner.ts`

**Files to change:**

- `packages/core/package.json`
- `packages/core/src/index.ts`

**Actions:**

1. Add a CLI entry file that:
   - parses argv
   - instantiates `new Stencil({ projectDir: process.cwd() })`
   - dispatches to command handlers
   - writes the final JSON envelope to stdout
2. Add a `bin` entry in `packages/core/package.json`.
3. Export any CLI contract types needed by adapter-facing code or tests.
4. Ensure `tsc` emits the CLI into `dist/` with a stable path.
5. Decide the canonical invocation path the Claude adapter will use:
   - preferred: `node <resolved-core-dist-cli> ...`
   - acceptable if packaging is stable: package `bin`
6. Add CLI-level guards for malformed invocations even though the shell adapter already validates command shape.

**Recommended command grammar:**

```text
stencil-cli init
stencil-cli list
stencil-cli show <name>
stencil-cli validate <name>
stencil-cli delete <name>
stencil-cli resolve <name> [key=value ...]
stencil-cli create --stdin-json
```

**Validation:**

```bash
pnpm --filter @stencil-pm/core build
node packages/core/dist/cli.js --help
```

If a `bin` alias is added:

```bash
pnpm --filter @stencil-pm/core exec stencil-cli --help
```

**Completion gate:** there is a buildable, executable core CLI artifact with stable command parsing and no adapter dependency.

---

## Step 3 — Implement Command-Runner Error Mapping And Stream Semantics

**Objective:** make CLI execution predictable by separating handled domain outcomes from transport/runtime failures.

**Files to change:**

- `packages/core/src/cli.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/src/errors.ts` if small projection helpers are useful
- `packages/core/test/cli.test.ts`

**Actions:**

1. Catch `StencilError` in the CLI runner and serialize it into `status=error` JSON.
2. Catch `TemplateValidationError` separately and emit `status=validation_failed` with issues.
3. For `resolve`, never throw on unresolved runtime inputs. Emit `status=needs_input` when `unresolvedCount > 0`.
4. Keep non-zero exits for:
   - malformed CLI invocation
   - invalid JSON payload on stdin
   - unexpected uncaught runtime errors
5. Ensure stderr is empty for all handled JSON responses.
6. Ensure stdout is empty for malformed/unhandled failures.

**Validation:**

```bash
pnpm --filter @stencil-pm/core exec vitest run test/cli.test.ts
```

Recommended assertions:

- handled not-found case returns JSON, empty stderr, exit `0`
- handled validation failure returns JSON, empty stderr, exit `0`
- malformed argv returns empty stdout, non-empty stderr, exit `64`
- malformed stdin JSON returns empty stdout, non-empty stderr, exit `70`

**Completion gate:** the CLI has one reliable behavior model for JSON, stderr, and exit codes.

---

## Step 4 — Deliver The First Real Vertical Slice: `init`

**Objective:** replace the placeholder bridge for `/stencilinit` with a real end-to-end command flow.

**Files to change:**

- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/package.json`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Implement the core CLI `init` handler by calling `stencil.init()`.
2. Return JSON that tells the adapter what happened:
   - project directory
   - stencil directory
   - created paths
   - whether the structure already existed
3. Add `@stencil-pm/core` as a dependency of `@stencil-pm/claude-code-plugin`.
4. Replace `stencil::bridge_unavailable()` in `bridge.sh` with real CLI location and invocation logic.
5. Keep the bridge helper generic so all later commands use the same path resolution and process execution.
6. Add an adapter smoke test that invokes `scripts/stencil-command.sh init` in a temp workspace and asserts valid JSON.

**Validation:**

```bash
pnpm --filter @stencil-pm/core exec vitest run test/cli.test.ts
pnpm --filter @stencil-pm/claude-code-plugin exec node --test test/bridge-smoke.test.mjs
```

Manual smoke check:

```bash
tmpdir="$(mktemp -d)"
(cd "$tmpdir" && bash /Users/piotrlepkowski/Private/stencil/packages/claude-code-plugin/scripts/stencil-command.sh init)
find "$tmpdir/.stencil" -maxdepth 2 -type d | sort
```

**Completion gate:** `/stencilinit` is no longer a placeholder transport flow.

---

## Step 5 — Add `show` And Internal `validate` On The Real Bridge

**Objective:** make template inspection and validation machine-readable so later conversational UX can build on structured data.

**Files to change:**

- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/validate-template.sh`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Implement `show <name>` in the core CLI using:
   - `stencil.get(name)`
   - `stencil.validate(name)`
2. Return `status=ok` when the template exists even if validation returns warnings.
3. Decide and document whether an invalid template should:
   - return `status=ok` with `validation.valid=false`, or
   - return `status=validation_failed`

Recommended choice:

- `show` returns `status=ok` plus embedded validation details.
- `validate` returns `status=ok` for warnings-only and `status=validation_failed` for validation errors.

4. Implement internal `validate <name>` as its own bridge command for create/show workflows.
5. Add tests for:
   - valid template
   - missing template
   - template with warnings
   - template with validation errors

**Validation:**

```bash
pnpm --filter @stencil-pm/core exec vitest run test/cli.test.ts
pnpm --filter @stencil-pm/claude-code-plugin exec node --test test/bridge-smoke.test.mjs
```

Manual smoke check:

```bash
tmpdir="$(mktemp -d)"
mkdir -p "$tmpdir/.stencil/templates"
cat > "$tmpdir/.stencil/templates/example.md" <<'EOF'
---
name: example
description: Example template
version: 1
---

Hello {{input:name}}
EOF
(cd "$tmpdir" && bash /Users/piotrlepkowski/Private/stencil/packages/claude-code-plugin/scripts/stencil-command.sh show example)
```

**Completion gate:** the bridge can inspect templates and surface validation data without plaintext scraping.

---

## Step 6 — Add `create` With JSON Stdin Payloads

**Objective:** support real template creation without pushing Markdown/body parsing complexity into shell scripts.

**Files to change:**

- `packages/core/src/cli-args.ts`
- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/lib/bridge.sh`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Define the `create` stdin payload schema in the CLI contract:
   - `frontmatter`
   - `body`
   - optional `collection`
2. Parse the payload from stdin in the core CLI.
3. Validate that stdin JSON is required for `create`.
4. Call `stencil.create(frontmatter, body, collection)`.
5. Return the created template plus validation data in JSON.
6. Decide how the adapter bridge passes create payloads:
   - preferred: `bridge.sh` accepts a JSON blob or file path and pipes it to the CLI
   - avoid splitting body/frontmatter across shell tokens
7. Add collision-path coverage for `TEMPLATE_ALREADY_EXISTS`.
8. Add invalid-template coverage for `TEMPLATE_VALIDATION_FAILED`.

**Validation:**

```bash
pnpm --filter @stencil-pm/core exec vitest run test/cli.test.ts
pnpm --filter @stencil-pm/claude-code-plugin exec node --test test/bridge-smoke.test.mjs
```

Manual smoke check:

```bash
tmpdir="$(mktemp -d)"
payload='{"frontmatter":{"name":"review-checklist","description":"Code review checklist","version":1},"body":"Review {{input:component_name}} carefully."}'
(cd "$tmpdir" && printf '%s' "$payload" | node /Users/piotrlepkowski/Private/stencil/packages/core/dist/cli.js create --stdin-json)
```

**Completion gate:** the bridge can persist a new template through core with no adapter-side business logic.

---

## Step 7 — Add `resolve` For The `run` Happy Path

**Objective:** make `/stencilrun` mechanically real by exposing structured resolution results and unresolved-input state through the bridge.

**Files to change:**

- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/scripts/resolve-template.sh`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Implement `resolve <name> [key=value ...]` by calling `stencil.resolve(name, explicitValues)`.
2. Reuse the shell adapter’s existing `key=value` validation rather than reimplementing it in shell.
3. In the core CLI, parse repeated `key=value` args into `explicitValues`.
4. Return:
   - `status=ok` when `unresolvedCount === 0`
   - `status=needs_input` when `unresolvedCount > 0`
5. For `needs_input`, include unresolved input metadata from `ResolutionResult.inputs`:
   - name
   - description if available
   - default value if available
   - required flag
   - current source
6. Preserve resolved source provenance in the response:
   - explicit
   - context
   - default
   - unresolved
7. Add tests for:
   - inline explicit values
   - defaults
   - context resolution
   - unresolved required inputs
   - missing template
   - invalid template being resolved

**Validation:**

```bash
pnpm --filter @stencil-pm/core exec vitest run test/cli.test.ts
pnpm --filter @stencil-pm/claude-code-plugin exec node --test test/bridge-smoke.test.mjs
```

Manual smoke check:

```bash
tmpdir="$(mktemp -d)"
mkdir -p "$tmpdir/.stencil/templates"
cat > "$tmpdir/.stencil/templates/review-checklist.md" <<'EOF'
---
name: review-checklist
description: Review template
version: 1
placeholders:
  - name: component_name
    description: Component under review
    required: true
---

Review {{component_name}} in {{$ctx.project_name}}.
EOF
(cd "$tmpdir" && bash /Users/piotrlepkowski/Private/stencil/packages/claude-code-plugin/scripts/stencil-command.sh run review-checklist component_name=AuthService)
```

**Completion gate:** the `run` bridge returns enough structured information for Claude-side conversational fill without any plaintext parsing.

---

## Step 8 — Fill Out Remaining Epic 2 Coverage: `list` And `delete`

**Objective:** finish the bridge command set promised by Epic 2 after the main happy path is already working.

**Files to change:**

- `packages/core/src/cli-runner.ts`
- `packages/core/test/cli.test.ts`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`

**Actions:**

1. Implement `list` in the core CLI using `stencil.list()`.
2. Return summary objects only:
   - name
   - description
   - tags
   - collection
   - source
   - file path if useful for adapter display
3. Implement `delete <name>` in the core CLI using `stencil.delete(name)`.
4. Decide the missing-template semantics for delete.

Recommended choice:

- return `status=ok` with `deleted=false` for a clean, explicit adapter response.

5. Add tests for empty-state list and idempotent delete behavior.

**Validation:**

```bash
pnpm --filter @stencil-pm/core exec vitest run test/cli.test.ts
pnpm --filter @stencil-pm/claude-code-plugin exec node --test test/bridge-smoke.test.mjs
```

**Completion gate:** every bridge command in Epic 2 scope is implemented and tested.

---

## Step 9 — Replace Routing-Only Adapter Tests With Real Bridge Smoke Coverage

**Objective:** move the Claude adapter package from contract placeholders to real bridge verification.

**Files to change:**

- `packages/claude-code-plugin/test/routing-contract.test.mjs`
- `packages/claude-code-plugin/test/bridge-smoke.test.mjs`
- `packages/claude-code-plugin/test/fixtures/**`
- `packages/claude-code-plugin/README.md`

**Actions:**

1. Keep the Epic 1 routing-contract assertions that still matter:
   - manifest wiring
   - command names
   - help output
   - adapter-side argument validation
2. Remove assertions that require the temporary bridge-unavailable shape.
3. Add bridge smoke coverage for real JSON output:
   - `init`
   - `create`
   - `show`
   - `run`
4. Add follow-up smoke cases for:
   - `list`
   - `delete`
   - `validate`
   - unresolved `resolve`
5. Parse stdout as JSON in tests and assert:
   - exit code
   - stderr behavior
   - `status`
   - selected payload fields
6. Update README examples to show actual bridge behavior and internal helper commands.

**Validation:**

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

**Completion gate:** the Claude adapter package proves real bridge behavior rather than only routing shape.

---

## Step 10 — Final Integration Pass And Acceptance Validation

**Objective:** confirm the epic is complete as contract work across core and the Claude adapter.

**Files to review:**

- `packages/core/**`
- `packages/claude-code-plugin/**`
- `docs/plans/05/02-epic-2-core-cli-and-json-bridge-for-claude-code.md`

**Actions:**

1. Run the full core and Claude adapter validation suite.
2. Build `@stencil-pm/core` and confirm the adapter bridge can locate the emitted CLI reliably.
3. Re-run manual happy-path checks in a temp project:
   - `init`
   - `create`
   - `show`
   - `run`
4. Re-run manual follow-up checks:
   - `list`
   - `delete`
5. Review shell files to confirm they remain transport-only.
6. Review CLI code to confirm Claude-specific conversational behavior did not leak into core.
7. Confirm the adapter still owns command UX and unresolved-input follow-up semantics.

**Validation:**

```bash
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

**Completion gate:** Epic 2 leaves the repo with a stable, tested, structured bridge that later Claude conversational epics can safely build on.

## Acceptance Checklist

- `@stencil-pm/core` exposes a buildable CLI artifact.
- Claude shell transport calls the real CLI instead of the bridge placeholder.
- Handled bridge results are always JSON on stdout with exit `0`.
- Malformed transport/runtime failures use stderr and non-zero exit codes.
- `resolve` returns structured unresolved-input state instead of prompting.
- `create` accepts a structured payload without moving business logic into shell scripts.
- `show` and `validate` surface template validation in machine-readable form.
- The first coherent end-to-end wave is real for:
  - `init`
  - `create`
  - `show`
  - `run`
- `list` and `delete` are covered before the epic closes.
- Adapter tests assert real JSON bridge behavior.

## Risks And Watchpoints

- The architecture document’s example CLI output is simpler than the current core result model. Epic 2 should use the richer current model, not regress it to a flatter adapter-only schema.
- `create` is the easiest place to accidentally leak business rules into shell scripts because of Markdown body handling. Keep body/frontmatter transport in JSON over stdin.
- `show` and `validate` must not diverge semantically. Decide once whether validation errors are embedded data or a top-level `validation_failed` status per command.
- `delete` semantics should stay intentionally plain in Epic 2. Do not pull confirmation UX into the bridge.
- The adapter package currently has no declared dependency on `@stencil-pm/core`; bridge path resolution will be brittle unless packaging is made explicit.
- `detect-context` exists in the adapter shell today but has no documented Epic 2 requirement. Only keep it if there is a concrete bridge consumer; otherwise leave it out of the public completion bar.

## Suggested PR Breakdown

1. Core CLI contract and packaging
2. Core CLI error mapping and stream semantics
3. Claude adapter bridge wiring plus `init`
4. `show` and `validate`
5. `create`
6. `resolve` and `run` happy path
7. `list` and `delete`
8. smoke coverage and docs cleanup
