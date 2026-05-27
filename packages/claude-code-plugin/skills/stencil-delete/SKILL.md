---
name: stencildelete
description: Handle the canonical /stencildelete command while delete behavior is still adapter-scoped.
---

# Purpose

Handle `/stencildelete` using the same routing contract as `/stencil delete <name>`, while keeping destructive confirmation in the Claude skill layer and deletion semantics in core.

# Accepted Form

```text
/stencildelete <name>
```

# Behavior

- Require a template name as the first positional token.
- Reject missing template names before transport invocation.
- Reject extra positional tokens after the template name.
- Inspect the target first through the shared `show` transport path.
- If the template is found, present a concise delete preview before any mutation.
- The delete preview must include:
  - template name
  - description
  - collection when present
  - project-local file path or clear project-local location text
- Ask for explicit confirmation after the preview and before invoking `delete`.
- Only on confirmation call the shared shell transport path for `delete`.
- If the user cancels, stop without invoking `delete`.
- Keep the public delete flow project-only for the MVP. A template that exists only outside the current project's `.stencil/` tree is treated as not found in this project.
- Treat a declined confirmation as a clean cancellation, not an error.

# Outcomes

- If `show` reports the template is missing, stop before confirmation and report that the template was not found in the current project.
- If `delete` returns `deleted: true`, report that the template was deleted from the project.
- If `delete` returns `deleted: false`, report that the template no longer exists in the current project.
- If `delete` returns `status=error`, present the handled delete failure without reinterpreting core error semantics.
- If a bridge/runtime failure happens before JSON is returned, explain that it is a transport failure rather than a handled delete outcome.
