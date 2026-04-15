# Stencil

A monorepo for Stencil template management across multiple adapters (Claude Code, VS Code, Codex).

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9

## Getting started

```bash
# Install all workspace dependencies
pnpm install

# Install git hooks (runs automatically after pnpm install via lefthook postinstall)
pnpm exec lefthook install
```

## Development commands

All commands run across all packages via Turborepo unless you `cd` into a specific package.

| Command             | Description                      |
| ------------------- | -------------------------------- |
| `pnpm build`        | Build all packages               |
| `pnpm test`         | Run all tests                    |
| `pnpm lint`         | Lint all packages                |
| `pnpm typecheck`    | Type-check all packages          |
| `pnpm format`       | Format all files with Prettier   |
| `pnpm format:check` | Check formatting without writing |
| `pnpm clean`        | Remove all build artifacts       |

### Running a single package

```bash
# From the repo root, scope a command to one package
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode build

# Or cd into the package directly
cd packages/core
pnpm test
```

### Watch mode (tests)

```bash
cd packages/core
pnpm exec vitest
```

## Packages

| Package                       | Name               | Description                                               |
| ----------------------------- | ------------------ | --------------------------------------------------------- |
| `packages/core`               | `@stencil-pm/core` | Portable TypeScript library — parser, validator, resolver |
| `packages/claude-code-plugin` | —                  | Claude Code adapter (Skills + shell scripts)              |
| `packages/vscode-extension`   | `stencil-vscode`   | VS Code extension adapter                                 |
| `packages/codex-adapter`      | —                  | Codex adapter (Phase 4+, stub only)                       |

## Project structure

```text
stencil/
├── packages/
│   ├── core/                  # @stencil-pm/core
│   ├── claude-code-plugin/    # Claude Code Skills
│   ├── vscode-extension/      # VS Code extension
│   └── codex-adapter/         # Codex adapter (stub)
├── .github/workflows/         # CI and release pipelines
├── .changeset/                # Changesets config
├── turbo.json                 # Turborepo pipeline
├── pnpm-workspace.yaml        # pnpm workspace config
└── tsconfig.base.json         # Shared TypeScript config
```

## Developing

### Day-to-day workflow

**`packages/core`** (where Phase 1 logic goes):

```bash
cd packages/core
pnpm exec vitest          # watch mode — tests re-run on save
```

Implement the stubs in `src/`, fill in the placeholder tests in `test/`.

**`packages/claude-code-plugin`** (Skills):
Edit `skills/*/SKILL.md` and `scripts/*.sh` directly. No build step — consumed by Claude Code as-is.

**`packages/vscode-extension`**:

```bash
cd packages/vscode-extension
pnpm build                # esbuild bundles src/ → dist/
# Then press F5 in VS Code to launch Extension Development Host
```

### Before committing

Lefthook runs automatically on `git commit`:

- **pre-commit** — lint-staged lints and formats only staged files
- **commit-msg** — commitlint enforces [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.)

### Recommended implementation order (Phase 1)

All Phase 1 logic goes into `packages/core`:

1. `src/parser.ts` — YAML frontmatter parsing using the `yaml` package
2. `src/validator.ts` — validate parsed templates
3. `src/resolver.ts` — `{{placeholder}}` substitution
4. `src/storage.ts` — filesystem read/write via `fs/promises`
5. `src/context.ts` — fill in `GitContextProvider`
6. Wire into `packages/claude-code-plugin` skills once core is solid

## Versioning

This project uses [Changesets](https://github.com/changesets/changesets). To create a changeset before merging a PR:

```bash
pnpm changeset
```
