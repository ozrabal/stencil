---
name: stencildelete
description: Handle the canonical /stencildelete command while delete behavior is still adapter-scoped.
---

# Purpose

Handle `/stencildelete` using the same routing contract as `/stencil delete <name>`.

# Accepted Form

```text
/stencildelete <name>
```

# Behavior

- Require a template name as the first positional token.
- Reject missing template names before transport invocation.
- Reject extra positional tokens after the template name.
- After validation, hand off to the shared shell transport path for `delete`.
- Do not add confirmation prompts or destructive file behavior in Epic 1.
