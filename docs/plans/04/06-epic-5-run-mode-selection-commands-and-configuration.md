# Plan: Epic 5 — Run Mode Selection, Commands, and Configuration

**Goal:** Expose the existing multi-target run flow through a coherent VS Code command, tree-view, and configuration surface that preserves a low-friction default path while making explicit target and mode choices discoverable.

**Primary source documents:**

- `docs/epics/04-vscode-run-template-epics.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`

**Current code baseline:**

- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/providers/templateTreeProvider.ts`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/runTemplateService.ts`
- `packages/vscode-extension/src/services/runTemplateTarget.ts`
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/providers/templateTreeProvider.test.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`

## Scope Lock

This plan covers Epic 5 only.

In scope:

- define the final user-facing command surface for default run, explicit target commands, and run-with-mode selection
- add extension configuration for default target, default mode, default chat mode, and mode-selection behavior
- decide and implement how last-used mode is remembered, including session and persisted state choices
- extend tree-view actions and command contributions so the supported run flows are accessible from both sidebar and command palette
- keep editor delivery as a first-class explicit mode even after Copilot Chat and LM API exist
- unify option resolution so command defaults, settings, last-used state, and explicit command overrides produce predictable execution options
- add tests and documentation for the supported command/configuration surface

Out of scope for this epic:

- clipboard delivery and formal fallback priority from Epic 6
- new Copilot Chat adapter behavior from Epic 4
- LM API panel internals or model-execution behavior from Epic 7
- new placeholder parsing or inline-input preprocessing beyond the Epic 3 contract
- Webview authoring UX, CodeLens, diagnostics, or editor-polish work

## Planning Notes Applied

- Each step ends in a user-observable run flow, not only configuration scaffolding.
- The plan assumes the first multi-target wave already includes real Copilot Chat and LM API paths, so Epic 5 focuses on making that surface coherent instead of adding another delivery target.
- Explicit fallback modes are treated as first-class user choices. Editor output is not hidden behind failure handling.
- Epic 3 remains contract work. This plan does not introduce VS Code-only input parsing shortcuts or adapter-local inline-input behavior.

## Repo Facts That Matter

- The extension already has real multi-target implementation seams:
  - `runTemplateService.ts` orchestrates target selection, placeholder prompting, delivery, and degraded outcomes
  - `copilot-chat` and `lm-api` delivery adapters exist
  - capabilities are already probed at runtime
- The extension already exposes multiple target-specific commands:
  - `stencil.runTemplate`
  - `stencil.runTemplateInCopilotChat`
  - `stencil.runTemplateInCopilotChatSend`
  - `stencil.runTemplateInCopilotChatWithMode`
  - `stencil.runTemplateWithLanguageModel`
  - `stencil.runTemplateWithLanguageModelSelectModel`
- The current surface is functional but not yet coherent:
  - there is no explicit editor-mode command even though editor output remains a supported explicit mode
  - there is no configuration contribution for run defaults
  - the default `stencil.runTemplate` command still resolves to editor because `resolveRunTemplateExecutionOptions()` defaults `deliveryTarget` to `editor`
  - the sidebar only exposes one generic run action in the template context menu
  - there is no state model for last-used mode, per-session memory, or persisted workspace/global memory
- `package.json` already targets VS Code `^1.100.0`, so this epic does not need another engine bump.
- The architecture document still describes the MVP editor-only run surface. Epic 5 is the point where the extension’s user-facing surface starts to match the newer multi-target product direction.
- The PRD still emphasizes command-palette discoverability and a predictable run interaction. That supports a command matrix with one default entry point plus explicit alternatives, not a Copilot-only surface.

## Desired Outcome

At the end of Epic 5:

- `Stencil: Run Template` follows a documented default selection policy instead of being implicitly hard-coded to editor delivery
- users can choose between explicit supported run targets from both the command palette and the template tree context menu
- users can invoke one coherent picker-driven command when they want to choose a target or mode at run time
- editor delivery remains a first-class explicit target alongside Copilot Chat and LM API
- the extension can optionally remember last-used choices without mutating template files or relying on ad hoc command duplication
- the contributed settings and commands match what the extension actually supports today, not future clipboard or other aspirational modes

## Cross-Epic Guardrails

- Keep `deliveryTarget`, `mode`, and `chatMode` separate through the entire stack.
  - `deliveryTarget` answers where the resolved prompt goes.
  - `mode` answers how that target behaves.
  - `chatMode` answers which Copilot Chat sub-mode is requested.
- Do not expose `clipboard` in commands or settings until Epic 6 actually implements it.
- Do not represent “last used” by writing transient values into normal user settings such as `settings.json`.
  - Use session memory, `workspaceState`, or `globalState` instead.
- Do not let the default command become capability-blind.
  - If the configured default target is unavailable at runtime, defer to the existing delivery/fallback behavior in `runTemplateService.ts` rather than duplicating fallback policy in command wiring.
- Do not remove explicit commands that are already useful until the replacement command surface is in place and test-covered.
- Keep tree-view inline actions minimal.
  - One inline default run action is reasonable.
  - Additional explicit targets should live in the context menu to avoid clutter.

## Recommended Contract For Epic 5

Add one extension-owned configuration and preference layer above the existing `runTemplate()` service.

### Supported User-Facing Targets In This Epic

- `editor`
- `copilot-chat`
- `lm-api`

### Supported User-Facing Modes In This Epic

- `editor`: `default`
- `copilot-chat`: `insert`, `send`
- `lm-api`: `execute`

### Supported Chat Modes In This Epic

- `ask`
- `edit`
- `agent`

These remain runtime-capability-dependent exactly as Epic 4 defined them.

### Recommended Settings

Contribute only settings that map cleanly to current implementation:

- `stencil.run.defaultTarget`
  - enum: `editor`, `copilot-chat`, `lm-api`
  - default recommendation: `copilot-chat`
- `stencil.run.defaultMode`
  - enum: `default`, `insert`, `send`, `execute`
  - default recommendation: `default`
- `stencil.run.defaultChatMode`
  - enum: `ask`, `edit`, `agent`
  - default recommendation: `ask`
- `stencil.run.selectionBehavior`
  - enum: `defaults`, `picker`, `last-used`
  - default recommendation: `defaults`
- `stencil.run.lastUsedScope`
  - enum: `session`, `workspace`, `global`
  - default recommendation: `session`

### Recommended Normalization Rules

- If `defaultTarget = editor`, normalize mode to `default` and ignore `defaultChatMode`.
- If `defaultTarget = copilot-chat`:
  - allow `default`, `insert`, `send`
  - normalize `default` to `insert`
  - validate `defaultChatMode` against runtime-supported chat modes
- If `defaultTarget = lm-api`:
  - allow `default` and `execute`
  - normalize `default` to `execute`
  - ignore `defaultChatMode`
- If settings request an invalid combination, normalize to the target’s safe default and surface a deterministic warning message in tests.
- Explicit target commands always win over settings.
- Picker-driven selections win over settings for that invocation.

### Recommended Last-Used Persistence Model

- `session`: keep the last-used run profile in extension-memory only
- `workspace`: persist the last-used run profile in `ExtensionContext.workspaceState`
- `global`: persist the last-used run profile in `ExtensionContext.globalState`

Do not persist last-used values by mutating user settings. Settings define defaults; state stores interaction history.

### Recommended Command Surface

Keep one default command, one picker-driven command, and explicit target commands:

- `stencil.runTemplate`
  - uses configuration and last-used policy
- `stencil.runTemplateWithMode`
  - opens a target/mode picker over supported run profiles
- `stencil.runTemplateInEditor`
  - explicit editor output path
- `stencil.runTemplateInCopilotChat`
  - explicit Copilot insert path
- `stencil.runTemplateInCopilotChatSend`
  - explicit Copilot send path
- `stencil.runTemplateInCopilotChatWithMode`
  - explicit Copilot chat-mode picker
- `stencil.runTemplateWithLanguageModel`
  - explicit LM execute path
- `stencil.runTemplateWithLanguageModelSelectModel`
  - explicit LM model-picker path

If compatibility with existing command ids matters, preserve already-shipped ids and add the new commands alongside them. Do not break the current explicit Copilot or LM entries while this epic is landing.

## Validation Baseline

Run before editing:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
pnpm --filter stencil-vscode build
```

Default validation after each implementation step:

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test:unit
```

Full validation before closing the epic:

```bash
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

## Manual Validation Matrix

Use at least these templates during manual checks:

### A. No-input template

```markdown
---
name: run-surface-no-input
description: Default and explicit run-surface flow
version: 1
---

Summarize the current file: {{$ctx.active_file_name}}
```

### B. Inline-input template

```markdown
---
name: run-surface-inline-input
description: Picker and explicit-mode flow
version: 1
---

Review this code for {{input:focus_area:performance}} issues.
Context:
{{$ctx.active_selection}}
```

### C. Mixed metadata template

```markdown
---
name: run-surface-metadata
description: Settings-driven run flow
version: 1
placeholders:
  - name: audience
    description: Target audience
    required: false
    default: maintainers
---

Explain this module to {{input:audience}}.
```

For each user-visible slice:

1. Open an Extension Development Host with a workspace containing `.stencil/` templates.
2. Open a file and create a non-empty selection when validating context and inline-input prompting.
3. Invoke the command or tree action introduced in that step.
4. Verify the resolved prompt lands in the expected target with the expected mode.
5. Repeat once with Copilot Chat unavailable when the step covers default-target degradation.
6. Repeat once with multiple language models available when the step covers LM picker behavior.

## Implementation Sequence

### Step 1 — Freeze The Current Multi-Target Surface And Introduce A Run-Surface Resolution Seam

**Objective:** Protect the existing Copilot and LM command behavior while creating one place to resolve user-facing run profile decisions.

**Files to change:**

- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/services/runTemplateService.test.ts`

**Actions:**

1. Add tests that lock today’s command behavior for:
   - default `stencil.runTemplate` using editor delivery
   - explicit Copilot insert/send commands
   - explicit LM command
   - Copilot mode picker command
   - LM model picker command
2. Extract a command-side “run profile resolution” seam that can later merge:
   - explicit command overrides
   - settings defaults
   - last-used state
   - picker selections
3. Change `registerRunTemplateCommand()` and related registrations so they can receive a shared dependency object instead of only hard-coded partial options.
4. Thread `ExtensionContext` from `activate()` down to command registration so later steps can use `workspaceState` and `globalState`.
5. Do not change user-visible behavior in this step except where tests expose an existing inconsistency.

**User-observable slice:** the current commands still work exactly as they do now, but the code has a stable seam for final command-surface logic.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode test:unit -- runTemplateService
```

**Completion gate:** command wiring is protected by tests and ready to absorb settings and last-used resolution without rewriting every command again.

---

### Step 2 — Add Run Configuration Contributions And Normalize Them Into A Resolved Default Profile

**Objective:** Make the default run command settings-driven instead of implicitly editor-only.

**Files to change:**

- `packages/vscode-extension/package.json`
- `packages/vscode-extension/src/services/runOptions.ts`
- `packages/vscode-extension/src/services/runConfiguration.ts` (new)
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/services/runConfiguration.test.ts` (new)

**Actions:**

1. Add `contributes.configuration` entries for:
   - `stencil.run.defaultTarget`
   - `stencil.run.defaultMode`
   - `stencil.run.defaultChatMode`
   - `stencil.run.selectionBehavior`
   - `stencil.run.lastUsedScope`
2. Implement a small configuration reader service that:
   - reads all five settings from `vscode.workspace.getConfiguration('stencil')`
   - validates enum values
   - normalizes target/mode/chat-mode combinations into one resolved default profile
3. Update the default `stencil.runTemplate` command to resolve its execution options from this configuration service instead of relying on hard-coded editor defaults.
4. Keep explicit command overrides stronger than configuration.
5. Add unit tests for:
   - each valid target default
   - invalid combinations normalizing to safe target defaults
   - Copilot-specific chat mode handling
   - LM-specific `execute` normalization
6. Keep the default selection behavior set to `defaults` in this step even if the setting exists. Later steps will activate picker and last-used behavior.

**User-observable slice:** a user can set `stencil.run.defaultTarget` and `Stencil: Run Template` follows that setting for editor, Copilot Chat, or LM execution.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runConfiguration
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Set `stencil.run.defaultTarget` to `editor` and run `Stencil: Run Template`.
2. Set it to `copilot-chat` and verify the default run goes to Copilot insert mode.
3. Set it to `lm-api` and verify the default run uses LM execution.
4. Set `stencil.run.defaultMode` to an incompatible value for the selected target and verify the extension normalizes rather than failing unpredictably.

**Completion gate:** the default command is configuration-driven and stable, with no command-id proliferation required for ordinary default behavior changes.

---

### Step 3 — Add A Coherent “Run Template With Mode…” Picker Across Supported Targets

**Objective:** Provide one discoverable command for per-run target and mode selection without forcing users to remember several specialized commands.

**Files to change:**

- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/services/runProfilePicker.ts` (new)
- `packages/vscode-extension/src/services/delivery/capabilities.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/services/runProfilePicker.test.ts` (new)

**Actions:**

1. Add a new command contribution:
   - `stencil.runTemplateWithMode`
   - title recommendation: `Stencil: Run Template With Mode...`
2. Implement a picker service that lists only supported profiles for the current runtime, for example:
   - `Editor`
   - `Copilot Chat`
   - `Copilot Chat (Send)`
   - `Copilot Chat: Ask`
   - `Copilot Chat: Edit`
   - `Copilot Chat: Agent`
   - `Language Model`
3. Derive picker entries from capability probes so unsupported Copilot chat modes or unavailable LM targets are either:
   - omitted from the picker, or
   - shown disabled with a clear description if that is easier to implement and test
4. Have the picker return a normalized execution profile:
   - `deliveryTarget`
   - `mode`
   - optional `chatMode`
5. Run the selected profile through the existing `runTemplate()` orchestration path.
6. Add tests for:
   - no Copilot available
   - Copilot available with only `ask`
   - Copilot available with `ask/edit/agent`
   - LM available/unavailable
   - picker cancellation

**User-observable slice:** a user can run one command, choose the desired target or mode from a single picker, and get the matching run behavior without hunting across multiple command names.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runProfilePicker
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Run `Stencil: Run Template With Mode...`.
2. Verify editor, Copilot, and LM options appear according to runtime capabilities.
3. Select each visible option and confirm the resolved template lands in the expected target.
4. Cancel the picker and verify no run occurs.

**Completion gate:** there is now one coherent per-run selection command that spans the supported multi-target flow.

---

### Step 4 — Implement Last-Used Selection Behavior With Session, Workspace, And Global Scope

**Objective:** Make the default command capable of reusing the most recent user-selected run profile when configured to do so.

**Files to change:**

- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/services/runConfiguration.ts`
- `packages/vscode-extension/src/services/runPreferenceStore.ts` (new)
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/services/runPreferenceStore.test.ts` (new)

**Actions:**

1. Implement a preference store that supports:
   - in-memory session state
   - `workspaceState`
   - `globalState`
2. Define a serializable “last-used run profile” shape containing:
   - `deliveryTarget`
   - `mode`
   - optional `chatMode`
3. Activate `stencil.run.selectionBehavior = last-used`:
   - default command first asks the preference store for the last-used profile using the configured scope
   - if no stored profile exists, fall back to normalized settings defaults
4. Update picker-driven commands and explicit target commands to record last-used state after a successful invocation request is assembled.
   - Prefer recording after a real run attempt starts, not merely after picker selection.
5. Add tests for:
   - session-only memory
   - workspace persistence
   - global persistence
   - missing stored state falling back to settings defaults
   - explicit command invocation updating last-used state
6. Keep user-facing failure and fallback semantics inside `runTemplateService.ts`. The preference store should only decide which profile to request, not how to recover if that target fails.

**User-observable slice:** a user can choose a run profile once, set selection behavior to `last-used`, and have `Stencil: Run Template` repeat that profile across the chosen persistence scope.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runPreferenceStore
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Set `stencil.run.selectionBehavior` to `last-used`.
2. Set `stencil.run.lastUsedScope` to `session`, run `Stencil: Run Template With Mode...`, choose LM, then re-run `Stencil: Run Template`.
3. Repeat with `workspace` and confirm the choice survives an Extension Host restart for that workspace.
4. Repeat with `global` and confirm the choice survives across workspaces if that behavior is intended.

**Completion gate:** last-used mode selection is implemented through explicit state handling rather than ad hoc command duplication or settings mutation.

---

### Step 5 — Rationalize The Explicit Command Matrix And Tree View Surface

**Objective:** Make the supported run surface discoverable and consistent in both the command palette and the sidebar.

**Files to change:**

- `packages/vscode-extension/package.json`
- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/providers/templateTreeProvider.ts`
- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/providers/templateTreeProvider.test.ts`

**Actions:**

1. Add an explicit editor command:
   - `stencil.runTemplateInEditor`
   - title recommendation: `Stencil: Run Template in Editor`
2. Keep the existing explicit Copilot and LM commands, but update their titles and ordering if needed so the surface reads as one family.
3. Add the new picker-driven command to the palette.
4. Update tree-view menus:
   - keep one inline default run action
   - add context-menu entries for explicit targets:
     - Run Template
     - Run Template With Mode...
     - Run Template in Editor
     - Run Template in Copilot Chat
     - Run Template in Copilot Chat (Send)
     - Run Template with Language Model
5. If useful, update `TemplateTreeProvider` item metadata or context values only as needed to support cleaner menu conditions.
6. Add tests for:
   - tree-item invocation source preserved for new commands
   - explicit editor command passes editor execution options
   - menu-eligible template items remain the only run-enabled nodes
7. Do not expose clipboard-related commands yet.

**User-observable slice:** users can reach the supported run targets from the sidebar without memorizing command ids, and editor output is visibly treated as a deliberate target instead of only a fallback.

**Validation:**

```bash
pnpm --filter stencil-vscode test:unit -- runTemplate
pnpm --filter stencil-vscode test:unit -- templateTreeProvider
pnpm --filter stencil-vscode typecheck
```

**Manual validation:**

1. Right-click a template in the sidebar and verify the new run entries appear.
2. Run the template through each explicit target entry.
3. Verify collection/group nodes do not expose template-run commands incorrectly.
4. Verify the inline run action still uses the configured default behavior.

**Completion gate:** the tree view and command palette now present one coherent supported run surface for editor, Copilot, and LM flows.

---

### Step 6 — Harden Messaging, Documentation, And End-To-End Validation For The New Run Surface

**Objective:** Close the epic with stable messaging and documentation that describe the supported command/configuration model accurately.

**Files to change:**

- `packages/vscode-extension/test/unit/commands/runTemplate.test.ts`
- `packages/vscode-extension/test/unit/services/runConfiguration.test.ts`
- `packages/vscode-extension/test/unit/services/runPreferenceStore.test.ts`
- `packages/vscode-extension/test/unit/providers/templateTreeProvider.test.ts`
- `packages/vscode-extension/README.md` if present, otherwise repo-level docs that describe extension usage
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md` only if this repo expects implementation docs to be updated alongside feature completion

**Actions:**

1. Add final unit coverage for:
   - settings-driven default run
   - picker-driven selection
   - last-used selection behavior
   - explicit editor/Copilot/LM commands
   - tree-item invocation paths
2. Review outcome messaging so the command layer does not add redundant or conflicting notices on top of `runTemplateService.ts`.
3. Update user-facing docs to describe:
   - the default run command behavior
   - the explicit target commands
   - the run-with-mode picker
   - the meaning of each run setting
   - the current boundary: clipboard fallback waits for Epic 6
4. Update architecture notes where the old MVP-only command surface is now misleading.
5. Run the full validation suite and complete one manual pass across:
   - editor explicit mode
   - Copilot default mode
   - Copilot send mode
   - Copilot mode picker
   - LM default mode
   - default-command behavior under `defaults`, `picker`, and `last-used`

**User-observable slice:** the final run surface is documented, predictable, and stable enough for users to rely on without guessing which command to use.

**Validation:**

```bash
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Completion gate:** the command/configuration UX is test-backed, documented, and aligned with the actual implementation surface.

## Done Criteria

Epic 5 is complete when all of the following are true:

- `Stencil: Run Template` no longer implicitly means “open in editor”; it follows a documented default-selection policy.
- users can choose a supported target or mode from one coherent picker command.
- editor output is exposed as an explicit command and sidebar action.
- settings exist for default target, default mode, default chat mode, selection behavior, and last-used scope.
- last-used profile memory works through session, workspace, or global persistence without editing settings values.
- command palette and sidebar surfaces reflect only supported targets in this implementation wave.
- tests cover command resolution, settings normalization, last-used persistence, and tree invocation behavior.

## Follow-On Work

After Epic 5 lands, the next work should be:

1. Epic 6 — add clipboard delivery and formalize cross-target fallback priority now that the command/configuration surface is stable.
2. Epic 8 — extend compatibility and smoke coverage around the now-expanded multi-target surface.
