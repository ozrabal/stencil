---
name: stencilinit
description: Handle the canonical /stencilinit command for project initialization.
---

# Purpose

Handle `/stencilinit` using the same routing contract as `/stencil init`.

# Accepted Form

```text
/stencilinit
```

# Behavior

- Accept no positional arguments.
- If extra tokens are supplied, reject the command before transport invocation.
- After validation, hand off to the shared shell transport path for `init`.
- Do not create files or simulate `@stencil-pm/core` behavior in Epic 1.
