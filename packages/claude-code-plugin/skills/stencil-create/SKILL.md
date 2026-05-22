---
name: stencilcreate
description: Handle the canonical /stencilcreate command as a conversational Stencil template authoring flow.
---

# Purpose

Handle `/stencilcreate` using the same public command shape as `/stencil create <name>`, but complete the authoring flow conversationally before handing persistence to the shared transport and core CLI.

# Accepted Form

```text
/stencilcreate <name>
```

# Behavior

- Require a template name as the first positional token.
- Reject missing template names before transport invocation.
- Reject extra positional tokens after the template name.
- Keep the public command shape fixed at `/stencilcreate <name>`.
- Own the conversational UX in the skill layer.
- Keep shell scripts transport-only.
- Keep validation, placeholder parsing semantics, and persistence in `@stencil-pm/core`.

# Conversational Flow

Follow this authoring order:

1. Confirm the target template name.
2. Collect a required one-line template description.
3. Ask for optional tags as a comma-separated list. Omit `tags` if the user does not provide any.
4. Collect the template body as normal Markdown supplied directly in chat.
5. Inspect placeholders from the drafted body using the core token grammar as the source of truth.
6. Ask follow-up questions only for placeholder metadata the MVP actually needs.
7. Show a save preview.
8. Persist through the shared `create` bridge path.
9. After success, direct the user to `/stencilshow <name>` and `/stencilrun <name> [key=value ...]`.

# Placeholder Rules

Treat the body as the canonical source of placeholder usage.

- `{{$ctx.key}}`
  Explain that context placeholders auto-resolve when available and do not need saved placeholder metadata.
- `{{input:name}}`
  Inline input with no default. It may be saved without frontmatter placeholder metadata.
- `{{input:name:default value}}`
  Inline input with an inline default. Do not ask the user to duplicate that default in frontmatter unless they explicitly want a frontmatter-backed placeholder entry.
- `{{name}}`
  Legacy placeholder reference. Ask whether the user wants to save matching placeholder metadata for later prompting and inspection.
- Invalid inline input tokens such as `{{input:}}` or `{{input:name:}}`
  Treat these as correctable validation problems. Ask the user to fix the body before saving.

When richer placeholder metadata is desired, keep it minimal:

- `name`
- `description`
- `required` only when not already implied
- `default` only when the user explicitly wants frontmatter-backed defaults for legacy placeholders

Do not invent adapter-only syntax or hidden metadata.

# Save Contract

Persist through the existing shared transport path for `create` using stdin JSON aligned with the core CLI contract:

```json
{
  "frontmatter": {
    "name": "<command-argument>",
    "description": "<required description>",
    "version": 1,
    "tags": ["optional", "tags"],
    "placeholders": [
      {
        "name": "component_name",
        "description": "Component under review",
        "required": true
      }
    ]
  },
  "body": "Template body",
  "collection": null
}
```

Rules:

- `frontmatter.name` must match the command argument exactly.
- `frontmatter.version` must be `1`.
- Omit `tags` when the user did not provide them.
- Omit `placeholders` when the body is valid and richer metadata is unnecessary.
- Do not add shell-side business logic that duplicates core validation or parsing.

# Save Preview

Before persisting, show a concise preview containing:

- template name
- description
- tags, if any
- detected placeholder summary
- any placeholder metadata that will be written into frontmatter
- the body in a fenced Markdown block

Require an explicit user confirmation before save.

# Failure Handling

- If the user cancels before confirmation, stop with no file write.
- If core returns `status=validation_failed`, surface the issues as correctable template problems and ask the user to revise the body or metadata.
- If core returns `status=error` with a conflict or invalid-name failure, explain the handled error and ask the user to retry with a different valid template name.
- Do not implement overwrite behavior in this flow.

# Success Path

After a successful save:

- confirm the template was saved project-locally
- point the user to `/stencilshow <name>` for inspection
- point the user to `/stencilrun <name> [key=value ...]` to prove the template resolves
