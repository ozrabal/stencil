# Plan: Epic 1 Step 8 - MVP Stabilization, Docs, And Acceptance Pass

**Goal:** close Epic 1 by tightening the shipped VS Code MVP surface, aligning docs and manifest claims with what actually works, and running an explicit acceptance pass that proves the adapter is stable without pulling Phase 3+ behavior forward.

**Primary inputs:**

- `docs/plans/15-epic-1-vscode-extension-mvp.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `packages/vscode-extension/*`

**This document plans Step 8 only.** It does not implement new end-user features, broaden Epic 1 scope, or start Phase 2 extras such as pre-execution confirmation, dry-run mode, template editing, search, Webviews, diagnostics, autocomplete, CodeLens, or Claude Code integration.

---

## Locked Scope For This Step

These decisions from `15-epic-1-vscode-extension-mvp.md` must remain true while implementing this step:

- Keep Epic 1 strictly on the Phase 2 VS Code MVP surface only.
- Keep output delivery simple and extension-local.
- Keep sequential Input Boxes as the only manual placeholder collection UI in MVP.
- Keep the tree as a browser, not a management UI.
- Keep syntax support intentionally minimal.
- Keep extension-side orchestration centralized, but do not redesign working subsystems during stabilization.

Additional Step 8 decisions to lock before editing:

- Treat Step 8 as a stabilization and truth-alignment pass, not a feature-development pass.
- When the architecture document and PRD describe broader VS Code behavior, prefer the narrower Epic 1 contract from `15-epic-1-vscode-extension-mvp.md`.
- Remove or rewrite any user-facing claim that implies unsupported behavior, even if the architecture document mentions it as a future capability.
- Do not add fallback implementation work just to make documentation easier to write. If a behavior is not shipped, document it as out of scope.
- Acceptance for this step means:
  - the manifest contributes only supported MVP UI surface
  - the README describes only supported MVP behavior
  - automated tests cover the shipped contract at a smoke level
  - manual acceptance steps exist and can be executed by a maintainer

### Critical contract decision to lock before editing

The PRD Phase 2 list includes broader items such as:

- pre-execution confirmation summary
- dry-run mode
- `config.yaml`
- search, edit, and copy flows

The architecture document also sketches:

- Webview placeholder forms
- preview panels
- multiple output targets
- CodeLens
- diagnostics
- Claude Code extension integration

**Recommended lock for Step 8:** do not treat those references as bugs in Epic 1. The acceptance pass should instead confirm that Epic 1 deliberately ships only:

- Command Palette commands for Run, Create, and List
- Quick Pick template selection
- sequential Input Box placeholder collection
- sidebar Tree View browsing
- basic placeholder-aware syntax support
- direct reuse of `@stencil-pm/core`

---

## Repo Facts That Affect The Plan

- `packages/vscode-extension/package.json` currently contributes:
  - language and grammar support for `stencil-template`
  - commands:
    - `stencil.openTemplate`
    - `stencil.runTemplate`
    - `stencil.createTemplate`
    - `stencil.listTemplates`
    - `stencil.refreshTemplatesView`
  - one Explorer view: `stencilTemplates`
  - no Webview, CodeLens, diagnostics, autocomplete, settings, or Claude-specific contributions
- `packages/vscode-extension/src/extension.ts` currently registers:
  - `openTemplate`
  - `runTemplate`
  - `createTemplate`
  - `listTemplates`
  - `refreshTemplatesView`
  - `TemplateTreeProvider`
- The extension package already has:
  - unit tests
  - a smoke test via `@vscode/test-electron`
  - a fixture workspace for syntax validation
- Current smoke coverage verifies:
  - extension activation
  - contributed commands
  - `.stencil/**/*.md` resolves to `stencil-template`
  - ordinary `README.md` remains `markdown`
- `packages/vscode-extension/README.md` is out of date:
  - it still describes the package as being at an Epic 1 Step 3 foundation state
  - it says create flow is deferred
  - it says sequential placeholder prompting is deferred
  - it says the tree is only a placeholder foundation
- Because the package is beyond Step 3 already, Step 8 must include doc truth-alignment rather than assuming docs are current.

---

## Step 8 Outcome

At the end of this step:

- the extension manifest does not advertise unsupported MVP behavior
- the README accurately describes the shipped Epic 1 feature set and its non-goals
- automated acceptance coverage proves the extension still activates and supports the MVP flow surface
- maintainers have a concrete manual acceptance checklist that exercises the intended MVP from empty-state through successful run
- the final validation command set passes
- the team can start the next epic without carrying forward documentation drift or ambiguous scope

**Demonstrable user flow for this step:**

1. Launch the extension in an Extension Development Host.
2. Open a workspace with `.stencil/` templates.
3. Create a template from VS Code.
4. Browse it from the tree or list Quick Pick.
5. Run it through sequential Input Boxes.
6. See the resolved prompt open in a new editor tab.
7. Open a `.stencil/**/*.md` file and confirm placeholder-aware syntax support is visible.

---

## Validation Gates

**Baseline validation before editing:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Validation during Steps 8.1 through 8.3:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Validation after automated acceptance updates land:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Final validation for Step 8 signoff:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
pnpm lint
```

**Manual validation in the Extension Development Host:**

1. Open an empty workspace and confirm commands fail with actionable empty/setup guidance rather than silent failure.
2. Open a workspace containing `.stencil/` and confirm the `Stencil Templates` view appears.
3. Run `Stencil: Create Template` and complete the MVP authoring flow.
4. Confirm the created file opens and then appears in:
   - `Stencil: List Templates`
   - the tree view
5. Run `Stencil: Run Template` for:
   - a template satisfied by defaults and `$ctx.*`
   - a template requiring sequential manual inputs
6. Confirm the resolved prompt opens in a new untitled editor tab.
7. Open a template file under `.stencil/` and confirm placeholder-aware syntax highlighting is visible.
8. Confirm no Webview, preview panel, CodeLens, diagnostics UI, or Claude Code dependency is required anywhere in the flow.

---

## Implementation Sequence

### Step 8.1 - Freeze The Epic 1 Acceptance Contract

**Objective:** define exactly what Step 8 is validating so stabilization work does not reopen scope debates during editing.

**Files:** no production edits yet

**Actions:**

1. Convert the parent Epic 1 acceptance bullets into a concrete Step 8 acceptance matrix:
   - command palette run flow
   - create flow without terminal setup
   - list flow through Quick Pick
   - sequential placeholder input
   - tree browsing
   - syntax support
   - core reuse
2. Explicitly mark non-goals for this step and reference the source of each exclusion:
   - Webviews and preview panels from architecture are out
   - confirmation and dry-run from broader Phase 2 are out for Epic 1
   - diagnostics, autocomplete, CodeLens, and Claude integration are out
3. Record the expected output target for MVP acceptance:
   - resolved prompt opens in a new editor tab
   - no cross-extension routing required
4. Decide whether command surface acceptance is based on:
   - user-facing command titles only
   - or underlying command IDs plus helper commands like `stencil.openTemplate`

**Why this matters:** Step 8 should catch drift against the Epic 1 contract, not encourage unplanned feature fill-in.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** there is one stable list of what must pass for Epic 1 and what must stay excluded.

---

### Step 8.2 - Audit Manifest And Command Surface For Unsupported Claims

**Objective:** verify that extension contributions match the shipped MVP and do not imply later-epic capabilities.

**Files to review first:**

- `packages/vscode-extension/package.json`
- `packages/vscode-extension/src/extension.ts`

**Likely files to change:**

- `packages/vscode-extension/package.json`

**Actions:**

1. Review contributed commands and ensure every user-facing command is implemented and intentional.
2. Keep helper commands only if they are required by shipped UX:
   - `stencil.openTemplate`
   - `stencil.refreshTemplatesView`
3. Confirm there are no stale contributions for unsupported features such as:
   - Webviews
   - preview commands
   - CodeLens-related commands or menus
   - diagnostics or completion contributions
   - output-target settings not actually supported in MVP
4. Check activation events for overreach:
   - keep command/view/template-file activation that supports the MVP
   - avoid introducing activation paths tied to non-MVP surfaces
5. If manifest cleanup is needed, make it subtractive and explicit rather than adding placeholder future-facing entries.

**Implementation note to lock:**

Do not rename working command IDs during stabilization unless the repo is internally inconsistent and the change is required to make acceptance truthful. Step 8 is not the place for broad command API churn.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** package contributions are truthful, bounded, and aligned to the Epic 1 MVP.

---

### Step 8.3 - Rewrite The README To Match The Shipped MVP

**Objective:** remove implementation-era drift and publish a README that describes current behavior, setup, validation, and known non-goals accurately.

**Files to change:**

- `packages/vscode-extension/README.md`

**Actions:**

1. Replace Step 3-era status language with current MVP behavior:
   - create flow is real
   - sequential placeholder prompting is real
   - tree browsing is real
   - syntax support is real
2. Document the current user-facing command set in the README:
   - Run Template
   - Create Template
   - List Templates
   - optionally mention tree open/refresh behavior as explorer features rather than headline commands
3. Describe the actual run behavior precisely:
   - command argument, active template, or Quick Pick selection path
   - unresolved placeholders collected sequentially with Input Boxes
   - resolved output opens in a new untitled Markdown editor
4. Document empty-state and first-time expectations:
   - workspace required
   - `.stencil/` bootstrap handled by create flow when applicable
5. Add an explicit non-goals or deferred-work note so users do not expect:
   - preview panels
   - dry-run mode
   - confirmation step
   - diagnostics
   - autocomplete
   - Claude Code integration
6. Ensure verification commands in the README match the actual package scripts.

**Why this matters:** the current README is materially inaccurate for the shipped state, which will make acceptance ambiguous even if the code is correct.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the README is trustworthy for a maintainer or user testing the MVP today.

---

### Step 8.4 - Add Automated Acceptance Coverage For The Shipped MVP Surface

**Objective:** strengthen tests just enough to prove the delivered MVP contract without building a second end-to-end system.

**Files to review first:**

- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/test/runTest.mjs`
- `packages/vscode-extension/test/unit/manifest.test.ts`
- existing command/provider unit tests under `packages/vscode-extension/test/unit`

**Likely files to change:**

- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/test/runTest.mjs`
- `packages/vscode-extension/test/unit/manifest.test.ts`
- selected command/provider/service unit tests as needed

**Likely files to add:**

- one or more fixture workspaces under `packages/vscode-extension/test/fixtures/` if current fixtures are too narrow for acceptance coverage

**Actions:**

1. Keep the smoke layer focused on acceptance-critical behavior only:
   - extension activates
   - commands are contributed
   - tree view can exist in a real workspace
   - template file language mapping works
2. Decide what belongs in smoke versus unit tests:
   - smoke for host-level wiring
   - unit tests for run/create/list/tree logic branches
3. Fill any acceptance gaps in unit coverage, especially if not already asserted:
   - create flow success path
   - sequential placeholder input success path
   - actionable empty-state handling
   - tree refresh or open-template behavior if relied on by acceptance
4. Avoid writing brittle UI automation that depends on fine-grained VS Code interaction timing when a unit test can prove the same contract more reliably.
5. Keep the test harness aligned with current scripts:
   - `pnpm --filter stencil-vscode test`
   - no separate one-off acceptance runner unless there is a strong reason

**Implementation note to lock:**

Step 8 should increase confidence, not add a flaky pseudo-E2E suite. Prefer narrow smoke coverage plus strong command/provider unit coverage.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Completion gate:** automated tests cover the practical MVP acceptance surface without depending on unsupported UX.

---

### Step 8.5 - Add A Maintainer-Facing Manual Acceptance Checklist

**Objective:** create an explicit human verification path for the parts of the MVP that are best confirmed in a live Extension Development Host.

**Files to change:**

- `packages/vscode-extension/README.md`

**Optional additional file if the checklist would be too long for the README:**

- `packages/vscode-extension/docs/manual-acceptance.md`

**Actions:**

1. Write a short, ordered checklist that a maintainer can execute in one session:
   - empty workspace behavior
   - first-time create path
   - list flow
   - run flow with defaults/context only
   - run flow with sequential input
   - tree browse flow
   - syntax highlighting check
2. Tie each checklist item to an observable result:
   - message appears
   - file opens
   - template appears in tree
   - output appears in new editor
3. Keep the checklist scoped to Epic 1 behavior only.
4. Add one explicit leak check at the end:
   - no Webview
   - no preview
   - no CodeLens
   - no diagnostics UI
   - no Claude extension dependency

**Why this matters:** the parent Step 8 already calls for a manual verification checklist; this step turns that into a reusable artifact rather than an implied expectation.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** a maintainer can execute the acceptance pass without reconstructing expectations from multiple planning docs.

---

### Step 8.6 - Run The Full Validation Matrix And Triage Any Drift

**Objective:** execute the final quality gate for Epic 1 and fix only issues that block truthful MVP acceptance.

**Files:** depends on findings

**Actions:**

1. Run the full Step 8 validation set:
   - core tests
   - extension typecheck
   - extension tests
   - extension build
   - repo lint
2. If a failure appears, classify it before editing:
   - documentation drift
   - manifest drift
   - acceptance gap in tests
   - real MVP behavior regression
3. Fix only issues required to restore the Epic 1 contract.
4. Reject opportunistic scope expansion that surfaces during cleanup, even if adjacent code looks unfinished.
5. Re-run the full validation matrix after each blocking fix set rather than stacking many unverified changes.

**Implementation note to lock:**

If validation reveals a bug in a shipped MVP flow, fix it here. If validation only reveals an unshipped future feature, document it as deferred instead of implementing it.

**Validation:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
pnpm lint
```

**Completion gate:** all automated quality gates pass and any remaining gaps are explicitly documented as out of scope rather than silently ignored.

---

### Step 8.7 - Execute One Manual Smoke Pass And Record The Result

**Objective:** confirm the MVP feels coherent in the real extension host and is not only test-green.

**Files to change if desired:**

- `packages/vscode-extension/README.md`
- or a short release/verification note if the repo has an existing location for it

**Actions:**

1. Launch the Extension Development Host against a workspace with real `.stencil/` content.
2. Execute the manual acceptance checklist end to end.
3. Record any deviations between expected and observed behavior while the context is fresh.
4. If the environment allows, run the smoke pass on one additional OS beyond the primary dev environment:
   - macOS or Linux
5. If cross-OS confirmation is not available, document that limitation instead of implying broader manual coverage than was actually performed.

**Why this matters:** Step 8 should leave a credible statement of what was manually verified, not just what was intended.

**Validation:**

Use the manual checklist plus:

```bash
pnpm --filter stencil-vscode test
```

**Completion gate:** one real-host smoke pass has been completed and its scope is documented honestly.

---

## Final Acceptance Checklist

- `Stencil: Run Template` works from the Command Palette.
- `Stencil: Create Template` works without terminal setup.
- `Stencil: List Templates` shows templates in a Quick Pick.
- unresolved placeholders are collected sequentially through Input Boxes.
- the sidebar Tree View shows collections and templates for browsing.
- template files under `.stencil/` resolve to the `stencil-template` language and show placeholder-aware syntax support.
- the extension depends on `@stencil-pm/core` for template discovery, creation, and resolution behavior rather than duplicating core logic.
- the manifest does not advertise unsupported MVP UI surfaces.
- the README documents the actual shipped MVP behavior and explicitly names key non-goals.
- no Webview, preview panel, CodeLens, diagnostics UI, autocomplete, or Claude Code dependency is required for the Epic 1 flow to succeed.
- the final validation matrix passes.

---

## Suggested File Touch List

Most likely:

- `packages/vscode-extension/package.json`
- `packages/vscode-extension/README.md`
- `packages/vscode-extension/test/unit/manifest.test.ts`
- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/test/runTest.mjs`

Possible, only if acceptance gaps require it:

- `packages/vscode-extension/test/unit/commands/*.test.ts`
- `packages/vscode-extension/test/unit/providers/*.test.ts`
- `packages/vscode-extension/test/unit/services/*.test.ts`
- `packages/vscode-extension/test/fixtures/*`

Unlikely and should require a clear reason:

- `packages/vscode-extension/src/extension.ts`
- production command/provider/service code

If production code changes become necessary during Step 8, they should be justified as MVP regression fixes, not feature additions.

---

## Risks And Mitigations

### 1. README and product scope drift are larger than expected

**Risk:** user-facing docs may still reflect intermediate steps or broader architecture ideas.

**Mitigation:** treat the Epic 1 parent plan as the acceptance source of truth and rewrite docs to that narrower contract.

### 2. Smoke coverage may tempt full UI automation

**Risk:** Step 8 could balloon into brittle UI scripting.

**Mitigation:** keep smoke tests host-level and move most behavior verification into unit tests.

### 3. Validation may surface real MVP regressions late

**Risk:** a final acceptance pass can reveal behavioral bugs after most step work appears complete.

**Mitigation:** allow Step 8 to fix blocking MVP regressions, but require each fix to map directly to a listed acceptance criterion.

### 4. Architecture and PRD references may pressure scope creep

**Risk:** broader VS Code concepts in source docs can be mistaken for Epic 1 obligations.

**Mitigation:** explicitly prefer the locked Epic 1 decisions and reject later-phase UX unless required for a documented MVP flow.

---

## Exit Criteria

Step 8 is complete when:

- Epic 1 acceptance is documented in one place and matches the actual extension behavior
- the extension package docs and manifest are truthful
- automated validation is green
- one manual acceptance pass has been executed or its environmental limitation has been documented
- no Phase 3+ or Epic 5+ UX dependency is required for the MVP to function
