# Plan: Epic 1 Step 7 — Basic Template Syntax Support

**Goal:** Add intentionally minimal VS Code language support for Stencil template files so `.stencil/**/*.md` authoring is easier in the MVP: templates should still read like Markdown, while `{{placeholder}}` and `{{$ctx.*}}` tokens become visually distinct and file association is limited to Stencil templates only.

**Primary inputs:**

- `docs/plans/15-epic-1-vscode-extension-mvp.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `packages/vscode-extension/*`

**This document plans Step 7 only.** It does not implement autocomplete, diagnostics, CodeLens, editor decorations, semantic tokens, Webviews, preview panels, custom editors, typed placeholder UX, remote templates, or Claude Code integration.

---

## Locked Scope For This Step

These decisions from `15-epic-1-vscode-extension-mvp.md` must remain true while implementing this step:

- Keep Epic 1 on the Phase 2 MVP surface only.
- Keep syntax support intentionally minimal.
- Preserve Markdown readability.
- Scope the feature to template files under `.stencil/` only.
- Do not pull diagnostics, autocomplete, semantic analysis, CodeLens, or preview work forward.
- Keep orchestration simple and extension-local; this step is a manifest/grammar addition, not a new runtime subsystem.

Additional Step 7 decisions to lock before editing:

- Use a grammar-based approach, not runtime editor decorations. The parent epic already prefers a small TextMate grammar over ad hoc highlighting.
- Use one dedicated Stencil template language id for `.stencil/**/*.md` files so ordinary Markdown files remain untouched.
- Reuse Markdown as the base language behavior instead of inventing a custom editor model. The added grammar should layer placeholder token scopes onto a Markdown-like experience.
- Stop at token recognition for:
  - YAML frontmatter fences
  - `{{placeholder}}`
  - `{{$ctx.*}}`
- Do not add bracket completion, snippets, rename support, hover text, validation, or placeholder extraction logic in this step.

### Critical contract decision to lock before editing

The architecture document mentions richer VS Code authoring surfaces later, including:

- editor decorations
- diagnostics
- autocomplete
- CodeLens
- Webview forms

The parent Epic 1 plan explicitly rejects those for Step 7 and narrows the requirement to basic syntax support only.

**Recommended lock for Step 7:** implement a single, path-scoped language contribution plus one minimal TextMate grammar. Treat any richer authoring behavior as future work even if it appears easy while editing the manifest.

---

## Repo Facts That Affect The Plan

- `packages/vscode-extension/package.json` currently contributes:
  - commands
  - Explorer view wiring
  - activation events
  - no `languages` contribution
  - no `grammars` contribution
- `packages/vscode-extension/` currently has no:
  - `syntaxes/` directory
  - `language-configuration.json`
  - template-specific fixture workspace for smoke validation
- The extension already has a working test/build baseline:
  - `pnpm --filter stencil-vscode typecheck`
  - `pnpm --filter stencil-vscode build`
  - `pnpm --filter stencil-vscode test`
- `packages/vscode-extension/test/smoke/extension.test.mjs` currently verifies activation and contributed commands only. It does not verify language/file association yet.
- `packages/vscode-extension/test/runTest.mjs` currently launches a single empty fixture workspace:
  - `test/fixtures/workspace-empty`
- The current extension runtime does not need new activation code for this step. Syntax support should come from manifest contributions and bundled grammar assets.
- Step 6 infrastructure is already present:
  - real tree provider
  - `stencil.openTemplate`
  - `stencil.refreshTemplatesView`
  - real command registration in `src/extension.ts`
- This step should not require any `@stencil-pm/core` changes. Placeholder highlighting is editor-facing only.

---

## Step 7 Outcome

At the end of this step:

- opening a file under `.stencil/**/*.md` resolves to a Stencil-specific language id
- ordinary Markdown files outside `.stencil/` continue to use normal Markdown behavior
- `{{placeholder}}` tokens are visibly distinct from surrounding prompt text
- `{{$ctx.*}}` tokens are also visibly distinct, ideally with slightly more specific scoping than generic placeholders
- YAML frontmatter remains readable and does not regress basic Markdown authoring
- the extension test suite includes at least one assertion for manifest/file association presence
- manual verification in the Extension Development Host can confirm the scopes are applied to a real template file

**Demonstrable user flow for this step:**

1. Open a workspace that contains `.stencil/templates/example.md`.
2. Open the template in the editor.
3. Confirm the file is recognized as the Stencil template language rather than generic Markdown.
4. Confirm `{{placeholder}}` and `{{$ctx.*}}` are visually distinguished from the rest of the prompt body.
5. Open a normal project `README.md` outside `.stencil/` and confirm it still behaves like ordinary Markdown.

---

## Validation Gates

**Baseline validation before editing:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Validation during Steps 7.1 through 7.3:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Validation after manifest/tests/fixtures land:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Manual validation in the Extension Development Host:**

1. Open a workspace with `.stencil/templates/example.md` containing frontmatter, `{{placeholder}}`, and `{{$ctx.project_name}}`.
2. Confirm the editor language mode resolves to the new Stencil template language id.
3. Confirm placeholder tokens are colorized separately from plain Markdown text.
4. Run `Developer: Inspect Editor Tokens and Scopes` on:
   - a `{{placeholder}}` token
   - a `{{$ctx.project_name}}` token
   - frontmatter content
5. Confirm a non-Stencil `README.md` remains plain Markdown and is not rebound to the Stencil language.
6. Open the same template from the `Stencil Templates` tree and confirm the file association is still correct when navigated through extension commands.

---

## Implementation Sequence

### Step 7.1 — Freeze The Language Strategy And File-Matching Contract

**Objective:** lock the smallest viable implementation shape before touching `package.json`, so Step 7 does not accidentally grow into general Markdown tooling.

**Files:** no production edits yet

**Actions:**

1. Lock the language contribution strategy:
   - one dedicated language id, for example `stencil-template`
   - one TextMate grammar file
   - optional minimal language configuration file only if needed for clean packaging and editor behavior
2. Lock the file matching strategy:
   - apply only to `.md` files under `.stencil/`
   - do not claim every Markdown file in the workspace
3. Lock the token scope strategy:
   - generic placeholder token for `{{name}}`
   - more specific context token for `{{$ctx.name}}`
   - no semantic understanding beyond token matching
4. Lock the Markdown preservation rule:
   - reuse Markdown as the base grammar or language behavior
   - avoid replacing the whole editing experience with a non-Markdown grammar model
5. Lock the testing strategy:
   - automated check for manifest/file association
   - automated smoke check for language id on a real fixture file
   - manual scope inspection for actual token coloring

**Why this matters:** the riskiest failure mode in this step is accidentally hijacking normal Markdown files or overbuilding language features that belong to later epics.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the team has one explicit contract for language id, scope boundaries, and what “basic syntax support” does not include.

---

### Step 7.2 — Add Manifest-Level Language And Grammar Contributions

**Objective:** wire the extension manifest so VS Code can recognize Stencil template files and load bundled grammar assets.

**Files to change:**

- `packages/vscode-extension/package.json`

**Files to add:**

- `packages/vscode-extension/syntaxes/stencil-template.tmLanguage.json`
- `packages/vscode-extension/language-configuration.json`

**Actions:**

1. Add a `contributes.languages` entry for the Stencil template language:
   - stable language id
   - human-readable alias
   - path-scoped file association for `.stencil/**/*.md`
   - configuration file path if one is included
2. Add a `contributes.grammars` entry that points at the new TextMate grammar asset.
3. Keep the grammar contribution packaging-local:
   - bundled inside the extension
   - no runtime downloads
   - no dependency on another extension’s grammar
4. Keep the language configuration minimal:
   - only add settings that clearly help and do not change MVP scope
   - avoid speculative smart editing features
5. Confirm the manifest still reflects the Step 7 scope:
   - no completion provider contributions
   - no diagnostics-related configuration
   - no new commands

**Implementation note to lock:**

The manifest should prefer path-based file association over broad `.md` ownership. If a direct path-scoped association proves insufficient in practice, stop and reassess before falling back to a wider Markdown override.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the extension declares a bounded Stencil template language and bundles the assets needed to load it.

---

### Step 7.3 — Author The Minimal TextMate Grammar

**Objective:** implement the smallest grammar that gives visible placeholder-aware syntax without turning Step 7 into a full language project.

**Files to change:**

- `packages/vscode-extension/syntaxes/stencil-template.tmLanguage.json`
- `packages/vscode-extension/language-configuration.json`

**Actions:**

1. Build the grammar around Markdown readability first:
   - use Markdown-like base scopes or inclusion strategy
   - make sure ordinary prompt text still tokenizes sensibly
2. Add placeholder matching for standard template variables:
   - `{{placeholder_name}}`
   - simple names only; do not attempt advanced expression parsing
3. Add a more specific rule for context placeholders:
   - `{{$ctx.project_name}}`
   - scope `$ctx` placeholders distinctly from generic placeholders if practical
4. Ensure frontmatter remains readable:
   - keep YAML fence handling visible
   - avoid breaking the first `---` / closing `---` structure visually
5. Keep the rule set intentionally narrow:
   - no nested expression grammar
   - no validation of declared vs undeclared placeholders
   - no delimiter configurability support in the editor yet, even though core supports custom delimiters

### Important scope guard for Step 7.3

Do not try to make the grammar delimiter-aware with `placeholderStart` / `placeholderEnd` from runtime config. The parent Epic 1 Step 7 requirement is specifically basic `{{...}}` support. Config-aware authoring belongs to later work if needed.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the grammar can visually distinguish generic placeholders and `$ctx` placeholders in a real Stencil template file.

---

### Step 7.4 — Add Fixture Coverage And Automated Assertions

**Objective:** cover the parts of Step 7 that can be tested reliably in CI without trying to assert theme-specific colors.

**Files to add:**

- `packages/vscode-extension/test/fixtures/workspace-syntax/.stencil/templates/example.md`
- optional fixture README if needed for clarity

**Files to change:**

- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/test/runTest.mjs`
- `packages/vscode-extension/test/unit/extension.test.ts`

**Actions:**

1. Add a real fixture template file that contains:
   - valid frontmatter
   - at least one `{{placeholder}}`
   - at least one `{{$ctx.*}}`
2. Extend smoke coverage to open that file and assert at least:
   - the document opens successfully
   - the language id is the new Stencil template id
3. Add a lightweight unit assertion around activation or manifest expectations:
   - the extension still registers normally
   - the Step 7 manifest additions are present in `package.json` or exported test constants if that is the repo’s preferred style
4. Keep the automated assertions structural:
   - do not test specific colors
   - do not depend on a particular theme
   - do not attempt deep tokenization snapshots unless they are already proven stable in this repo

**Why this matters:** Step 7 is mostly manifest and grammar wiring. Without a fixture-backed check, it is easy to ship a grammar file that exists on disk but is never actually associated with Stencil templates.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Completion gate:** CI can prove the language contribution is wired and reachable from an actual `.stencil/` file.

---

### Step 7.5 — Document The Behavior And Run The Acceptance Pass

**Objective:** close the step cleanly and make the new syntax support discoverable without overstating what shipped.

**Files to change:**

- `packages/vscode-extension/README.md`
- optional note in `docs/plans/15-epic-1-vscode-extension-mvp.md` only if the project wants a cross-link after implementation

**Actions:**

1. Update the VS Code extension README to describe exactly what Step 7 adds:
   - Stencil template files under `.stencil/` get basic placeholder-aware syntax support
   - ordinary Markdown files are unaffected
2. Explicitly note what is still deferred:
   - autocomplete
   - diagnostics
   - richer authoring features
3. Run a final acceptance pass in the Extension Development Host using the manual checklist from this plan.
4. Confirm the change did not require any core package edits or runtime command changes.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Completion gate:** Step 7 is documented, test-backed, and clearly bounded to MVP syntax support only.

---

## Files Most Likely To Change

**Expected updates:**

- `packages/vscode-extension/package.json`
- `packages/vscode-extension/README.md`
- `packages/vscode-extension/test/runTest.mjs`
- `packages/vscode-extension/test/smoke/extension.test.mjs`
- `packages/vscode-extension/test/unit/extension.test.ts`

**Expected new files:**

- `packages/vscode-extension/syntaxes/stencil-template.tmLanguage.json`
- `packages/vscode-extension/language-configuration.json`
- `packages/vscode-extension/test/fixtures/workspace-syntax/.stencil/templates/example.md`

---

## Risks And Guardrails

### 1. Path-scoped language association may be trickier than command/view work

Guardrail:
verify the actual opened document `languageId` in smoke/manual testing before considering the step complete.

### 2. A custom grammar can accidentally degrade normal Markdown readability

Guardrail:
keep the grammar narrow and inspect both Stencil template files and ordinary project Markdown files during manual validation.

### 3. It is easy to overbuild this into general language tooling

Guardrail:
if an implementation idea requires diagnostics, completion, runtime config awareness, or editor services, stop and defer it to a later epic.

### 4. Theme differences can hide whether scopes are truly working

Guardrail:
use `Developer: Inspect Editor Tokens and Scopes` as the source of truth, not just color perception.

---

## Acceptance Checklist

- `.stencil/**/*.md` files open with the Stencil template language id.
- Files outside `.stencil/` are not rebound away from normal Markdown.
- `{{placeholder}}` tokens are distinguishable from plain body text.
- `{{$ctx.*}}` tokens are distinguishable from generic body text.
- The extension build and tests remain green.
- No autocomplete, diagnostics, CodeLens, decorations, or preview features were added.
