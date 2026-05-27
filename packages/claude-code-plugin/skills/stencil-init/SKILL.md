---
name: stencilinit
description: Handle the canonical /stencilinit command for project initialization.
---

# Purpose

Handle `/stencilinit` using the same routing contract as `/stencil init`, then present the handled core `init` JSON as a first-use onboarding flow.

# Accepted Form

```text
/stencilinit
```

# Behavior

- Accept no positional arguments.
- If extra tokens are supplied, reject the command before transport invocation.
- Invoke the shared shell transport path for `init`.
- Treat the core JSON envelope as the source of truth. Do not infer bootstrap results from filesystem inspection.
- Public Claude behavior must stay project-scoped; rely on the bridge contract rather than mentioning global templates.

# Presentation

- If `status` is `ok` and `data.sampleTemplateCreated` is `true`, explain that Stencil bootstrapped the local `.stencil/` project scaffold and created the sample template `quick-fix`.
- In that first-bootstrap path, tell the user the next useful commands:
  - `/stencillist`
  - `/stencilshow quick-fix`
  - `/stencilrun quick-fix ...`
  - `/stencilcreate <name>`
- If `status` is `ok` and `data.alreadyExisted` is `true`, use a shorter already-initialized response.
- In that already-initialized path, point the user to:
  - `/stencillist`
  - `/stencilshow <name>`
  - `/stencilrun <name> ...`
  - `/stencilcreate <name>`
- If `status` is `error`, show the handled error plainly and stop.
- Do not infer bootstrap state from the filesystem. Distinguish only first bootstrap, already initialized, and handled failure because those are the states the bridge actually returns.
- Keep formatting and guidance in the skill layer. Do not move presentation into shell output.
