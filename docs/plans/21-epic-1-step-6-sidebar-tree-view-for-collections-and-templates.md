# Plan: Epic 1 Step 6 — Sidebar Tree View For Collections And Templates

**Goal:** Replace the current placeholder `Stencil Templates` Explorer view with a real MVP tree browser that shows collections and uncategorized templates, opens template files on click, runs templates from the item context menu, and refreshes cleanly after template creation or explicit user refresh.

**Primary inputs:**

- `docs/plans/15-epic-1-vscode-extension-mvp.md`
- `docs/stencil-architecture.md`
- `docs/stencil-prd.md`
- `packages/vscode-extension/*`
- `packages/core/*`

**This document plans Step 6 only.** It does not implement syntax highlighting, diagnostics, autocomplete, Webviews, preview panels, collection CRUD, template delete/rename/copy flows, drag-and-drop, favorites, file watching, or any Claude Code / cross-extension integration.

---

## Locked Scope For This Step

These decisions from `15-epic-1-vscode-extension-mvp.md` must remain true while implementing this step:

- Keep Epic 1 on the Phase 2 MVP surface only.
- Use direct `@stencil-pm/core` imports through the extension’s local core bridge.
- Keep the Tree View a browser, not a management UI.
- Keep orchestration out of `extension.ts`; use provider and service helpers.
- Do not pull Webviews, preview panels, diagnostics, autocomplete, CodeLens, or remote template browsing forward.
- Keep output delivery extension-local and simple; running a template still ends in the existing resolved-output flow.

Additional Step 6 decisions to lock before editing:

- Keep the existing Explorer view id `stencilTemplates`. Do not introduce a new custom activity-bar container for MVP.
- Preserve project-over-global precedence by consuming `stencil.list()` exactly as returned. Do not reimplement merge or shadowing logic in the extension.
- Build the top-level tree from the union of:
  - `await stencil.collections.listCollections()` for project collection directories, including empty ones
  - collection names present on the visible templates returned by `await stencil.list()`
- Show uncategorized templates under a single grouping node labeled `Templates`, matching the Step 2 Quick Pick wording.
- Allow empty collection nodes to appear. `CollectionManager.listCollections()` explicitly includes empty collections, and the tree should not hide them.
- Do not add file watchers in this step. Refresh comes from:
  - the existing post-create `templateTreeProvider.refresh()`
  - a new explicit refresh action in the view
  - a lightweight provider refresh method only
- Single-click behavior should open the template file. Running a template remains an explicit action, not the default click action.
- It is acceptable to add small tree-only helper commands beyond the three user-facing Command Palette commands, but they should stay narrowly scoped to browsing:
  - `stencil.openTemplate`
  - `stencil.refreshTemplatesView`
- Do not add destructive context-menu actions in MVP.

### Critical contract decision to lock before editing

The parent epic says Tree View item actions should include:

- open template
- run template
- refresh tree

The current extension only contributes three commands:

- `stencil.runTemplate`
- `stencil.createTemplate`
- `stencil.listTemplates`

and `TemplateTreeProvider` currently returns placeholder rows only.

**Recommended lock for Step 6:** add one small open helper command plus one refresh command instead of overloading `listTemplates` or making template click invoke `runTemplate`. This keeps browse and execute behavior separate and avoids a surprising tree UX.

---

## Repo Facts That Affect The Plan

- `packages/vscode-extension/src/extension.ts` already registers:
  - `registerRunTemplateCommand()`
  - `registerCreateTemplateCommand(templateTreeProvider)`
  - `registerListTemplatesCommand()`
  - `window.registerTreeDataProvider('stencilTemplates', templateTreeProvider)`
- `packages/vscode-extension/package.json` already contributes:
  - the `stencilTemplates` Explorer view
  - `onView:stencilTemplates` activation
  - workspace/file-based activation events
- `packages/vscode-extension/src/providers/templateTreeProvider.ts` currently distinguishes:
  - missing workspace
  - missing `.stencil/`
  - placeholder “later Epic 1 step” state
- `packages/vscode-extension/src/types.ts` currently models tree metadata only as:
  - `empty-state`
  - `template`
    Step 6 will need explicit collection/group node metadata.
- `packages/vscode-extension/src/services/getStencil.ts` already caches one `Stencil` instance per workspace root and registers `VSCodeContextProvider`, so the tree provider should reuse that instead of constructing its own core state manually.
- `packages/vscode-extension/src/commands/createTemplate.ts` already accepts a `refresh()` dependency and calls it after a successful create. That is the correct existing seam for post-create tree updates.
- `packages/vscode-extension/src/commands/runTemplate.ts` already accepts a command argument shape with `templateName`, so a tree item can invoke the existing run command without new execution logic.
- `packages/vscode-extension/src/services/templateQuickPick.ts` already standardizes the label `Templates` for uncategorized templates. Reusing that label in the tree will keep the MVP browse surfaces consistent.
- In core:
  - `Stencil.list()` returns already-filtered visible templates with project templates shadowing global ones.
  - `CollectionManager.listCollections()` returns sorted project collection names and includes empty directories.
  - `LocalStorageProvider.listTemplates()` sorts visible templates by collection then template name.
- The extension already has:
  - Vitest unit coverage for commands, services, activation, and context provider
  - no dedicated unit coverage for `TemplateTreeProvider` yet

---

## Step 6 Outcome

At the end of this step:

- the Explorer sidebar shows a real `Stencil Templates` tree
- top-level nodes represent collections plus an uncategorized `Templates` group when needed
- empty collections are visible
- template leaf nodes open their `.md` file on click
- template item context menus can run the template
- the view exposes an explicit refresh action
- the tree refreshes immediately after `Stencil: Create Template`
- missing-workspace and missing-setup states still show deliberate placeholder rows instead of failing silently
- the unit and smoke test baseline remains green

**Demonstrable user flow for this step:**

1. Open a workspace that contains `.stencil/` templates and optional collections.
2. Open the `Stencil Templates` view in Explorer.
3. Expand a collection or the `Templates` group.
4. Click a template to open it in the editor.
5. Use the item context menu to run that template.
6. Create a new template and confirm the tree updates after save.

---

## Validation Gates

**Baseline validation before editing:**

```bash
pnpm --filter @stencil-pm/core typecheck
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
pnpm --filter stencil-vscode test
```

**Validation during Steps 6.1 through 6.5:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Validation after tree provider and tests land:**

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Manual validation in the Extension Development Host:**

1. Open a workspace with `.stencil/templates/` entries but no collections and confirm a `Templates` node appears with template children.
2. Open a workspace with `.stencil/collections/<name>/` entries and confirm collection nodes appear alphabetically with template children.
3. Create an empty collection directory and confirm it appears as an expandable or empty collection node.
4. Click a template node and confirm the correct file opens.
5. Use the template context menu `Run Template` action and confirm the existing run flow starts for that template.
6. Run `Stencil: Create Template` and confirm the tree refreshes automatically after creation.
7. Use the refresh action in the tree and confirm manually added files appear after refresh.
8. Open a workspace without `.stencil/` and confirm the tree still shows a setup guidance placeholder item.

---

## Implementation Sequence

### Step 6.1 — Freeze The Tree Contract Against Current Extension Behavior

**Objective:** lock the node model and interaction contract before editing code, so the provider, manifest, and tests all target the same MVP behavior.

**Files:** no production edits yet

**Actions:**

1. Lock the root node model to three categories only:
   - empty-state rows
   - collection/group nodes
   - template leaf nodes
2. Lock top-level grouping behavior:
   - one node per visible collection name
   - one `Templates` node only when uncategorized templates exist
   - no separate source groups
3. Lock click behavior:
   - collection/group node expands or collapses
   - template node opens the file
4. Lock context-menu behavior:
   - template nodes: `Open Template`, `Run Template`
   - view title: `Refresh`
5. Lock refresh behavior:
   - provider-only event emitter refresh
   - no watcher, polling, or cache invalidation beyond current `getStencil()` workspace cache
6. Lock error-handling behavior:
   - provider returns placeholder rows for missing-workspace / missing-setup states
   - unexpected errors during tree load surface through VS Code tree failure behavior or a deliberate safe fallback row, but should not crash activation

**Why this matters:** the current provider is placeholder-only, so Step 6 needs a precise contract before adding new metadata types, commands, and manifest entries.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** there is one explicit node and interaction contract for the tree.

---

### Step 6.2 — Extend Tree Metadata Types And Manifest Contributions

**Objective:** add the minimum structural types and contributed commands needed for real tree interactions.

**Files to change:**

- `packages/vscode-extension/src/types.ts`
- `packages/vscode-extension/package.json`
- `packages/vscode-extension/src/extension.ts`

**Files to add:**

- `packages/vscode-extension/src/commands/openTemplate.ts`

**Actions:**

1. Expand extension-local tree metadata to represent:
   - `empty-state`
   - `collection`
   - `group`
   - `template`
2. Add the metadata needed to drive child resolution and menus, for example:
   - collection/group name
   - template name
   - template file path
   - optional source/description display fields
3. Add a narrow helper command for opening template files:
   - accepts a tree item or template file path argument
   - opens the document through `workspace.openTextDocument()` and `window.showTextDocument()`
4. Add a refresh command:
   - `stencil.refreshTemplatesView`
   - delegates to `templateTreeProvider.refresh()`
5. Extend `package.json` contributions with:
   - the two new commands
   - `menus.view/item/context` entries for template items
   - `menus.view/title` entry for tree refresh
   - optional `menus.commandPalette` suppression if the tree-only helper commands should stay out of normal palette discovery
6. Register the new commands from `extension.ts` while keeping orchestration thin.

**Implementation notes to lock:**

- Reuse the existing `stencil.runTemplate` command for execution.
- Do not add a collection-node context menu in this step.
- Keep command ids and context values stable and explicit so tests can assert them exactly.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the extension can represent tree node kinds and has manifest-level hooks for open, run, and refresh actions.

---

### Step 6.3 — Replace The Placeholder Provider With Real Tree Data Shaping

**Objective:** implement the actual collection/template browser while preserving the existing empty-state behavior.

**Files to change:**

- `packages/vscode-extension/src/providers/templateTreeProvider.ts`

**Optional helper files to add if needed:**

- `packages/vscode-extension/src/services/templateTree.ts`

**Actions:**

1. Keep the current root preflight behavior:
   - `resolveWorkspace()`
   - `hasStencilWorkspaceSetup()`
   - placeholder row for missing workspace
   - placeholder row for missing `.stencil/`
2. For a valid Stencil workspace, load tree inputs concurrently:
   - `const stencil = getStencil(workspace)`
   - `await Promise.all([stencil.list(), stencil.collections.listCollections()])`
3. Build the visible collection set as:
   - all project collection names from `listCollections()`
   - plus all `template.collection` values from `stencil.list()`
4. Shape root nodes deterministically:
   - collection nodes alphabetically
   - optional `Templates` group for uncategorized templates
   - fallback empty-state row when there are no templates and no collections
5. Implement child loading:
   - collection/group node returns matching template leaf items
   - template node returns no children
6. Implement `getTreeItem()` so each node exposes the correct VS Code behavior:
   - collection/group nodes: collapsible, browse-only `contextValue`
   - template nodes: non-collapsible, file-open command on click, `contextValue` for menus
   - empty-state nodes: non-collapsible, no command
7. Keep display intentionally minimal:
   - label: collection name or template name
   - template description: use `frontmatter.description`
   - optional template source indicator only if it improves ambiguity without clutter
8. Do not add icons, badges, favorites, drag handles, or custom descriptions unless the existing VS Code defaults are insufficient.

**Implementation notes to lock:**

- Prefer a small pure helper for node shaping if `templateTreeProvider.ts` starts to mix data transformation with VS Code object construction.
- Do not rely on `listCollections()` alone; it cannot represent global-only collection templates.
- Do not treat uncategorized templates as root leaf nodes; keep them under the `Templates` grouping node for consistency with Step 2.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the tree view shows real collections and template leaves instead of placeholder text.

---

### Step 6.4 — Wire Tree Actions And Refresh Paths Without Expanding Scope

**Objective:** make the tree operational without turning it into a management surface.

**Files to change:**

- `packages/vscode-extension/src/extension.ts`
- `packages/vscode-extension/src/commands/createTemplate.ts`
- `packages/vscode-extension/src/commands/runTemplate.ts`
- `packages/vscode-extension/src/providers/templateTreeProvider.ts`

**Actions:**

1. Pass the shared `templateTreeProvider` instance to the new refresh command registration.
2. Keep the existing create-flow refresh call and verify it still fires after successful create.
3. Invoke `stencil.runTemplate` from template-node context menus by passing:
   - the tree item metadata, or
   - a minimal `{ templateName }` command argument
4. Use the open helper command as the tree item click target.
5. Confirm run flow does not require provider changes beyond the argument handoff, because `runTemplate.ts` already accepts explicit targets.
6. Keep refresh manual and predictable:
   - command palette / view-title refresh should call `templateTreeProvider.refresh()`
   - no automatic refresh after run, because Step 6 does not introduce metadata changes on execution

**Why this sequence:** the repo already has the correct seams for create-refresh and run-target handoff. Step 6 should reuse them instead of adding a parallel execution or open flow.

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode build
```

**Completion gate:** the tree supports open, run, and refresh using existing extension architecture.

---

### Step 6.5 — Add Unit Coverage For Node Shaping, Menus, And Activation Wiring

**Objective:** verify the new tree behavior with targeted unit tests instead of relying only on manual Explorer checks.

**Files to add:**

- `packages/vscode-extension/test/unit/providers/templateTreeProvider.test.ts`
- `packages/vscode-extension/test/unit/commands/openTemplate.test.ts`

**Files to change:**

- `packages/vscode-extension/test/unit/extension.test.ts`
- any existing command tests touched by new registration or refresh wiring

**Actions:**

1. Add provider tests that verify:
   - missing-workspace placeholder
   - missing-setup placeholder
   - root node shaping for:
     - collections with templates
     - uncategorized templates
     - empty collections
     - mixed project/global visible templates
   - child resolution for a collection node and the `Templates` group
   - correct `contextValue` assignment per node kind
2. Add tests for template-node click/open behavior:
   - correct file path is opened
   - no-op or quiet return on invalid input if the helper command receives bad arguments
3. Update activation tests to verify:
   - the new commands are registered
   - the tree provider is still registered once
   - the same provider instance is reused where refresh wiring depends on it
4. Keep test doubles narrow:
   - mock `getStencil()`, `resolveWorkspace()`, and `hasStencilWorkspaceSetup()` for provider tests
   - avoid smoke-test expansion unless a real regression appears

**Validation:**

```bash
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
```

**Completion gate:** tree behavior is covered by fast unit tests and activation wiring stays stable.

---

### Step 6.6 — Update Extension Docs To Match The New MVP Browse Surface

**Objective:** keep the package-level extension docs aligned with the actual Explorer behavior after Step 6 lands.

**Files to change:**

- `packages/vscode-extension/README.md`

**Actions:**

1. Document the `Stencil Templates` Explorer view and its MVP behavior:
   - browse by collection
   - open template on click
   - run from context menu
   - manual refresh
2. Document known MVP limits:
   - no tree-side collection management
   - no preview panel
   - no syntax highlighting yet
3. Keep README updates brief and implementation-accurate; do not advertise later-phase Webviews or diagnostics as already shipped.

**Validation:**

```bash
pnpm --filter stencil-vscode build
```

**Completion gate:** extension docs match the implemented Step 6 browse surface.

---

## Risks And Mitigations

### 1. Empty collection visibility can be lost if the provider trusts `stencil.list()` alone

**Risk:** visible templates do not cover empty collection directories, so the tree silently drops collections users created intentionally.

**Mitigation:** always union `stencil.collections.listCollections()` with collection names derived from visible templates.

### 2. Global collection templates can be hidden if the provider trusts `listCollections()` alone

**Risk:** `listCollections()` only reflects project directories, while `stencil.list()` can surface global templates after project-over-global precedence is applied.

**Mitigation:** derive visible collection names from both sources and treat `stencil.list()` as the source of truth for visible templates.

### 3. Tree helper commands can leak into the general Command Palette

**Risk:** users may see implementation-detail commands that are only useful from the tree.

**Mitigation:** if needed, hide tree-only helpers from the palette with `menus.commandPalette` rules while keeping them contributed for view interactions.

### 4. Provider code can become hard to test if it mixes data shaping and VS Code object assembly

**Risk:** test coverage becomes brittle and editing the node model later gets expensive.

**Mitigation:** keep node shaping in a small pure helper if `templateTreeProvider.ts` starts growing beyond straightforward provider glue.

### 5. Refresh expectations can drift into watcher-like behavior

**Risk:** users or implementers may try to solve stale-tree concerns with ad hoc watchers or implicit refreshes, expanding scope.

**Mitigation:** keep the Step 6 contract explicit: post-create refresh plus user-triggered refresh only.

---

## Exit Criteria

Step 6 is complete when all of the following are true:

- `Stencil Templates` in Explorer is no longer a placeholder-only view
- collections and uncategorized templates are browsable as tree nodes
- empty collections are visible
- clicking a template opens its file
- template context menus can run the template
- the view has an explicit refresh action
- the tree refreshes after successful template creation
- missing-workspace and missing-setup states still behave cleanly
- `pnpm --filter stencil-vscode typecheck`
- `pnpm --filter stencil-vscode test`
- `pnpm --filter stencil-vscode build`
