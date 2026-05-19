---
name: stencillist
description: Handle the canonical /stencillist command for template listing.
---

# Purpose

Handle `/stencillist` using the same routing contract as `/stencil list`.

# Accepted Form

```text
/stencillist
```

# Behavior

- Accept no positional arguments.
- If extra tokens are supplied, reject the command before transport invocation.
- After validation, hand off to the shared shell transport path for `list`.
- Do not implement template discovery or display formatting locally in Epic 1.
