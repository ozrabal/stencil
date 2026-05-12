# Stencil Template Manager — VS Code Extension

VS Code adapter for the shipped Stencil MVP. This package keeps template logic in `@stencil-pm/core` and exposes a narrow VS Code surface around it.

## MVP Surface

- `Stencil: Run Template`
- `Stencil: Create Template`
- `Stencil: List Templates`
- `Stencil Templates` Explorer view for browsing collections and templates
- `.stencil/**/*.md` language mapping with placeholder-aware syntax highlighting

The extension does not require terminal setup for normal MVP use. `Create Template` bootstraps `.stencil/` on first use when needed.

## Context Resolution

`Stencil: Run Template` resolves `$ctx.*` through `@stencil-pm/core` plus one VS Code adapter provider.

Core-owned keys stay in `@stencil-pm/core` because they do not depend on live VS Code state:

- `date`
- `os`
- `cwd`
- `current_branch`
- `git_user`
- `project_name`
- `language`

VS Code-owned keys come from the extension because they depend on the active editor, workspace, or diagnostics APIs:

- existing keys: `active_file`, `active_selection`, `workspace_folders`, `active_language_id`, `diagnostics_count`
- Epic 2 expansion: `active_file_name`, `active_file_relative_path`, `active_workspace_folder`, `workspace_folder_count`, `active_selection_start_line`, `active_selection_end_line`, `active_selection_line_count`, `diagnostics_error_count`, `diagnostics_warning_count`

Contract rules:

- all values are strings
- missing VS Code state is omitted rather than emitted as an empty string
- existing key names remain stable; Epic 2 adds keys instead of renaming current ones
- `workspace_folders` remains newline-separated for compatibility
- when active editor context is missing, templates still run and unresolved `$ctx.*` tokens stay unchanged in the delivered output

Example:

```md
Current file: {{$ctx.active_file}}
File name: {{$ctx.active_file_name}}
Relative file: {{$ctx.active_file_relative_path}}
Workspace: {{$ctx.active_workspace_folder}}
Workspace count: {{$ctx.workspace_folder_count}}
Selection lines: {{$ctx.active_selection_start_line}}-{{$ctx.active_selection_end_line}} ({{$ctx.active_selection_line_count}})
Diagnostics: {{$ctx.diagnostics_count}} total, {{$ctx.diagnostics_error_count}} errors, {{$ctx.diagnostics_warning_count}} warnings
```

## Command Behavior

`Stencil: Run Template` resolves its target in this order:

1. An explicit command argument
2. The active `.stencil/**/*.md` file
3. A Quick Pick from the available templates

If a template resolves from defaults and `$ctx.*` values alone, the resolved prompt opens immediately in a new untitled Markdown editor. If values are still missing, the extension collects them sequentially with `vscode.window.showInputBox()`. If the prompt flow is cancelled, execution stops without opening partial output.

## Template Input Syntax

`Stencil: Run Template` prompts from the normalized input contract returned by `@stencil-pm/core`.

Supported body forms:

- `{{input:name}}` for a required runtime input
- `{{input:name:default value}}` for a runtime input with an inline default
- `{{name}}` as a legacy compatibility form
- `{{$ctx.key}}` for context values

Frontmatter `placeholders` remain supported for metadata overlays and legacy templates. When both body and frontmatter describe the same logical input, body syntax defines that the input exists and any inline default, while frontmatter contributes description, required/optional metadata, type, options, and a fallback default.

Migration notes:

- Prefer `{{input:name}}` for new templates.
- Keep frontmatter `placeholders` when you want user-facing descriptions or future typed metadata.
- Reusing the same inline input multiple times is supported.
- Reusing the same inline input with different defaults fails validation.
- Mixing `{{input:name}}` and `{{name}}` for the same input still works, but core emits a warning.

## Run Service Contract

Epic 1 moves run orchestration behind one extension-owned service in [`src/services/runTemplateService.ts`](./src/services/runTemplateService.ts).

The run flow is split into explicit seams:

- target resolution in [`src/services/runTemplateTarget.ts`](./src/services/runTemplateTarget.ts)
- placeholder collection in [`src/services/placeholderInput.ts`](./src/services/placeholderInput.ts)
- run request and internal options in [`src/services/runOptions.ts`](./src/services/runOptions.ts)
- delivery adapters in [`src/services/delivery/`](./src/services/delivery/)
- capability checks in [`src/services/delivery/capabilities.ts`](./src/services/delivery/capabilities.ts)

The current supported state after Epic 1 is intentionally narrow:

- `editor` delivery with `default` mode is supported end to end
- `copilot-chat`, `clipboard`, and `lm-api` targets have typed contracts and capability probes, but no delivery implementation yet
- recoverable exits such as picker cancellation, prompt cancellation, unresolved inputs, unsupported targets, and unavailable modes are normalized as typed run outcomes before messaging

Current entrypoints all converge on the same request shape:

- Command Palette runs
- tree item runs from the `Stencil Templates` Explorer view
- active-editor auto-target resolution when no explicit template is supplied

## Next Integration Points

- Epic 4 should add Copilot Chat delivery by implementing a delivery adapter and capability policy for `copilot-chat`.
- Epic 6 should own automatic fallback priority between future targets rather than reintroducing branching in command handlers.
- Epic 7 should add LM API execution and streaming UI behind the existing run options and delivery capability contracts.

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
- Run target resolution lists templates only when no explicit target or active template match exists, which avoids unnecessary Quick Pick setup and keeps the happy path cheap.
- Delivery capability probing is side-effect free and short-circuits unsupported targets before any template loading or placeholder prompting work happens.

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
