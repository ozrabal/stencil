# Plan: Epic 3 — Input Variable Strategy and Template Syntax Alignment

**Goal:** Adopt inline `{{input:...}}` variables as a first-class Stencil run-template contract, while keeping core and VS Code behavior aligned and preserving a working end-to-end run flow at each implementation step.

**Primary source documents:**

- `docs/epics/04-vscode-run-template-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Referenced but missing source:**

- `docs/epics/04-vscode-run-template-epics.md` references `docs/promptvault-run-template.md`, but that file is not present in this workspace.
- This plan therefore treats `docs/epics/04-vscode-run-template-epics.md` as the authoritative Epic 3 scope source unless the missing spec is restored before implementation starts.

**Current code baseline:**

- `packages/core/src/types.ts`
- `packages/core/src/placeholders.ts`
- `packages/core/src/parser.ts`
- `packages/core/src/resolver.ts`
- `packages/core/src/validator.ts`
- `packages/core/src/stencil.ts`
- `packages/core/test/placeholders.test.ts`
- `packages/core/test/parser.test.ts`
- `packages/core/test/validator.test.ts`
- `packages/core/test/stencil.test.ts`
- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/placeholderInput.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/test/unit/services/placeholderInput.test.ts`
- `packages/vscode-extension/README.md`

## Scope Lock

This plan covers Epic 3 only.

In scope:

- define the supported run-template contract for inline `{{input:name}}` and `{{input:name:default}}`
- decide how inline inputs coexist with current frontmatter-declared placeholders
- move input parsing and normalization into `@stencil-pm/core`
- update validation and resolution semantics so inline inputs are not treated as undeclared placeholder mistakes
- update the VS Code run flow to prompt from normalized core-owned input metadata instead of assuming frontmatter-only placeholders
- document duplicate-name, default, required/optional, and unresolved-value behavior
- preserve backward compatibility for existing frontmatter-driven templates during migration

Out of scope for this epic:

- Copilot Chat delivery implementation from Epic 4
- LM API execution implementation from Epic 7
- clipboard fallback implementation from Epic 6
- advanced authoring UI such as Webview forms, CodeLens, autocomplete, or diagnostics providers
- typed input enforcement beyond what current placeholder metadata already models
- new context variable families unrelated to input syntax

## Planning Notes Applied

- Each step ends in a runnable user flow through the current VS Code run path, not only parser scaffolding.
- The contract is designed in core first so later Copilot Chat, LM API, clipboard, Claude Code, and Codex flows consume the same normalized input model.
- Inline input support is not hidden in the VS Code adapter. The adapter must consume a core-owned contract.
- The first wave stays compatible with the current editor-output run flow, because that is the only implemented delivery path today, but every contract choice below is shaped for later multi-target execution.

## Repo Facts That Matter

- Core currently treats frontmatter `placeholders` as the only user-input declarations.
- Core currently resolves body `{{token}}` references by name, but only frontmatter-declared placeholders participate in the resolution result.
- Core validator currently warns when the body contains a non-`$ctx.*` token that is not declared in frontmatter.
- The current parser does not classify tokens; it only parses frontmatter and body.
- The current VS Code prompt plan is built from `template.frontmatter.placeholders` and throws if unresolved placeholders are not backed by frontmatter metadata.
- The current VS Code run flow therefore cannot support inline-only inputs even if the body syntax were accepted, because prompting is still frontmatter-driven.
- `docs/stencil-prd.md` still documents frontmatter declarations plus `{{placeholder_name}}` as the product contract, so Epic 3 requires a deliberate documentation migration, not just code changes.
- The architecture document explicitly states that Codex cannot prompt interactively, so unresolved inline inputs must still surface as explicit unresolved inputs in core rather than becoming extension-only behavior.

## Recommended Contract

Epic 3 needs one explicit contract before implementation spreads.

### Supported User-Input Syntax

Use these as supported run-template forms:

- `{{input:name}}`
- `{{input:name:default value}}`
- `{{name}}` remains supported as a legacy compatibility form for existing frontmatter-based templates
- `{{$ctx.key}}` remains the context-variable form and is not part of the user-input namespace

### Recommended Coexistence Rule

Use a normalized input-definition model in core with these rules:

1. Inline `{{input:...}}` declarations become first-class runtime input definitions.
2. Matching frontmatter entries remain supported as metadata overlays and legacy declarations.
3. Existing frontmatter-only templates using `{{name}}` keep working unchanged.
4. New run-template authoring should prefer inline `{{input:...}}` for body-declared inputs.

### Metadata Merge Rule

For one logical input name:

- inline syntax provides:
  - the fact that the input exists in the body
  - the default value if present in `{{input:name:default}}`
- frontmatter provides:
  - description
  - required
  - type
  - options
  - optional fallback default if inline default is absent

Recommended precedence:

1. explicit runtime input
2. matching `$ctx.*` context value only for legacy `{{name}}` resolution behavior already backed by a frontmatter placeholder
3. inline default
4. frontmatter default
5. unresolved

### Effective Required Rule

- if any default exists, the effective input is optional at runtime
- if no default exists, the effective input is required unless frontmatter explicitly marks it `required: false`
- keep the current warning when metadata says `required: true` but a default exists, because the effective behavior is optional

### Duplicate And Ambiguity Rules

- repeated `{{input:name}}` occurrences are allowed and map to one logical input
- repeated `{{input:name:default}}` occurrences are allowed only when the defaults are identical after exact string comparison
- conflicting inline defaults for the same name are a validation error
- mixing `{{input:name}}` and legacy `{{name}}` for the same logical input is allowed during migration but should emit a warning encouraging one style
- a raw `{{name}}` token with no inline declaration and no matching frontmatter declaration remains a warning

### Prompt UX Rule

- VS Code prompts from normalized core-owned input definitions, not from `frontmatter.placeholders` directly
- if no description is available, the prompt message is generated from the input name, for example `project_name` -> `Project name`
- inline-only inputs without metadata still run; they do not fail just because frontmatter is absent

## Desired Outcome

At the end of Epic 3:

- the supported run-template language explicitly includes inline `{{input:...}}`
- core owns input discovery, validation, normalization, and resolution semantics
- VS Code prompts against the core-owned normalized input contract
- existing frontmatter-only templates still run
- inline-only templates run without adapter-specific preprocessing
- later adapters can inspect unresolved inputs or prompt for them using the same contract

## Validation Baseline

Run before editing:

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
```

Default validation after each implementation step:

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
```

Full validation before closing the epic:

```bash
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

## Manual Validation Templates

Use these fixtures during manual checks.

### A. Legacy Frontmatter-Only Template

```markdown
---
name: legacy-frontmatter
description: Legacy placeholder flow
version: 1
placeholders:
  - name: project_name
    description: Project name
    required: true
---

Project: {{project_name}}
File: {{$ctx.active_file_name}}
```

Expected result:

- still prompts for `project_name`
- still resolves `$ctx.active_file_name`

### B. Inline-Only Template

```markdown
---
name: inline-only
description: Inline-only input flow
version: 1
---

Project: {{input:project_name}}
Review type: {{input:review_type:general}}
File: {{$ctx.active_file_name}}
```

Expected result:

- prompts for `project_name`
- does not prompt for `review_type` unless the user chooses to override through future UX
- resolves `review_type` to `general`

### C. Mixed Metadata Overlay Template

```markdown
---
name: inline-with-metadata
description: Inline input with metadata overlay
version: 1
placeholders:
  - name: project_name
    description: Human-friendly project prompt
    required: true
  - name: review_type
    description: Review type
    required: false
    default: general
---

Project: {{input:project_name}}
Review type: {{input:review_type}}
```

Expected result:

- prompt text uses frontmatter descriptions
- `review_type` resolves from the metadata default

### D. Conflict Template

```markdown
---
name: conflicting-inline-defaults
description: Invalid duplicate inline defaults
version: 1
---

One: {{input:review_type:general}}
Two: {{input:review_type:security}}
```

Expected result:

- validation fails clearly before the run flow proceeds

## Implementation Sequence

### Step 1 — Freeze Current Frontmatter-Only Behavior And Contract Gaps

**Objective:** Lock today’s behavior so Epic 3 can change it intentionally instead of by accident.

**Files to change:**

- `packages/core/test/validator.test.ts`
- `packages/core/test/stencil.test.ts`
- `packages/vscode-extension/test/unit/services/placeholderInput.test.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`

**Actions:**

1. Add characterization coverage for the current behavior:
   - undeclared `{{name}}` warns
   - frontmatter-only placeholders resolve and prompt
   - unresolved placeholders without frontmatter metadata cause the VS Code prompt-plan failure
2. Add explicit tests that demonstrate the current Epic 3 gap:
   - `{{input:name}}` is currently treated as an undeclared placeholder shape
   - inline-only templates cannot prompt successfully in the extension today
3. Keep production behavior unchanged in this step.

**User-observable slice:** the current frontmatter-only run flow still works, and the failure shape for inline-only inputs is explicitly captured by tests.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test -- validator
pnpm --filter @stencil-pm/core test -- stencil
pnpm --filter stencil-vscode test:unit -- placeholderInput
pnpm --filter stencil-vscode test:unit -- runTemplateService
```

**Completion gate:** the repo has tests that prove exactly what Epic 3 must change.

---

### Step 2 — Introduce A Core-Owned Input Token And Normalization Model

**Objective:** Give core one explicit representation for runtime user inputs before changing resolution behavior.

**Files to change:**

- `packages/core/src/types.ts`
- `packages/core/src/placeholders.ts`
- `packages/core/src/parser.ts`
- `packages/core/test/placeholders.test.ts`
- `packages/core/test/parser.test.ts`

**Actions:**

1. Add core types for normalized runtime inputs, for example:
   - discovered inline input token
   - normalized input definition
   - resolved input state
2. Extend placeholder parsing helpers so core can classify body tokens as:
   - context token
   - inline input token
   - legacy placeholder token
3. Add parsing coverage for:
   - `{{input:name}}`
   - `{{input:name:default}}`
   - whitespace trimming rules
   - duplicate occurrences
   - invalid inline token shapes
4. Keep this step non-breaking:
   - no resolver semantics change yet
   - no VS Code prompting change yet

**Implementation note:** this is the point where the contract moves into core. Do not implement equivalent token parsing separately in the VS Code adapter.

**User-observable slice:** existing templates still run, while the core can now recognize inline input syntax in tests and debug paths.

**Validation:**

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test -- placeholders
pnpm --filter @stencil-pm/core test -- parser
pnpm --filter stencil-vscode test:unit -- runTemplateService
```

**Completion gate:** core can discover inline inputs without relying on frontmatter metadata or adapter parsing.

---

### Step 3 — Define The Merge Contract Between Inline Inputs And Frontmatter Metadata

**Objective:** Make one deterministic normalization rule for inline declarations, metadata overlays, defaults, and duplicate names.

**Files to change:**

- `packages/core/src/types.ts`
- `packages/core/src/validator.ts`
- `packages/core/test/validator.test.ts`
- `docs/stencil-prd.md`
- `docs/stencil-architecture.md`

**Actions:**

1. Implement a core normalization helper that merges:
   - discovered inline inputs from the body
   - matching frontmatter placeholder metadata
   - legacy frontmatter-only placeholder declarations
2. Encode and test the recommended rules:
   - inline-only inputs are valid
   - frontmatter overlay augments inline inputs
   - frontmatter-only templates remain valid
   - conflicting inline defaults error
   - raw undeclared `{{name}}` still warns
   - mixed `{{input:name}}` and `{{name}}` warns but resolves through one logical input
3. Update product docs to reflect the new run-template contract:
   - inline input syntax is now supported
   - frontmatter placeholders are still supported for compatibility and metadata
   - undeclared-body warning rules change accordingly
4. Do not switch the resolver or VS Code prompt flow yet; finish the contract and docs first.

**User-observable slice:** existing templates still run unchanged, and validation now accepts supported inline syntax instead of treating it as a mistake.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test -- validator
pnpm --filter @stencil-pm/core test -- stencil
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Create the inline-only template from the fixture set.
2. Confirm validation no longer reports the inline input tokens as undeclared placeholder warnings.
3. Confirm the template still cannot fully run end to end until the next step updates prompting.

**Completion gate:** the supported language contract is explicit in code and docs before runtime behavior depends on it.

---

### Step 4 — Move Resolver Semantics To The Normalized Input Model

**Objective:** Make `Stencil.resolve()` and the underlying resolver operate on normalized inputs rather than frontmatter declarations alone.

**Files to change:**

- `packages/core/src/resolver.ts`
- `packages/core/src/stencil.ts`
- `packages/core/src/types.ts`
- `packages/core/test/stencil.test.ts`
- `packages/core/test/validator.test.ts`

**Actions:**

1. Update resolution so the core builds its runtime input set from the normalized contract created in Step 3.
2. Resolve inline `{{input:name}}` and `{{input:name:default}}` occurrences directly in the body.
3. Preserve legacy resolution for `{{name}}` so existing templates still work.
4. Ensure `ResolutionResult` exposes enough data for adapters to prompt correctly without re-deriving metadata from frontmatter.
   - unresolved names alone are no longer sufficient
   - include effective description, default presence, and required/optional state in the normalized result or via a dedicated core helper
5. Keep unresolved inputs explicit in the core result so future noninteractive adapters can fail clearly.

**User-observable slice:** inline-only templates can now resolve defaults and unresolved state correctly in core, even before the extension prompt flow is updated.

**Validation:**

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test -- stencil
pnpm --filter @stencil-pm/core test -- validator
```

**Manual validation:**

1. Run core-backed tests for:
   - inline-only with required input
   - inline-only with default
   - inline plus frontmatter overlay
   - legacy frontmatter-only template
2. Confirm unresolved inline inputs are listed in a structured way, not silently left behind as plain body text.

**Completion gate:** core owns end-to-end resolution semantics for both legacy and inline input styles.

---

### Step 5 — Switch The VS Code Prompt Flow To Core-Normalized Inputs

**Objective:** Remove the extension’s dependency on `frontmatter.placeholders` as the source of prompt truth.

**Files to change:**

- `packages/vscode-extension/src/services/placeholderInput.ts`
- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/test/unit/services/placeholderInput.test.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`

**Actions:**

1. Update the prompt-plan builder so it consumes the normalized input information returned by core.
2. Stop throwing when unresolved inputs are not listed in frontmatter.
3. Preserve current sequential `showInputBox()` UX for this epic, but make it work for:
   - inline-only inputs
   - mixed inline plus metadata inputs
   - legacy frontmatter-only inputs
4. Add prompt-text fallback generation for inline-only inputs with no description metadata.
5. Preserve current cancellation and retry behavior.

**Implementation note:** this is the critical anti-adapter-hack step. The extension may format prompts, but it must not discover or merge input semantics on its own.

**User-observable slice:** a user can run an inline-only template in VS Code and complete the full editor-output flow without frontmatter placeholder declarations.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit -- placeholderInput
pnpm --filter stencil-vscode test:unit -- runTemplateService
```

**Manual validation:**

1. Open a workspace with the inline-only template.
2. Run `Stencil: Run Template`.
3. Confirm `project_name` prompts with a generated label.
4. Confirm `review_type` resolves to `general` without prompting.
5. Confirm the final resolved prompt opens in the editor.

**Completion gate:** inline-only templates are runnable end to end through the extension without adapter-specific parsing.

---

### Step 6 — Harden Mixed-Mode Semantics And Migration Warnings

**Objective:** Finish the contract edge cases so migration from legacy templates is deterministic and test-covered.

**Files to change:**

- `packages/core/src/validator.ts`
- `packages/core/src/resolver.ts`
- `packages/core/test/validator.test.ts`
- `packages/core/test/stencil.test.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`
- `packages/vscode-extension/README.md`

**Actions:**

1. Add coverage for:
   - repeated identical inline defaults
   - conflicting inline defaults
   - mixed `{{input:name}}` and `{{name}}`
   - frontmatter metadata with no inline declaration
   - inline declarations with no frontmatter metadata
2. Decide whether legacy-style plus inline-style mixing is:
   - warning only during migration
   - or error if the team wants stricter cleanup
     Recommended: warning first, because the repo already codifies legacy placeholder behavior widely.
3. Document migration guidance in the extension README:
   - preferred new style
   - compatibility guarantees
   - cases that warn or fail
4. Confirm the extension surfaces contract failures clearly instead of falling through to generic messages.

**User-observable slice:** mixed templates either run predictably or fail with specific validation messages instead of ambiguous placeholder behavior.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode test:unit
```

**Manual validation:**

1. Run the mixed metadata overlay template.
2. Run the conflict template.
3. Confirm the first resolves correctly and the second fails with a specific conflict message.

**Completion gate:** migration-edge behavior is explicit, documented, and stable.

---

### Step 7 — Close The Epic With End-To-End Compatibility Validation

**Objective:** Prove the new contract works across the current extension flow and does not regress legacy templates.

**Files to change:**

- `packages/vscode-extension/docs/manual-acceptance.md`
- `packages/vscode-extension/test/smoke/extension.test.mjs` if smoke coverage is practical
- any fixture workspaces needed under `packages/vscode-extension/test/fixtures/`

**Actions:**

1. Add or update manual acceptance coverage for:
   - legacy frontmatter-only run
   - inline-only run
   - inline-plus-frontmatter overlay run
   - validation failure for conflicting inline defaults
2. Add smoke coverage only if the existing VS Code harness can exercise the run path reliably without brittle UI timing.
3. Verify the docs and tests use the same supported syntax examples.
4. Review whether any architecture sections still claim that body placeholders must always be frontmatter-declared, and update them if missed earlier.

**User-observable slice:** the extension now supports both legacy and inline input styles through the same run command.

**Validation:**

```bash
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Completion gate:** Epic 3 is complete when both legacy and inline input templates run through the same extension flow and the contract is documented consistently.

## Risks To Watch

- The current PRD and validator assumptions are stricter than Epic 3. If docs are not updated early, later work will drift.
- If the resolver changes without extending the resolution result shape, the VS Code adapter will be forced back into frontmatter inspection or token reparsing.
- If inline defaults and frontmatter defaults are not given a single precedence rule, later Copilot Chat and Codex flows will diverge.
- If legacy `{{name}}` support is removed too early, existing tests and templates will break unnecessarily.

## Recommended Epic Exit Checklist

- inline `{{input:...}}` syntax is accepted and documented
- core owns normalized input discovery and merge semantics
- validator no longer flags supported inline inputs as undeclared placeholders
- `Stencil.resolve()` exposes normalized unresolved input information
- VS Code prompting uses core-normalized input data
- legacy frontmatter-only templates still run
- inline-only templates run end to end in the extension
- mixed/conflicting cases have explicit validation coverage
