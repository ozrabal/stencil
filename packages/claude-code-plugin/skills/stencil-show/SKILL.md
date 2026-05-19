---
name: stencilshow
description: Handle the canonical /stencilshow command for template inspection.
---

# Purpose

Handle `/stencilshow` using the same routing contract as `/stencil show <name>`.

# Accepted Form

```text
/stencilshow <name>
```

# Behavior

- Require a template name as the first positional token.
- Reject missing template names before transport invocation.
- Reject extra positional tokens after the template name.
- After validation, hand off to the shared shell transport path for `show`.
- Do not display template frontmatter, placeholders, or body locally in Epic 1.
