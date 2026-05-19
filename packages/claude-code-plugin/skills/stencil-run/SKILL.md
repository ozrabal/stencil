---
name: stencilrun
description: Handle the canonical /stencilrun command for template rendering.
---

# Purpose

Handle `/stencilrun` using the same routing contract as `/stencil run <name> [key=value ...]`.

# Accepted Form

```text
/stencilrun <name> [key=value ...]
```

# Behavior

- Require a template name as the first positional token.
- Treat every remaining token as a literal inline `key=value` input.
- Preserve inline arguments in order and unchanged.
- Reject missing template names before transport invocation.
- Reject malformed inline tokens that do not contain `=`.
- After validation, hand off to the shared shell transport path for `run`.
- Do not prompt for placeholders or implement template resolution locally in Epic 1.
