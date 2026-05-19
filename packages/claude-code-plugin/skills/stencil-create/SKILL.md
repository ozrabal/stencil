---
name: stencilcreate
description: Handle the canonical /stencilcreate command for template creation.
---

# Purpose

Handle `/stencilcreate` using the same routing contract as `/stencil create <name>`.

# Accepted Form

```text
/stencilcreate <name>
```

# Behavior

- Require a template name as the first positional token.
- Reject missing template names before transport invocation.
- Reject extra positional tokens after the template name.
- After validation, hand off to the shared shell transport path for `create`.
- Do not prompt for frontmatter fields or implement template creation locally in Epic 1.
