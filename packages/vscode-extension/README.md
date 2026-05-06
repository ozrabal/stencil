# Stencil Template Manager — VS Code Extension

VS Code adapter for Stencil template management.

## Overview

This extension integrates Stencil template operations into VS Code via commands and a sidebar tree view. It delegates business logic to `@stencil-pm/core`.

## Commands

| Command                  | Description                             |
| ------------------------ | --------------------------------------- |
| Stencil: Run Template    | Render a template with resolved context |
| Stencil: Create Template | Create a new template                   |
| Stencil: List Templates  | Browse all available templates          |

## Status

This package now provides the Epic 1 Step 3 foundation:

- the extension activates from its declared commands and tree view
- one `Stencil` instance is cached per resolved workspace root
- VS Code context keys are registered into the core context engine
- command failures flow through shared VS Code message handling
- `Stencil: List Templates` shows a grouped Quick Pick backed by core template discovery
- selecting a template from the Quick Pick opens the source `.md` file in the editor
- `Stencil: Run Template` resolves a template from a command argument, the active template file, or a Quick Pick fallback
- templates that need no manual input, or are satisfied by defaults and `$ctx.*` values, open resolved output in a new untitled Markdown editor
- templates that still require placeholder input stop with an informational message instead of opening partial output
- the tree view is wired as a placeholder foundation, not full browsing UX

`Stencil: Run Template` is now a real no-input execution flow after workspace and `.stencil/`
checks. `Stencil: Create Template` still returns an intentional foundation-state message and is
deferred to a later Epic 1 step. Sequential placeholder prompting is intentionally deferred to the
next execution step.

## Verification

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

## Run In VS Code

Build the extension first:

```bash
pnpm --filter stencil-vscode build
```

Then run it in one of these ways:

```bash
# From the repo root, open VS Code and press F5
code .
```

Use the `Run Stencil VS Code Extension` launch configuration from
`.vscode/launch.json`. This opens an
Extension Development Host that stays open so you can inspect the command palette and the
`Stencil Templates` explorer view.

You can also launch a development host directly from the terminal:

```bash
code \
  --extensionDevelopmentPath=packages/vscode-extension \
  .
```

Open a workspace that contains a `.stencil/` directory if you want the current command and tree
flows to run through the implemented workspace checks. With that setup in place, run
`Stencil: List Templates` from the Command Palette to browse templates grouped by collection and
open the selected template file.

Run `Stencil: Run Template` from the Command Palette to execute a template. The command first uses
an explicit template target when invoked with one, otherwise it tries the active `.stencil/`
template file, then falls back to a grouped Quick Pick. If resolution succeeds without manual
placeholder entry, the resolved prompt opens in a new untitled Markdown editor.

## Deferred Work

This step does not implement manual placeholder prompting, template creation forms, syntax
contributions, diagnostics, alternate output targets, or Claude Code integration.
