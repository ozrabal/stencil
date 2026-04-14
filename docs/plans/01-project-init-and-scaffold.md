# Plan: Project Initialization & Base Scaffold

**Status:** Pending confirmation
**Phase:** Pre-Phase 1 (foundation)
**Scope:** Monorepo setup, development environment, base package structure

---

## Overview

Set up the Stencil monorepo with all packages, tooling, and development environment so that feature implementation can begin immediately. No business logic is implemented at this stage — only structure and tooling.

---

## 1. Repository Root Setup

### 1.1 Package manager & workspace

Use **pnpm** with native workspaces. Rationale: best-in-class monorepo support, fast installs, strict dependency isolation between packages, widely adopted in TypeScript ecosystems.

**Files to create:**

- `package.json` — root manifest, workspace scripts
- `pnpm-workspace.yaml` — declares `packages/*`
- `.nvmrc` / `.node-version` — pin Node.js version (LTS, currently 22.x)
- `.npmrc` — pnpm configuration (`shamefully-hoist=false`, `strict-peer-dependencies=false`)

### 1.2 Task runner

Use **Turborepo** for orchestrating builds, tests, and linting across packages. Rationale: understands dependency graph between packages, caches task outputs, supports parallel execution, standard choice for pnpm monorepos.

**Files to create:**

- `turbo.json` — pipeline definition (build, test, lint, typecheck)

### 1.3 TypeScript base config

**Files to create:**

- `tsconfig.base.json` — shared TS settings (strict mode, `moduleResolution: "bundler"`, `target: "ES2022"`, `lib: ["ES2022"]`)

Each package extends this with its own `tsconfig.json`.

### 1.4 Code quality tooling

| Tool | Purpose |
| ------ | --------- |
| **ESLint** (flat config, v9) | Linting — `typescript-eslint`, `eslint-plugin-prettier/recommended`, `eslint-plugin-perfectionist` |
| **Prettier** | Formatting — integrated via `eslint-plugin-prettier` (no separate format step) |
| **Lefthook** | Git hooks — faster alternative to Husky, single YAML config |
| **lint-staged** | Run linters only on staged files |
| **commitlint** | Enforce Conventional Commits format |

**ESLint plugins & rules (mirrors mentor-api config):**

- `@eslint/js` — base recommended rules
- `typescript-eslint` — `recommendedTypeChecked` (type-aware linting via `parserOptions.project`)
- `eslint-plugin-prettier/recommended` — Prettier as an ESLint rule; replaces standalone `prettier --write` in lint pipeline
- `eslint-plugin-perfectionist` — `recommended-natural` preset for consistent import/export/object sorting
- Key rule overrides:
  - `perfectionist/sort-classes`: off, `perfectionist/sort-modules`: off
  - `@typescript-eslint/explicit-function-return-type`: off
  - `@typescript-eslint/explicit-module-boundary-types`: off
  - `@typescript-eslint/no-explicit-any`: off
  - `@typescript-eslint/no-floating-promises`: warn
  - `@typescript-eslint/no-unsafe-argument`: warn
  - `@typescript-eslint/no-unsafe-assignment`: off
  - `@typescript-eslint/no-unused-vars`: error (ignore `_`-prefixed names)
- Test file overrides (`**/*.test.ts`, `**/*.spec.ts`, `test/**/*.ts`): relax unsafe-* rules, unbound-method, require-await, perfectionist sort rules

**Files to create:**

- `eslint.config.mjs` — flat ESLint config (as above)
- `.prettierrc` — Prettier config (2-space indent, single quotes, trailing commas)
- `.prettierignore`
- `commitlint.config.mjs`
- `lefthook.yml` — defines `pre-commit` (lint-staged) and `commit-msg` (commitlint) hooks

### 1.5 Testing framework

Use **Vitest** across all packages. Rationale: native ESM support, compatible with TypeScript without transpile step, fast, Jest-compatible API (no migration cost later), excellent monorepo support via workspaces config.

**Files to create:**

- `vitest.workspace.ts` — root workspace config pointing to each package's vitest config

### 1.6 Changesets (version management)

Use **Changesets** for versioning and changelog generation. Rationale: designed for monorepos, integrates with pnpm workspaces, generates per-package changelogs, standard for publishable packages.

**Files to create:**

- `.changeset/config.json`

### 1.7 Root scripts

Defined in root `package.json`:

```json
{
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "clean": "turbo run clean"
  }
}
```

---

## 2. Package Scaffolds

### 2.1 `packages/core` — `@stencil-pm/core`

The portable, zero-tool-dependency TypeScript library.

**Dependencies:**

- `yaml` — only runtime dependency (YAML frontmatter parsing)

**Dev dependencies:**

- `typescript`, `vitest`, `@types/node`

**Directory structure:**

```text
packages/core/
  src/
    types.ts          # All shared type definitions (from architecture doc)
    parser.ts         # Template file parsing stub
    validator.ts      # Validation logic stub
    resolver.ts       # Placeholder resolution stub
    storage.ts        # StorageProvider interface + LocalStorage stub
    collections.ts    # Collection management stub
    context.ts        # ContextProvider interface + built-in resolvers stub
    index.ts          # Public API re-exports
  test/
    parser.test.ts    # Placeholder test file
    validator.test.ts
    resolver.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
```

**`package.json` key fields:**

```json
{
  "name": "@stencil-pm/core",
  "version": "0.0.1",
  "type": "module",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  }
}
```

### 2.2 `packages/claude-code-plugin`

The Claude Code adapter. Contains Skills and shell scripts. No separate npm publish (consumed as a plugin).

**Directory structure:**

```text
packages/claude-code-plugin/
  .claude-plugin/
    plugin.json             # Plugin manifest
  skills/
    stencil/
      SKILL.md              # Main router — dispatches to sub-skills
    stencil-init/
      SKILL.md
    stencil-create/
      SKILL.md
    stencil-list/
      SKILL.md
    stencil-show/
      SKILL.md
    stencil-run/
      SKILL.md
    stencil-delete/
      SKILL.md
  scripts/
    resolve-template.sh     # Stub: calls core CLI
    validate-template.sh    # Stub: calls core CLI
    detect-context.sh       # Stub: environment variable detection
  package.json              # No publish; workspace member for tooling
  README.md
```

All SKILL.md files at this stage contain only the frontmatter stub and a `# TODO` body — no business logic.

### 2.3 `packages/vscode-extension` — `stencil-vscode`

The VS Code adapter. Scaffolded but empty beyond the manifest.

**Dependencies:**

- `@stencil-pm/core` (workspace reference)

**Dev dependencies:**

- `@types/vscode`, `@vscode/test-electron`, `esbuild`, `vsce`

**Directory structure:**

```text
packages/vscode-extension/
  src/
    extension.ts            # activate/deactivate stubs
    core/
      index.ts              # re-exports from @stencil-pm/core
    providers/
      templateTreeProvider.ts
      contextResolver.ts
    commands/
      runTemplate.ts
      createTemplate.ts
      listTemplates.ts
  package.json              # VS Code extension manifest
  tsconfig.json
  esbuild.mjs               # Build script
  .vscodeignore
  README.md
```

### 2.4 `packages/codex-adapter`

Minimal scaffold only (Phase 4+ in roadmap). Contains `AGENTS.md` placeholder and a stub shell script.

**Directory structure:**

```text
packages/codex-adapter/
  AGENTS.md                 # Stub Codex instructions
  scripts/
    run-template.sh         # Stub
  README.md
```

---

## 3. Root Project Files

| File | Purpose |
| ------ | --------- |
| `README.md` | Project overview, quick start (update existing) |
| `LICENSE` | MIT license |
| `CONTRIBUTING.md` | Contribution guide (conventional commits, PR process) |
| `CHANGELOG.md` | Managed by Changesets |
| `.gitignore` | Standard Node/TS ignores + dist, .env |
| `.editorconfig` | Consistent editor settings |
| `docs/` | Existing docs (no change) |

---

## 4. CI / GitHub Actions

Scaffold a basic CI pipeline:

```text
.github/
  workflows/
    ci.yml              # On PR: lint, typecheck, test all packages
    release.yml         # On push to main: Changesets release action
```

`ci.yml` steps:

1. Checkout
2. Setup Node.js (LTS) + pnpm
3. Install dependencies (`pnpm install --frozen-lockfile`)
4. `pnpm turbo run typecheck lint test`

---

## 5. Implementation Order

Tasks are ordered to unblock subsequent ones:

1. **Root scaffold** — `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `LICENSE`, `.editorconfig`
2. **Code quality tooling** — ESLint, Prettier, Lefthook, commitlint, lint-staged
3. **`packages/core` scaffold** — types, stubs, vitest, build config
4. **`packages/claude-code-plugin` scaffold** — SKILL.md stubs, shell script stubs, plugin.json
5. **`packages/vscode-extension` scaffold** — extension.ts stub, package.json manifest
6. **`packages/codex-adapter` scaffold** — AGENTS.md, script stubs
7. **CI workflows** — GitHub Actions
8. **Changesets init** — `.changeset/config.json`
9. **Install & verify** — `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint` all pass

---

## 6. Technology Decisions Summary

| Area | Choice | Rationale |
| ------ | -------- | ----------- |
| Package manager | pnpm | Best monorepo support, strict isolation, fast |
| Task orchestration | Turborepo | Dependency-aware, caches, standard for pnpm monorepos |
| Language | TypeScript (strict) | Type safety, aligns with VS Code extension API |
| Testing | Vitest | Native ESM, fast, Jest-compatible, excellent TS support |
| Linting | ESLint v9 flat config + typescript-eslint + perfectionist + prettier | Modern, performant, TS-aware; perfectionist enforces consistent ordering |
| Formatting | Prettier via eslint-plugin-prettier | Integrated into ESLint pipeline; no separate format tool invocation needed |
| Git hooks | Lefthook + lint-staged | Faster than Husky, single YAML config, no shell script files |
| Commit convention | Conventional Commits + commitlint | Required for Changesets automation |
| Versioning | Changesets | Designed for pnpm monorepos, per-package changelogs |
| Build (core) | `tsc` | Sufficient for a library with no bundling needs |
| Build (VS Code) | esbuild | Required by VS Code extension tooling, fast |
| CI | GitHub Actions | Standard OSS choice |
| YAML parsing | `yaml` (npm) | Only runtime dependency of core; battle-tested |

---

## Conventional Commit Message

```text
chore: initialize monorepo scaffold with tooling and package stubs

Set up pnpm workspace, Turborepo pipeline, TypeScript base config,
ESLint/Prettier/Lefthook/commitlint tooling, Vitest workspace, and
Changesets. Scaffold all four packages (core, claude-code-plugin,
vscode-extension, codex-adapter) with directory structure and stubs.
Add GitHub Actions CI/release workflows.

No business logic is implemented — this commit establishes the
development environment and structure ready for Phase 1 implementation.
```
