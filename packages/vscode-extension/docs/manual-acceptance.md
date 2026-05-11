# VS Code Extension Manual Acceptance

Use this checklist in an Extension Development Host for the Epic 1 MVP.

## Checklist

1. Open an empty workspace and run `Stencil: Run Template`.
   Expected result: VS Code shows `Open a workspace folder to use Stencil commands.` and nothing else opens.
2. Open a workspace with no `.stencil/` directory and run `Stencil: List Templates`.
   Expected result: VS Code shows `Stencil is not set up in this workspace yet. Add a .stencil/ directory to continue.`
3. In that same first-time workspace, run `Stencil: Create Template` and complete the wizard.
   Expected result: `.stencil/` is created, the new template file opens in the editor, and a success message names the template.
4. Open the `Stencil Templates` Explorer view.
   Expected result: the created template appears either under `Templates` or inside its chosen collection.
5. Run `Stencil: List Templates`.
   Expected result: the template appears in the Quick Pick and opening it loads the source template file.
6. Run `Stencil: Run Template` for a template satisfied by defaults and `$ctx.*`.
   Expected result: the resolved prompt opens in a new untitled Markdown editor with no manual placeholder prompts.
7. Run `Stencil: Run Template` for a template with unresolved placeholders.
   Expected result: placeholder values are requested one at a time with Input Boxes, in frontmatter order, and the fully resolved prompt opens in a new untitled Markdown editor.
8. Cancel `Stencil: Run Template` from the template picker.
   Expected result: the run exits quietly with no error message and no resolved output editor opens.
9. Cancel `Stencil: Run Template` during placeholder prompting.
   Expected result: the run shows a cancellation information message and no partial resolved output editor opens.
10. Run the same template from the `Stencil Templates` Explorer item context action.
    Expected result: the run follows the same prompting, cancellation, and editor-output behavior as the Command Palette entrypoint.
11. Request a non-editor run target through a focused unit test or internal caller.
    Expected result: the service returns a typed informational outcome for unsupported or unavailable targets instead of throwing a generic error.
12. Open a file under `.stencil/**/*.md`.
    Expected result: the file resolves to the `stencil-template` language and placeholder-aware syntax highlighting is visible.
13. Confirm the full flow does not depend on any extra UI surface.
    Expected result: no Webview, preview panel, CodeLens, diagnostics UI, autocomplete UI, or Claude Code extension dependency is required.

## Suggested Validation Commands

```bash
pnpm --filter @stencil-pm/core test
pnpm --filter stencil-vscode typecheck
pnpm --filter stencil-vscode test
pnpm --filter stencil-vscode build
pnpm lint
```
