---
description: Inspect a focused code issue and propose a minimal safe fix.
name: quick-fix
version: 1
tags:
  - bootstrap
  - review
placeholders:
  - description: Relative path or file being inspected
    name: file_path
    required: true
  - description: Short summary of the bug, regression, or task
    name: issue_summary
    required: true
  - description: Non-negotiable constraints for the fix
    name: constraints
    required: false
    default: Preserve current behavior, keep the patch minimal, and call out tests
      that should run.
---

Review the change in {{input:file_path}} and propose the smallest safe fix.

Problem summary: {{input:issue_summary}}.
Constraints: {{input:constraints:Preserve current behavior, keep the patch minimal, and call out tests that should run.}}

Use project context when it helps:

- Project: {{$ctx.project_name}}
- Branch: {{$ctx.current_branch}}

Respond with:

1. Root cause
2. Minimal patch plan
3. Risks or follow-up checks
