# @stencil-pm/claude-code-plugin

Claude Code adapter for Stencil template management.

## Overview

This package provides Skills for Claude Code that expose Stencil template operations as slash commands. It follows the adapter boundary from [docs/stencil-architecture.md](/Users/piotrlepkowski/Private/stencil/docs/stencil-architecture.md): the Claude Code package owns command UX, conversational orchestration, and transport, while `@stencil-pm/core` owns template parsing, validation, context resolution, and placeholder resolution.

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

## Handled Outcomes

The Claude adapter must trust the core CLI JSON envelope as the source of truth for handled outcomes. This preserves the boundary in [docs/stencil-architecture.md](/Users/piotrlepkowski/Private/stencil/docs/stencil-architecture.md): `@stencil-pm/core` owns template semantics and structured results, while the adapter owns presentation, next-step guidance, and conversational control flow.

Adapter invariants:

- trust the JSON envelope instead of scraping shell text or manually inspecting `.stencil/`
- do not print raw JSON in Claude-facing responses
- do not expose shell internals unless the failure is a real transport/runtime failure outside the JSON envelope
- keep follow-up bridge calls explicit and contract-driven, such as delete preview via `show` before `delete`
- keep MVP flows offline-first and local-file-backed

Shared outcome meanings:

- `status=ok`: the command succeeded and Claude should present the returned data plus the next useful command
- `status=needs_input`: only `resolve`/`run` uses this; Claude should ask only for unresolved required inputs from `data.inputs`, then re-run the same transport-backed resolve flow
- `status=validation_failed`: core found correctable template issues; Claude should surface the issues plainly and stop or request correction without guessing repairs
- `status=error`: core handled the failure and returned a typed domain or storage error; Claude should present the handled error clearly and stop
- exit `64`: the public adapter invocation was malformed and failed on stderr before the bridge invoked core
- exit `70`: the bridge failed before any handled JSON envelope existed, such as a missing or broken core CLI path

## Command Outcome Matrix

| Command  | `status=ok`                                                 | `status=needs_input`              | `status=validation_failed`       | `status=error`                            | exit `64` / exit `70`                   |
| -------- | ----------------------------------------------------------- | --------------------------------- | -------------------------------- | ----------------------------------------- | --------------------------------------- |
| `init`   | bootstrap succeeded or project was already initialized      | never                             | never                            | handled bootstrap or storage failure      | malformed args / bridge runtime failure |
| `list`   | template summaries, including an empty list                 | never                             | never                            | handled list or read failure              | malformed args / bridge runtime failure |
| `show`   | template detail, body, and validation warnings when present | never                             | never                            | handled not-found or read failure         | malformed args / bridge runtime failure |
| `create` | template saved                                              | never                             | draft is invalid but correctable | handled conflict or storage failure       | malformed args / bridge runtime failure |
| `run`    | fully resolved prompt ready for final confirmation          | unresolved required inputs remain | template is invalid for resolve  | handled not-found or other domain failure | malformed args / bridge runtime failure |
| `delete` | deleted, or `deleted: false` when already gone              | never                             | never                            | handled delete or storage failure         | malformed args / bridge runtime failure |

Handled outcomes stay in the Claude conversation. Stderr-only failures with exit `64` or exit `70` remain transport failures because they happen before or outside the handled JSON contract.

## Bridge Behavior

- One public command surface: `/stencil`, `/stencilinit`, `/stencilcreate`, `/stencillist`, `/stencilshow`, `/stencilrun`, `/stencildelete`
- Shared argument rules across router and direct commands
- A centralized shell transport entrypoint
- A real Node/core bridge backed by `@stencil-pm/core`
- Public adapter commands use explicit project-only scope instead of inheriting `~/.stencil` lookup implicitly
- `init` bootstraps `.stencil/`, `.stencil/templates/`, and a sample `quick-fix` template through core-owned logic
- Public `run` delegates to the internal core `resolve` command
- Internal bridge helpers `resolve`, `validate`, and `detect-context` remain available for adapter workflows
- `detect-context` is an internal helper, not a public slash command

## Claude Flow Expectations

- `/stencilinit` should describe whether the project was freshly bootstrapped or was already initialized
- `/stencillist` should show only project-local templates and keep output to browse summaries
- `/stencilcreate <name>` should run as a conversational authoring flow that gathers the template description, optional tags, a Markdown body, and only the placeholder metadata needed for the MVP
- `/stencilshow <name>` should present template metadata, parsed body token summaries when available, placeholders, body, and validation warnings from core
- `/stencilrun <name> [key=value ...]` should stay transport-backed, resolve through core, collect only unresolved required inputs conversationally, and ask for final confirmation before executing the resolved prompt
- `/stencildelete <name>` should inspect the target through `show`, present a destructive preview, require explicit confirmation, and only then invoke `delete`
- Skills own that presentation layer; shell scripts continue to forward JSON only

Read-path presentation rules:

- `/stencilinit` should distinguish only states the bridge returns: first bootstrap, already initialized, or handled failure
- `/stencillist` should say no project templates were found and suggest `/stencilinit` or `/stencilcreate <name>` without claiming more than the envelope proves
- `/stencilshow <name>` should surface validation warnings from core without revalidating or reinterpreting them

## Run Contract

`/stencilrun <name> [key=value ...]` is the public run flow.

Resolution ownership:

- core owns template loading, validation, context lookup, normalization, and placeholder resolution
- the Claude skill owns question wording, repeated `resolve` calls, cancellation handling, provenance presentation, and the final execution handoff
- shell scripts only pass argv/stdin through and return stdout/stderr/exit codes

Handled resolve outcomes:

- `status=ok`: show provenance, show the resolved prompt, ask for final confirmation
- `status=needs_input`: ask only for unresolved required inputs from `data.inputs`, then re-run `resolve` with accumulated explicit values
- `status=validation_failed`: show validation issues and stop
- `status=error`: show the handled error and stop

Prompting rules:

- ask only for inputs whose core-reported `source` is `unresolved`
- never ask again for values already satisfied by explicit args, context, or defaults
- preserve the input order returned by core
- cancellation during collection stops the flow without another resolve call or execution handoff

Completion handoff:

- after full resolution, present a concise provenance summary for explicit, conversational, context, and default values
- show the resolved prompt in a fenced block
- require explicit confirmation before continuing with the resolved prompt as the next task

## Delete Contract

`/stencildelete <name>` is the public destructive flow.

Deletion ownership:

- core owns template lookup semantics, project-local deletion, and structured delete errors
- the Claude skill owns destructive wording, preview presentation, confirmation, and cancellation handling
- shell scripts only validate command shape and forward `show` and `delete` through the shared bridge

Delete flow:

1. inspect the target through `show`
2. if found, present a concise delete preview with the name, description, collection when present, and project-local file path
3. ask for explicit confirmation that the project-local template file should be removed
4. only on confirmation invoke `delete`

Handled delete outcomes:

- if the initial `show` path reports `status=error`, stop and report that the template was not found in the current project
- if `delete` returns `deleted: true`, report that the template was deleted
- if `delete` returns `deleted: false`, report that the template no longer exists in the current project
- if `delete` returns `status=error`, report that deletion failed and surface the handled storage or filesystem context

Cancellation rule:

- if the user declines confirmation, stop without invoking `delete`

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
9. Point the user to `/stencilshow <name>` and `/stencilrun <name> [key=value ...]`, explaining that run can now finish from inline values, defaults, context, and conversational follow-up.

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

Runtime boundary:

- handled filesystem failures remain JSON `status=error` outcomes
- malformed public invocations remain exit `64` stderr failures
- bridge/runtime failures such as a missing `STENCIL_CORE_CLI_PATH` remain exit `70` stderr failures

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

The intended Epic 5 happy path is:

```text
/stencilinit
/stencilcreate review-checklist
/stencilshow review-checklist
/stencilrun review-checklist component_name=AuthService
```

The intended missing-input path is:

```text
/stencilrun review-checklist
```

Expected behavior:

- Claude reuses the same transport-backed resolve call
- Claude asks only for unresolved required inputs
- Claude does not ask for values already satisfied by `$ctx.*` or defaults
- Claude shows the final resolved prompt and asks for explicit confirmation before execution

The intended Epic 6 delete path is:

```text
/stencilinit
/stencilcreate review-checklist
/stencilshow review-checklist
/stencildelete review-checklist
```

Expected behavior:

- Claude previews the existing project-local template before deletion
- Claude makes the destructive action explicit
- Claude invokes delete only after confirmation
- Claude reports a clear deleted, cancelled, not-found, or delete-failed outcome

## Validation

Run the adapter checks with:

```bash
pnpm --filter @stencil-pm/core build
pnpm --filter @stencil-pm/core test
pnpm --filter @stencil-pm/claude-code-plugin lint
pnpm --filter @stencil-pm/claude-code-plugin test
bash -n packages/claude-code-plugin/scripts/*.sh
bash -n packages/claude-code-plugin/scripts/lib/*.sh
```

Release gate before shipment:

- `pnpm --filter @stencil-pm/core build`
- `pnpm --filter @stencil-pm/core test`
- `pnpm --filter @stencil-pm/claude-code-plugin lint`
- `pnpm --filter @stencil-pm/claude-code-plugin test`
- no network prerequisite should be required for MVP validation or public command flows

For a manual Claude Code walkthrough, see [docs/testing-in-claude.md](/Users/piotrlepkowski/Private/stencil/packages/claude-code-plugin/docs/testing-in-claude.md).

## Status

The shell adapter remains transport-only. Conversational authoring, missing-input completion, and presentation live in the Claude skills, while template bootstrap, parsing, validation, persistence, context resolution, and placeholder resolution stay in `@stencil-pm/core`.
