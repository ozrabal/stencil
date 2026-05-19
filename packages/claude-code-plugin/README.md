# @stencil-pm/claude-code-plugin

Claude Code adapter for Stencil template management.

## Overview

This package provides Skills for Claude Code that expose Stencil template operations as slash commands. It follows the adapter boundary from [docs/stencil-architecture.md](/Users/piotrlepkowski/Private/stencil/docs/stencil-architecture.md): the Claude Code package owns command UX and transport only, while `@stencil-pm/core` owns real template logic.

## Canonical Command Surface

| Internal Skill Dir      | Public Command   | Description                      |
| ----------------------- | ---------------- | -------------------------------- |
| `skills/stencil`        | `/stencil`       | Main router for Stencil commands |
| `skills/stencil-init`   | `/stencilinit`   | Initialize Stencil in a project  |
| `skills/stencil-create` | `/stencilcreate` | Create a new template            |
| `skills/stencil-list`   | `/stencillist`   | List all templates               |
| `skills/stencil-show`   | `/stencilshow`   | Show template details            |
| `skills/stencil-run`    | `/stencilrun`    | Render a template                |
| `skills/stencil-delete` | `/stencildelete` | Delete a template                |

Internal skill directory names remain hyphenated for now. That directory layout is an implementation detail and not part of the public command contract.

## Routing Contract

Router grammar:

```text
/stencil
/stencil help
/stencil <subcommand>
/stencil <subcommand> <template-name> [key=value ...]
```

Direct command grammar:

```text
/stencilinit
/stencilcreate <name>
/stencillist
/stencilshow <name>
/stencilrun <name> [key=value ...]
/stencildelete <name>
```

Argument rules:

- Commands that require a template name: `create`, `show`, `run`, `delete`
- Commands that do not accept extra tokens: `init`, `list`
- For `run`, the first positional token after the command is the template name and every remaining token must be passed through as a literal `key=value` input
- The adapter does not coerce values and does not implement placeholder prompting in Epic 1

Ownership boundaries:

- Skill files own user-facing guidance and the public command vocabulary
- Shell scripts own normalization, validation of command shape, and transport invocation
- `@stencil-pm/core` owns template discovery, validation, resolution, CRUD behavior, and future structured domain output

## Epic 1 Guarantees

- One public command surface: `/stencil`, `/stencilinit`, `/stencilcreate`, `/stencillist`, `/stencilshow`, `/stencilrun`, `/stencildelete`
- Shared argument rules across router and direct commands
- A centralized shell transport entrypoint
- A stable temporary bridge failure until Epic 2 adds the real Node/core bridge

## Validation

Run the adapter checks with:

```bash
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

## Status

Epic 1 provides a routing shell only. Business behavior is intentionally not implemented in this package yet. Until Epic 2 lands, successful command routing ends in an explicit bridge-unavailable transport response instead of local template logic.
