# Testing In Claude Code

This document gives a manual end-to-end test flow for the Stencil Claude Code adapter.

It is intentionally written as a copy-paste script so you can run the public slash commands in Claude and verify the real `init -> create -> show -> run -> delete` path, including conversational completion for missing required inputs and explicit confirmation before destructive mutation.

## Prerequisites

From the repo root:

```bash
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/claude-code-plugin test
```

Use a workspace directory where you can create or modify a local `.stencil/` directory.

## Recommended Test Workspace

Use a fresh scratch project or a test folder that does not already contain:

- `.stencil/templates/review-checklist.md`
- `.stencil/templates/legacy-review.md`
- `.stencil/templates/cancelled-template.md`
- `.stencil/templates/delete-me.md`

## Happy Path Script

Paste the following into Claude one step at a time.

### 1. Bootstrap The Project

```text
/stencilinit
```

Expected result:

- Claude reports that Stencil was initialized, or that it was already initialized
- the project now has a local `.stencil/` directory
- the sample `quick-fix` template is available unless the workspace already had project-local templates

### 2. Create An Inline-Input Template

```text
/stencilcreate review-checklist
```

When Claude asks for the description, reply:

```text
Code review checklist
```

When Claude asks for tags, reply:

```text
review, checklist
```

When Claude asks for the body, reply with this Markdown:

```md
Review {{input:component_name}} in {{$ctx.project_name}}.

Focus on:

- API surface
- tests
- failure handling
```

If Claude asks whether to save richer metadata for `component_name`, reply:

```text
yes
```

If Claude asks for the placeholder description, reply:

```text
Component under review
```

If Claude asks whether the placeholder is required, reply:

```text
yes
```

When Claude shows the save preview, confirm the save.

Expected result:

- Claude reports a successful save
- the template name is `review-checklist`
- the preview included the description, tags, placeholder summary, and body

### 3. Inspect The Saved Template

```text
/stencilshow review-checklist
```

Expected result:

- name: `review-checklist`
- description: `Code review checklist`
- tags include `review` and `checklist`
- placeholder summary includes `component_name`
- body token summary includes:
  - one user-facing input token for `component_name`
  - one context token for `$ctx.project_name`
- the body is shown in a fenced Markdown block

### 4. Prove The Template Resolves With Inline Input

```text
/stencilrun review-checklist component_name=AuthService
```

Expected result:

- the command resolves successfully without follow-up questions
- Claude shows a concise provenance summary
- the resolved prompt contains `AuthService`
- the resolved prompt uses the current project context for `$ctx.project_name`
- Claude asks for final confirmation before executing the resolved prompt

### 5. Prove Conversational Completion For One Missing Input

```text
/stencilrun review-checklist
```

Expected result:

- Claude does not ask for `$ctx.project_name`
- Claude asks only for `component_name`
- the question uses the saved placeholder description when available
- after the answer, Claude re-runs the same resolve flow
- Claude shows the resolved prompt and asks for final confirmation before execution

### 6. Cancel Before Final Execution

Run again:

```text
/stencilrun review-checklist
```

Answer the missing value, then decline at the final execute-or-cancel confirmation.

Expected result:

- Claude stops cleanly
- no further execution handoff happens

### 7. Delete The Template With Explicit Confirmation

```text
/stencildelete review-checklist
```

Expected result:

- Claude inspects the template before deletion
- the preview includes the template name, description, collection when present, and the project-local file path or project-local location
- Claude uses explicit destructive wording before deletion
- Claude asks for confirmation before invoking delete

Confirm the deletion.

Expected result after confirmation:

- Claude reports that `review-checklist` was deleted from the current project
- `/stencilshow review-checklist` now reports that the template is not found

### 8. Cancel The Delete Flow

Recreate the template first if needed, then run:

```text
/stencildelete review-checklist
```

Decline the confirmation.

Expected result:

- Claude reports that deletion was cancelled
- Claude does not invoke delete
- `/stencilshow review-checklist` still succeeds afterward

### 9. Missing Template Delete

```text
/stencildelete does-not-exist
```

Expected result:

- Claude stops before any confirmation prompt
- Claude reports that the template was not found in the current project

### 10. Repeat Delete After Success

After deleting a real template once, run:

```text
/stencildelete review-checklist
```

Expected result:

- if the template is already gone during the initial inspection, Claude reports it as not found in the current project
- if a race occurs after confirmation and core returns `deleted: false`, Claude reports that the template no longer exists in the current project

## Legacy Placeholder Variant

This verifies the path for `{{name}}` placeholders instead of `{{input:name}}`.

### 1. Create The Template

```text
/stencilcreate legacy-review
```

Description:

```text
Legacy placeholder review template
```

Tags:

```text
legacy, review
```

Body:

```md
Review {{component_name}} in {{$ctx.project_name}}.
```

If Claude asks whether to save placeholder metadata for `component_name`, reply:

```text
yes
```

Placeholder description:

```text
Component under review
```

Required:

```text
yes
```

Confirm the save preview.

### 2. Verify Show

```text
/stencilshow legacy-review
```

Expected result:

- `component_name` appears in the placeholder summary
- the body token summary shows:
  - one legacy placeholder token for `component_name`
  - one context token for `$ctx.project_name`

### 3. Verify Run

```text
/stencilrun legacy-review component_name=BillingService
```

Expected result:

- the resolved prompt contains `BillingService`
- Claude asks for final confirmation before execution

## Context And Default Resolution Variant

This verifies that `/stencilrun` asks only for values core still reports as unresolved.

### 1. Create The Template

```text
/stencilcreate defaults-and-context
```

Description:

```text
Template with defaults and context
```

Tags:

```text
defaults, context
```

Body:

```md
Project: {{$ctx.project_name}}
Mode: {{input:mode:draft}}
Owner: {{input:owner}}
```

Confirm the save preview.

### 2. Verify Run

```text
/stencilrun defaults-and-context
```

Expected result:

- Claude does not ask for `mode`
- Claude does not ask for `$ctx.project_name`
- Claude asks only for `owner`
- the final provenance summary distinguishes context, default, and conversationally collected values

## Failure Tests

Run these after the happy path.

### Invalid Name

```text
/stencilcreate invalid name
```

Expected result:

- the command is rejected
- no template file is created

### Duplicate Name

Run again:

```text
/stencilcreate review-checklist
```

Expected result:

- Claude surfaces a handled conflict
- the existing template is not overwritten
- Claude asks the user to retry with a different name

### Cancel Before Save

Start:

```text
/stencilcreate cancelled-template
```

Use any valid description, tags, and body, then decline at the final confirmation.

After cancellation, run:

```text
/stencilshow cancelled-template
```

Expected result:

- the template is not found
- no file was written

## Minimal No-Placeholder Template

This is the lightest successful create case.

### 1. Create

```text
/stencilcreate release-notes
```

Description:

```text
Release notes skeleton
```

Tags:

```text
docs
```

Body:

```md
## Summary

- What changed
- Why it changed
- Rollout notes
```

Confirm the save preview.

### 2. Verify

```text
/stencilshow release-notes
/stencilrun release-notes
```

Expected result:

- `show` succeeds
- `run` succeeds without additional `key=value` inputs
- Claude still asks for final confirmation before execution

## Quick Troubleshooting

If Claude commands fail unexpectedly:

1. Rebuild core:

```bash
pnpm --filter @stencil-pm/core build
```

2. Re-run adapter tests:

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
```

3. Check shell syntax:

```bash
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

4. If `show` does not reflect recent core contract changes, verify `packages/core/dist/cli.js` was rebuilt.
