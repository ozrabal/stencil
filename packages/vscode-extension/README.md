# Stencil Template Manager — VS Code Extension

VS Code adapter for the shipped Stencil MVP. This package keeps template logic in `@stencil-pm/core` and exposes a narrow VS Code surface around it.

## MVP Surface

- `Stencil: Run Template`
- `Stencil: Create Template`
- `Stencil: List Templates`
- `Stencil Templates` Explorer view for browsing collections and templates
- `.stencil/**/*.md` language mapping with placeholder-aware syntax highlighting

The extension does not require terminal setup for normal MVP use. `Create Template` bootstraps `.stencil/` on first use when needed.

## Command Behavior

`Stencil: Run Template` resolves its target in this order:

1. An explicit command argument
2. The active `.stencil/**/*.md` file
3. A Quick Pick from the available templates

If a template resolves from defaults and `$ctx.*` values alone, the resolved prompt opens immediately in a new untitled Markdown editor. If values are still missing, the extension collects them sequentially with `vscode.window.showInputBox()`. If the prompt flow is cancelled, execution stops without opening partial output.

`Stencil: Create Template` walks through a small authoring wizard for name, description, tags, collection, and a body seed. The created template is saved through `@stencil-pm/core`, opened in the editor, and the tree view is refreshed.

`Stencil: List Templates` shows a grouped Quick Pick and opens the selected template source file. The Explorer view provides the same browsing surface with `Open Template` and `Run Template` actions on template items.

## Workspace Expectations

- A VS Code workspace folder is required. Commands show actionable guidance when no workspace is open.
- `Run Template`, `List Templates`, and the tree view expect a `.stencil/` directory to exist.
- `Create Template` can be used in a first-time workspace and initializes `.stencil/` before saving.

## Performance Notes

- The extension keeps one cached `Stencil` instance per workspace root instead of rebuilding core services on every command.
- Activation stays narrow: commands, the tree view, and `.stencil/**/*.md` file detection wake the extension only when relevant.
- Placeholder collection stays on Input Boxes only for MVP, which avoids Webview startup and preview synchronization overhead.

## Verification

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

## Run In VS Code

Build first:

```bash
pnpm --filter stencil-vscode build
```

Then open the repo in VS Code and start the `Run Stencil VS Code Extension` launch configuration, or launch a development host directly:

```bash
code --extensionDevelopmentPath=packages/vscode-extension .
```

Use a workspace that contains templates under `.stencil/` if you want to exercise run, list, tree, and syntax flows immediately.

## Manual Acceptance

The maintainer checklist for Step 8 lives in [docs/manual-acceptance.md](./docs/manual-acceptance.md).

## Non-Goals

This MVP does not ship:

- Webview placeholder forms
- Preview panels or confirmation steps
- Dry-run mode
- Diagnostics UI or autocomplete
- CodeLens
- Claude Code extension routing or any other cross-extension output target
