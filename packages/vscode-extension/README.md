# Stencil Template Manager — VS Code Extension

VS Code adapter for Stencil. This package keeps template logic in `@stencil-pm/core` and exposes a VS Code-native command, tree-view, and delivery surface around it.

## Command Surface

- `Stencil: Run Template`
- `Stencil: Run Template With Mode...`
- `Stencil: Run Template in Editor`
- `Stencil: Run Template in Copilot Chat`
- `Stencil: Run Template in Copilot Chat (Send)`
- `Stencil: Run Template in Copilot Chat (Select Mode)`
- `Stencil: Run Template with Language Model`
- `Stencil: Run Template with Language Model (Select Model)`
- `Stencil: Create Template`
- `Stencil: List Templates`
- `Stencil Templates` Explorer view for browsing collections and templates
- `.stencil/**/*.md` language mapping with placeholder-aware syntax highlighting

The extension does not require terminal setup for normal use. `Create Template` bootstraps `.stencil/` on first use when needed.

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

If a template resolves from defaults and `$ctx.*` values alone, the resolved prompt is delivered immediately to the selected run target. If values are still missing, the extension collects them sequentially with `vscode.window.showInputBox()`. If the prompt flow is cancelled, execution stops without delivering partial output.

`Stencil: Run Template` chooses its run profile through `stencil.run.selectionBehavior`:

- `defaults` uses normalized settings defaults
- `picker` opens the same target/mode picker as `Stencil: Run Template With Mode...`
- `last-used` reuses the most recent normalized run profile from session, workspace, or global scope

Explicit commands always override settings for that invocation. The tree view keeps one inline default run action and exposes explicit targets from the template context menu.

## Run Configuration

The extension contributes these settings:

- `stencil.run.defaultTarget`: `editor`, `copilot-chat`, or `lm-api`
- `stencil.run.defaultMode`: `default`, `insert`, `send`, or `execute`
- `stencil.run.defaultChatMode`: `ask`, `edit`, or `agent`
- `stencil.run.selectionBehavior`: `defaults`, `picker`, or `last-used`
- `stencil.run.lastUsedScope`: `session`, `workspace`, or `global`

Normalization rules stay target-specific:

- `editor` always uses `default`
- `copilot-chat` maps `default` to `insert`
- `lm-api` maps `default` to `execute`
- unsupported Copilot chat modes fall back to the first runtime-supported mode

`Stencil: Run Template With Mode...` lists only runtime-available profiles. `Editor`, `Copilot Chat`, `Copilot Chat (Send)`, chat-mode-specific Copilot entries, and `Language Model` appear according to capability probes.

Copilot Chat delivery is available through three explicit commands:

- `Stencil: Run Template in Copilot Chat` inserts the resolved prompt without submitting it.
- `Stencil: Run Template in Copilot Chat (Send)` sends the resolved prompt immediately.
- `Stencil: Run Template in Copilot Chat (Select Mode)` inserts into the supported Copilot sub-mode (`ask`, `edit`, or `agent`) for the current runtime.

If Copilot Chat is unavailable or the handoff fails, Stencil falls back to the existing editor delivery path and explains what happened.

Language Model API delivery is available through two explicit commands:

- `Stencil: Run Template with Language Model` runs against the first compatible Copilot-backed model returned by `vscode.lm.selectChatModels({ vendor: 'copilot' })`.
- `Stencil: Run Template with Language Model (Select Model)` lets you pick a compatible model for that run when more than one is available.

LM API delivery does not fall back to Copilot Chat or the editor. If the runtime has no compatible model, access is blocked, permission is missing, or the selected model disappears, Stencil surfaces the LM-specific outcome directly.

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
- configuration and profile memory in [`src/services/runConfiguration.ts`](./src/services/runConfiguration.ts) and [`src/services/runPreferenceStore.ts`](./src/services/runPreferenceStore.ts)
- picker-driven profile selection in [`src/services/runProfilePicker.ts`](./src/services/runProfilePicker.ts)
- delivery adapters in [`src/services/delivery/`](./src/services/delivery/)
- capability checks in [`src/services/delivery/capabilities.ts`](./src/services/delivery/capabilities.ts)

The current supported state is:

- `editor` delivery with `default` mode is supported end to end
- `clipboard` delivery with `default` mode is supported end to end
- `copilot-chat` delivery supports `insert` and `send`
- `lm-api` delivery supports `execute`
- Copilot chat modes are runtime-gated: `ask` is always supported, `edit` and `agent` require VS Code `1.100+`
- LM API mode normalization maps `default` to `execute`
- recoverable exits such as picker cancellation, prompt cancellation, unresolved inputs, unsupported targets, unavailable chat modes, LM cancellation, and editor or clipboard fallbacks are normalized as typed run outcomes before messaging

Current entrypoints all converge on the same request shape:

- Command Palette runs
- tree item runs from the `Stencil Templates` Explorer view
- settings-driven default runs
- picker-driven multi-target runs
- active-editor auto-target resolution when no explicit template is supplied

## Copilot Chat Notes

- Minimum VS Code engine and typings baseline: `^1.100.0`
- Copilot availability is probed at runtime via `workbench.action.chat.open`
- When the runtime only supports `ask`, the mode-selection command offers only `ask`
- When Copilot Chat is unavailable or command execution throws, Stencil opens the resolved prompt in a new editor instead of discarding the run

## Language Model API Notes

- Compatibility is probed at runtime via `vscode.lm.selectChatModels({ vendor: 'copilot' })`.
- The panel is extension-owned and singleton-scoped: repeated LM runs reuse the same panel and reset its content for the new request.
- The panel shows the template name, selected model, prompt preview, streamed response text, and run status.
- The panel `Cancel` action cancels the active LM request, and closing the panel cancels an in-flight request as well.
- `Stencil: Run Template with Language Model (Select Model)` does not persist the chosen model. It only affects the current run.
- `last-used` profile memory persists only the normalized target/mode/chat-mode profile. Selected LM model ids are not persisted.
- If the selected model is no longer available by send time, the run fails explicitly and asks the user to retry with another model.

## Next Integration Points

- Epic 6 should own automatic fallback priority between future targets rather than reintroducing branching in command handlers.
- Future work can extend the current LM panel with richer actions, but without moving LM-specific behavior into core.

`Stencil: Create Template` walks through a small authoring wizard for name, description, tags, collection, and a body seed. The created template is saved through `@stencil-pm/core`, opened in the editor, and the tree view is refreshed.

`Stencil: List Templates` shows a grouped Quick Pick and opens the selected template source file. The Explorer view provides the same browsing surface with `Open Template`, `Run Template`, `Run Template With Mode...`, and explicit target actions on template items.

## Workspace Expectations

- A VS Code workspace folder is required. Commands show actionable guidance when no workspace is open.
- `Run Template`, `List Templates`, and the tree view expect a `.stencil/` directory to exist.
- `Create Template` can be used in a first-time workspace and initializes `.stencil/` before saving.

## Performance Notes

- The extension keeps one cached `Stencil` instance per workspace root instead of rebuilding core services on every command.
- Activation stays narrow: commands, the tree view, and `.stencil/**/*.md` file detection wake the extension only when relevant.
- Placeholder collection stays on Input Boxes only for MVP, which avoids Webview startup and preview synchronization overhead.
- Run target resolution lists templates only when no explicit target or active template match exists, which avoids unnecessary Quick Pick setup and keeps the happy path cheap.
- Default-command policy is adapter-local and thin: configuration reads, profile normalization, and last-used state resolution happen before the shared run service without adding extra branching inside delivery orchestration.
- Delivery capability probing is side-effect free and caches the VS Code command list so Copilot checks stay cheap across repeated runs.
- The run-profile picker probes editor, Copilot, and LM capabilities in parallel and skips the picker entirely when no runtime-available profiles exist.
- LM model probing uses the VS Code LM selector directly and only prompts for model choice when the explicit select-model command is used with multiple compatible models.
- Template resolution happens once per run and the resolved body is reused for editor fallback instead of recomputing it after a Copilot failure.
- The LM response panel is a singleton webview with inline HTML, which avoids introducing a separate frontend toolchain or extra bundle during extension activation.

## Verification

Test boundary:

- Unit tests own orchestration, capability probing, profile normalization, request-shape checks, fallback messaging, and adapter-specific failure handling.
- Smoke tests own real Extension Development Host activation plus deterministic editor and clipboard run flows against `test/fixtures/workspace-run-template/`.
- Manual validation owns real Copilot Chat behavior, real LM provider behavior, streaming UX quality, and host-specific compatibility outside the isolated smoke runtime.

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
