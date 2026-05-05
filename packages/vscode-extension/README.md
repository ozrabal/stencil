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

This package now provides the Epic 1 Step 1 foundation:

- the extension activates from its declared commands and tree view
- one `Stencil` instance is cached per resolved workspace root
- VS Code context keys are registered into the core context engine
- command failures flow through shared VS Code message handling
- the tree view is wired as a placeholder foundation, not full browsing UX

The three contributed commands currently return intentional foundation-state messages after
workspace and `.stencil/` checks. Real listing, creation, and execution flows are deferred to later
Epic 1 steps.

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
placeholder flows to run through the implemented workspace checks.

## Deferred Work

This step does not implement Quick Pick browsing, template execution output, template creation
forms, syntax contributions, diagnostics, or Claude Code integration.
