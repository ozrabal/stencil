---
name: stencillist
description: Handle the canonical /stencillist command for template listing.
---

# Purpose

Handle `/stencillist` using the same routing contract as `/stencil list`, then present the handled core `list` JSON as a project-scoped browse flow.

# Accepted Form

```text
/stencillist
```

# Behavior

- Accept no positional arguments.
- If extra tokens are supplied, reject the command before transport invocation.
- Invoke the shared shell transport path for `list`.
- Treat the JSON envelope as the authoritative list result. Do not inspect `.stencil/` manually.
- Keep the command intentionally project-scoped and concise for the MVP.

# Presentation

- If `status` is `ok` and `data.templates` is empty, say no project templates were found.
- In the empty state, suggest `/stencilinit` when the project is not bootstrapped yet; otherwise suggest `/stencilcreate <name>`.
- If `status` is `ok` and templates exist, present one concise summary entry per template with:
  - name
  - description
  - collection when present
  - tags when present
  - version
- Keep bodies and validation details out of list output. Those belong to `/stencilshow <name>`.
- If `status` is `error`, show the handled error plainly and stop.
