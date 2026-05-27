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
- After validation, invoke the shared shell transport path for `run`.
- Use the handled core resolve envelope as the only source of truth for resolution state.
- Keep conversational prompting, cancellation handling, and final execution handoff in this skill.
- Do not parse template files manually or reimplement resolution semantics locally.

# Resolve Contract

The transport-backed `run` path delegates to the core `resolve` command and returns a handled JSON envelope with:

- `status=ok` when all required inputs are resolved
- `status=needs_input` when unresolved required inputs remain
- `status=validation_failed` when the template is invalid for resolve
- `status=error` for handled domain failures such as template-not-found

Use `data.inputs`, `data.placeholders`, `data.resolvedBody`, and `data.unresolvedCount` directly. Do not invent an adapter-only result format.

# Conversational Flow

Run the command as this loop:

1. Validate the public command shape.
2. Invoke the shared `run` transport with the template name and accumulated inline `key=value` inputs.
3. Inspect the returned envelope.
4. If `status=needs_input`, ask only for unresolved required inputs in the order provided by `data.inputs`.
5. Add each conversational answer as one more explicit `key=value` input and re-run the same transport call.
6. Stop the loop when either:
   - `data.unresolvedCount === 0`, or
   - the user cancels
7. After full resolution, show a concise provenance summary, show the resolved prompt, and ask for explicit confirmation before continuing with the resolved prompt as the next task instruction.

# Missing-Input Rules

- Prompt only for entries in `data.inputs` whose `source` is `unresolved`.
- Do not ask again for values already satisfied by:
  - inline explicit args
  - conversational answers already collected in this run
  - `$ctx.*` context
  - inline defaults
  - frontmatter defaults
- Preserve prompt order from core. Do not sort alphabetically.
- Use `input.description` when present.
- If `input.description` is absent, ask using the normalized input `name`.
- If `input.defaultValue` is present for an unresolved input, mention it briefly as an available default, but still treat the answer the user gives as the next explicit value.
- If the user cancels during input collection, stop without another resolve call and do not perform the final execution handoff.

# Success Presentation

When `status` is `ok`, present:

- the template name
- a concise provenance summary grouped by source:
  - explicit values supplied up front
  - values collected conversationally in this run
  - context-resolved values
  - default-resolved values
- the resolved prompt in a fenced text block
- a short final execute-or-cancel question

The provenance summary must come from `data.inputs` and `data.placeholders`, not from skill-local inference.

# Error Handling

- If `status` is `validation_failed`, surface the validation issues as correctable template problems and stop.
- If `status` is `error`, show the handled error clearly and stop.
- If the template is not found, point the user back to `/stencillist` or `/stencilshow <name>`.
- If a transport/runtime failure happens outside the JSON envelope, explain that it is a bridge failure rather than a handled template outcome.
- Do not print raw JSON or shell details for handled outcomes.

# Execution Handoff

- After a successful resolve, require explicit user confirmation before executing the resolved prompt.
- If the user confirms, continue the Claude conversation using the resolved prompt as the next task instruction.
- If the user declines at the final confirmation step, stop without executing the resolved prompt.
- A declined final confirmation is a clean cancellation, not an error.
