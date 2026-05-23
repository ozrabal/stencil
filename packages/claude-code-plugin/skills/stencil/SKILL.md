---
name: stencil
description: Main Stencil router for the canonical /stencil command surface.
---

# Purpose

Handle the canonical `/stencil` router. This skill owns user-facing command guidance and subcommand dispatch only. It must not implement Stencil business logic locally.

# Accepted Forms

```text
/stencil
/stencil help
/stencil <subcommand>
/stencil <subcommand> <template-name> [key=value ...]
```

Supported subcommands:

- `init`
- `create`
- `list`
- `show`
- `run`
- `delete`

# Router Behavior

- If invoked as `/stencil` with no subcommand, show the canonical help text below.
- If invoked as `/stencil help`, show the same canonical help text.
- If the first token is not one of the supported subcommands, reply with a short corrective message that tells the user to run `/stencil help`.
- If the subcommand is valid, route using the same contract as the matching direct command.
- Do not invent placeholder prompting, fallback parsing, or template file behavior in this skill.

# Argument Rules

- `init` and `list` take no additional positional tokens.
- `create`, `show`, `run`, and `delete` require a template name as the first positional token after the subcommand.
- `run` may include trailing literal `key=value` tokens after the template name.
- Preserve `run` inline arguments in order and unchanged.

# Canonical Help Text

```text
Stencil commands:
  /stencil help
  /stencil init
  /stencil create <name>
  /stencil list
  /stencil show <name>
  /stencil run <name> [key=value ...]
  /stencil delete <name>

Direct commands:
  /stencilinit
  /stencilcreate <name>
  /stencillist
  /stencilshow <name>
  /stencilrun <name> [key=value ...]
  /stencildelete <name>
```

# Bridge Behavior

After argument validation, route to the matching direct-command contract.

- Shared shell transport stays responsible for normalization and bridge invocation.
- `run` resolves through core and may continue as a conversational completion flow in `skills/stencil-run`.
- Do not simulate template operations or bypass the real bridge.
