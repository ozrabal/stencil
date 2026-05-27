---
name: stencilshow
description: Handle the canonical /stencilshow command for template inspection.
---

# Purpose

Handle `/stencilshow` using the same routing contract as `/stencil show <name>`, then present the handled core `show` JSON as the canonical inspection flow.

# Accepted Form

```text
/stencilshow <name>
```

# Behavior

- Require a template name as the first positional token.
- Reject missing template names before transport invocation.
- Reject extra positional tokens after the template name.
- Invoke the shared shell transport path for `show`.
- Use the handled JSON envelope directly. Validation ownership stays in core.

# Presentation

- If `status` is `ok`, present:
  - template name and description
  - version, collection, tags, author, source, and file path
  - body token summary when core provides parsed `bodyTokens`
  - placeholder summary when placeholders exist
  - the template body in a fenced Markdown block
- If `data.validation.valid` is `true` but `data.validation.issues` contains warnings, surface those warnings explicitly.
- After a successful inspection, point the user to `/stencilrun <name>` or back to `/stencillist`.
- If `status` is `error`, show the handled error and point the user back to `/stencillist`.
- Do not re-run validation or reinterpret warning semantics in the skill layer.
