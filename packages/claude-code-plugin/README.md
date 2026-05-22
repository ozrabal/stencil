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
- For `create`, the skill-facing transport may pass the full template payload as JSON on stdin while preserving the public `/stencilcreate <name>` command shape
- The adapter does not coerce values and does not implement placeholder prompting in the shell bridge
- Public Claude flows invoke the core CLI with `--project-only` so discovery stays scoped to the current project's `.stencil/` tree for the MVP

Ownership boundaries:

- Skill files own user-facing guidance and the public command vocabulary
- Shell scripts own normalization, validation of command shape, and transport invocation
- `@stencil-pm/core` owns template discovery, validation, resolution, CRUD behavior, and future structured domain output
- Handled core outcomes are emitted as JSON on stdout with exit `0`
- Malformed invocation errors use stderr with exit `64`
- Transport/runtime failures use stderr with exit `70`

## Bridge Behavior

- One public command surface: `/stencil`, `/stencilinit`, `/stencilcreate`, `/stencillist`, `/stencilshow`, `/stencilrun`, `/stencildelete`
- Shared argument rules across router and direct commands
- A centralized shell transport entrypoint
- A real Node/core bridge backed by `@stencil-pm/core`
- Public adapter commands use explicit project-only scope instead of inheriting `~/.stencil` lookup implicitly
- `init` bootstraps `.stencil/`, `.stencil/templates/`, and a sample `quick-fix` template through core-owned logic
- Public `run` delegates to the internal core `resolve` command
- Internal bridge helpers `resolve`, `validate`, and `detect-context` remain available for adapter workflows

## Claude Flow Expectations

- `/stencilinit` should describe whether the project was freshly bootstrapped or was already initialized
- `/stencillist` should show only project-local templates and keep output to browse summaries
- `/stencilcreate <name>` should run as a conversational authoring flow that gathers the template description, optional tags, a Markdown body, and only the placeholder metadata needed for the MVP
- `/stencilshow <name>` should present template metadata, parsed body token summaries when available, placeholders, body, and validation warnings from core
- `/stencilrun <name> [key=value ...]` should stay transport-backed and prove the saved template with explicit inline values rather than adapter-side fill logic
- Skills own that presentation layer; shell scripts continue to forward JSON only

## Conversational Create Contract

The Epic 4 create flow is:

```text
/stencilcreate <name>
```

The skill should guide the user through this order:

1. Confirm the target template name.
2. Collect a required description.
3. Ask for optional comma-separated tags.
4. Collect the template body as normal Markdown in chat.
5. Inspect placeholders using the core token grammar.
6. Ask follow-up questions only when placeholder metadata is actually needed.
7. Show a save preview.
8. Persist through the existing `create` bridge.
9. Point the user to `/stencilshow <name>` and `/stencilrun <name> [key=value ...]`.

Placeholder handling rules:

- `{{$ctx.key}}` auto-resolves and does not require saved metadata.
- `{{input:name}}` and `{{input:name:default}}` may be saved without frontmatter placeholder entries.
- `{{name}}` may optionally be backed by saved placeholder metadata for richer inspection and later prompting.
- The adapter must not invent non-Stencil syntax or reimplement placeholder parsing in shell.

Create payload rules:

- `frontmatter.name` must match the command argument.
- `frontmatter.description` is required.
- `frontmatter.version` must be `1`.
- `tags` are optional and should be omitted when absent.
- `placeholders` are optional and should be written only when the user chose to save richer metadata.

Before save, the skill should preview:

- name
- description
- tags
- detected placeholders
- placeholder metadata that will be written
- body

Failure handling:

- cancellation writes nothing
- `validation_failed` means correctable template issues
- `error` means handled domain failure such as name conflict or storage failure
- overwrite stays out of scope

## Bootstrap Contract

The handled `init` JSON includes:

- `alreadyExisted`
- `createdPaths`
- `projectDir`
- `stencilDir`
- `sampleTemplateCreated`
- `sampleTemplateName`
- `sampleTemplatePath`

The default bootstrap sample is `quick-fix`, created only when the project has no existing project-local templates and the sample file is missing.

## Acceptance Path

The intended Epic 4 happy path is:

```text
/stencilinit
/stencilcreate review-checklist
/stencilshow review-checklist
/stencilrun review-checklist component_name=AuthService
```

## Validation

Run the adapter checks with:

```bash
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

For a manual Claude Code walkthrough, see [docs/testing-in-claude.md](/Users/piotrlepkowski/Private/stencil/packages/claude-code-plugin/docs/testing-in-claude.md).

## Status

The shell adapter remains transport-only. Conversational authoring and presentation live in the Claude skills, while template bootstrap, parsing, validation, persistence, and resolution stay in `@stencil-pm/core`.
