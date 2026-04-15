# Prompt Manager — Product Requirements Document

**Codename:** Stencil
**Version:** 0.1.0 (Draft)
**Date:** 2026-04-08
**Author:** Piotr Lepkowski
**Status:** Draft

---

## 1. Vision

**Stencil** is an open-source prompt management tool that gives users a structured way to **create, organize, store, and execute reusable prompt templates** with dynamic placeholders. It turns ad-hoc prompting into a repeatable, shareable workflow — accessible to developers and non-technical users alike.

Stencil ships as an open-source project with adapters for Claude Code, VS Code, Codex, and other AI coding tools. The name reflects the core metaphor: a stencil is a reusable template with cutouts you fill in — exactly what this tool does for prompts.

---

## 2. Problem Statement

Users of Claude Code frequently:

- Re-type or copy-paste similar prompts across sessions and projects.
- Lose effective prompts because there is no structured storage.
- Struggle to share proven prompts with teammates — prompts live in personal notes, Slack messages, or wikis disconnected from the tool.
- Waste time manually substituting context (file names, module names, languages) into prompt text.

There is no first-class mechanism in Claude Code to **manage prompts as reusable, parameterized artifacts** that live alongside the codebase.

---

## 3. Target Users

| Persona                     | Description                                                            | Primary need                                                                                          |
| --------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Developer**               | Uses Claude Code daily for coding tasks                                | Reuse complex prompts (refactoring recipes, review checklists, migration playbooks) without re-typing |
| **Tech Lead / Architect**   | Defines team standards and workflows                                   | Distribute curated prompts to the team via version control                                            |
| **Non-technical user**      | PM, designer, or writer using Claude Code for docs, specs, or analysis | Access pre-built prompts without needing to craft them from scratch                                   |
| **Open-source contributor** | Community member                                                       | Share and discover prompt templates across projects                                                   |

---

## 4. Core Concepts

### 4.1 Template

A reusable prompt stored as a Markdown file with YAML frontmatter. Templates are the atomic unit of the system.

```markdown
---
name: create-rest-endpoint
description: Generate a REST endpoint with validation and tests
version: 1
author: piotr
tags: [backend, rest, java]
placeholders:
  - name: entity_name
    description: Name of the domain entity (e.g., User, Invoice)
    required: true
  - name: operations
    description: CRUD operations to generate
    required: true
    default: 'create, read, update, delete'
  - name: auth_required
    description: Whether endpoints require authentication
    required: false
    default: 'true'
---

Create a REST endpoint for the **{{entity_name}}** entity.

Operations to implement: {{operations}}.

Authentication required: {{auth_required}}.

Follow the existing patterns in the codebase for controller, service, and repository layers.
Include input validation and unit tests.
```

### 4.2 Placeholder

A named variable inside a template, delimited by `{{` and `}}`. Placeholders are declared in the frontmatter with metadata (description, required/optional, default value) and resolved at execution time.

**Resolution order (highest priority first):**

1. Explicit user input (passed as arguments or provided interactively)
2. Environment auto-resolve (built-in context variables)
3. Default value from frontmatter
4. Interactive prompt — Claude asks the user

### 4.3 Collection

A named group of templates organized by purpose. Maps to a subdirectory.

```text
.stencil/
  collections/
    backend/
      create-rest-endpoint.md
      add-migration.md
    review/
      security-review.md
      performance-review.md
    docs/
      write-adr.md
```

### 4.4 Built-in Context Variables

Placeholders that auto-resolve from the environment without user input. They use a `$ctx.` prefix to distinguish them from user-defined placeholders.

| Variable                  | Resolves to                                                               |
| ------------------------- | ------------------------------------------------------------------------- |
| `{{$ctx.project_name}}`   | Name of the current project (directory name or from package.json/pom.xml) |
| `{{$ctx.current_branch}}` | Current git branch                                                        |
| `{{$ctx.language}}`       | Primary language of the project (detected from config files)              |
| `{{$ctx.date}}`           | Current date (ISO 8601)                                                   |
| `{{$ctx.git_user}}`       | Git user name from config                                                 |
| `{{$ctx.os}}`             | Operating system                                                          |
| `{{$ctx.cwd}}`            | Current working directory                                                 |

The set of context variables is extensible — plugins and future versions can register additional resolvers.

---

## 5. Functional Requirements

### 5.1 Template Management (CRUD)

| ID   | Requirement                                                                        | Priority |
| ---- | ---------------------------------------------------------------------------------- | -------- |
| TM-1 | Create a new template from a slash command (`/stencilcreate <name>`)               | P0       |
| TM-2 | Create a template from the current conversation ("save this prompt as a template") | P1       |
| TM-3 | List all available templates (`/stencillist`) with optional tag/collection filter  | P0       |
| TM-4 | View a template's content and metadata (`/stencilshow <name>`)                     | P0       |
| TM-5 | Edit an existing template (`/stenciledit <name>`)                                  | P1       |
| TM-6 | Delete a template (`/stencildelete <name>`)                                        | P1       |
| TM-7 | Duplicate a template (`/stencilcopy <source> <target>`)                            | P2       |
| TM-8 | Search templates by name, description, or tags (`/stencilsearch <query>`)          | P1       |

### 5.2 Template Execution

| ID   | Requirement                                                                                                    | Priority |
| ---- | -------------------------------------------------------------------------------------------------------------- | -------- |
| TE-1 | Execute a template by name (`/stencilrun <name>`)                                                              | P0       |
| TE-2 | Pass placeholder values inline (`/stencilrun create-rest-endpoint entity_name=Invoice operations=create,read`) | P0       |
| TE-3 | For missing required placeholders without defaults, Claude asks the user interactively one by one              | P0       |
| TE-4 | Auto-resolve `$ctx.*` placeholders from environment                                                            | P0       |
| TE-5 | Apply default values for optional placeholders when not provided                                               | P0       |
| TE-6 | Show a summary of all placeholder values before execution and ask for confirmation                             | P1       |
| TE-7 | Allow the user to override auto-resolved and default values during confirmation                                | P1       |
| TE-8 | Support dry-run mode that shows the fully resolved prompt without executing it (`/stencilrun --dry <name>`)    | P2       |

### 5.3 Collection Management

| ID   | Requirement                                                              | Priority |
| ---- | ------------------------------------------------------------------------ | -------- |
| CM-1 | Create a collection (`/stencilcollection create <name>`)                 | P1       |
| CM-2 | Move/assign templates to collections                                     | P1       |
| CM-3 | List templates within a collection (`/stencillist --collection backend`) | P1       |

### 5.4 Storage

| ID   | Requirement                                                                              | Priority |
| ---- | ---------------------------------------------------------------------------------------- | -------- |
| ST-1 | Store templates as individual `.md` files in `.stencil/` directory within the project    | P0       |
| ST-2 | The `.stencil/` directory is git-committable — teams share templates via version control | P0       |
| ST-3 | Support a global/personal template directory at `~/.stencil/` for user-wide templates    | P1       |
| ST-4 | When names collide, project-level templates take precedence over global templates        | P1       |
| ST-5 | Template files are human-readable and editable outside of the plugin (plain Markdown)    | P0       |

### 5.5 Validation

| ID   | Requirement                                                                 | Priority |
| ---- | --------------------------------------------------------------------------- | -------- |
| VA-1 | Validate template frontmatter on save (required fields, valid YAML)         | P0       |
| VA-2 | Warn if a template body references placeholders not declared in frontmatter | P0       |
| VA-3 | Warn if frontmatter declares placeholders not used in the template body     | P1       |

---

## 6. Non-Functional Requirements

| ID   | Requirement                                                                               | Priority |
| ---- | ----------------------------------------------------------------------------------------- | -------- |
| NF-1 | No external dependencies — the plugin must work offline with local files only             | P0       |
| NF-2 | Template parsing and resolution must be near-instantaneous (<100ms for a single template) | P0       |
| NF-3 | All file operations respect the user's Claude Code permission settings                    | P0       |
| NF-4 | Works on macOS, Linux, and Windows (WSL)                                                  | P0       |
| NF-5 | Clear, actionable error messages for all failure cases                                    | P0       |
| NF-6 | MIT license                                                                               | P0       |

---

## 7. User Flows

### 7.1 First-Time Setup

```text
User installs plugin → runs /stencilinit
→ Plugin creates .stencil/ directory with a sample template
→ Plugin explains the basic commands
```

### 7.2 Create and Run a Template

```text
User runs /stencilcreate review-checklist
→ Claude asks for description, tags, and placeholders
→ User provides: description="Code review checklist", tags=[review],
   placeholders: [component_name (required), review_type (default: "general")]
→ User writes the template body with {{component_name}} and {{review_type}}
→ Plugin saves to .stencil/review-checklist.md
→ User validates with /stencilshow review-checklist

Later:
User runs /stencilrun review-checklist component_name=AuthService
→ Plugin resolves: component_name=AuthService, review_type=general (default)
→ Claude shows resolved prompt, asks for confirmation
→ User confirms → Claude executes the prompt
```

### 7.3 Team Sharing

```text
Developer A creates templates in .stencil/ → commits to git
Developer B pulls the repo → templates are immediately available via /stencillist
Developer B runs /stencilrun create-rest-endpoint → same experience as Developer A
```

### 7.4 Non-Technical User

```text
PM opens Claude Code in the project directory
→ runs /stencillist → sees templates created by the dev team
→ runs /stencilrun write-adr
→ Claude asks: "What is the decision title?" → user answers
→ Claude asks: "What options were considered?" → user answers
→ Fully resolved prompt executes → Claude generates the ADR document
```

---

## 8. Information Architecture

### 8.1 Directory Structure

```text
project-root/
  .stencil/
    config.yaml                  # Plugin configuration (optional)
    templates/                   # Uncategorized templates
      quick-fix.md
    collections/
      backend/
        create-rest-endpoint.md
        add-migration.md
      review/
        security-review.md
      docs/
        write-adr.md

~/.stencil/        # Global templates (personal)
  templates/
    my-daily-standup.md
```

### 8.2 Config File (`config.yaml`)

```yaml
# .stencil/config.yaml
version: 1

# Default collection for new templates
default_collection: null

# Custom context variables (extend built-in $ctx.*)
custom_context:
  team_name: 'Platform'
  jira_project: 'PLAT'

# Placeholder delimiters (default: {{ }})
placeholder_start: '{{'
placeholder_end: '}}'
```

### 8.3 Template File Format

```yaml
# Frontmatter (YAML) — required
---
name: string # Unique identifier (kebab-case, required)
description: string # Human-readable description (required)
version: number # Template version (required, starts at 1)
author: string # Author name (optional)
tags: string[] # Categorization tags (optional)
placeholders: # Placeholder declarations (optional)
  - name: string # Placeholder name (required, snake_case)
    description: string # Shown to user during interactive fill (required)
    required: boolean # Whether the placeholder must be filled (default: true)
    default: string # Default value if not provided (optional)
    type: string # Future: validation type (string, number, enum, file_path)
    options: string[] # Future: allowed values for enum type
---
# Body (Markdown) — the actual prompt
Free-form text with {{placeholder_name}} and {{$ctx.variable}} references.
```

---

## 9. Plugin Technical Structure

The project is organized as a monorepo with a shared core and per-tool adapters:

```text
stencil/                                 # Monorepo root
  packages/
    core/                                # Portable core (TypeScript/Node)
      src/
        parser.ts                        # Template file parsing (frontmatter + body)
        resolver.ts                      # Placeholder resolution engine
        validator.ts                     # Schema and consistency validation
        storage.ts                       # Storage interface (local filesystem)
        collections.ts                   # Collection management
        context.ts                       # Built-in $ctx.* variable resolution
        types.ts                         # Shared type definitions
      package.json                       # Published as @stencil-pm/core
      tsconfig.json

    claude-code-plugin/                  # Claude Code adapter
      .claude-plugin/
        plugin.json                      # Plugin manifest
      skills/
        stencil/
          SKILL.md                       # Main entry point — routes subcommands
        stencil-create/
          SKILL.md                       # /stencil create handler
        stencil-list/
          SKILL.md                       # /stencil list handler
        stencil-run/
          SKILL.md                       # /stencil run handler
        stencil-show/
          SKILL.md                       # /stencil show handler
        stencil-edit/
          SKILL.md                       # /stencil edit handler
        stencil-delete/
          SKILL.md                       # /stencil delete handler
        stencil-search/
          SKILL.md                       # /stencil search handler
        stencil-init/
          SKILL.md                       # /stencil init handler
      scripts/
        resolve-template.sh              # Shell wrapper calling core
        validate-template.sh             # Shell wrapper calling core
        detect-context.sh               # Environment context detection

    vscode-extension/                    # VS Code adapter
      src/
        extension.ts                     # Extension entry point
        providers/
          templateTreeProvider.ts         # Sidebar Tree View
          templateEditorProvider.ts       # Custom template editor
          contextResolver.ts             # VS Code workspace context
        commands/
          runTemplate.ts
          createTemplate.ts
          listTemplates.ts
        ui/
          placeholderForm.ts             # Webview form for placeholder input
          templatePreview.ts             # Resolved template preview
        language/
          completionProvider.ts          # {{placeholder}} autocomplete
          diagnosticProvider.ts          # Inline warnings
      package.json                       # VS Code extension manifest

    codex-adapter/                       # Codex adapter (future)
      AGENTS.md                          # Template commands for Codex
      scripts/
        run-template.sh                  # CLI entry point for sandbox

  README.md
  LICENSE
  CHANGELOG.md
  CONTRIBUTING.md
```

---

## 10. Phased Delivery Roadmap

### Phase 1 — MVP (v0.1.0)

**Goal:** A working template runner with flat placeholders.

- Template file format with YAML frontmatter
- `/stencilinit` — scaffold `.stencil/` directory
- `/stencilcreate` — create template interactively
- `/stencillist` — list all templates
- `/stencilshow` — display a template
- `/stencilrun` — execute with inline args + interactive fill for missing values
- `/stencildelete` — remove a template
- `{{placeholder}}` resolution (user input + defaults)
- `{{$ctx.*}}` auto-resolution for core variables
- Frontmatter validation
- Project-level storage only

### Phase 2 — Organization & VS Code Extension (v0.2.0)

**Goal:** Make it practical for teams + deliver the first GUI experience.

- Collections (subdirectories with commands)
- Global templates (`~/.stencil/`)
- `/stencilsearch` with tag and text matching
- `/stenciledit` — modify existing templates
- `/stencilcopy` — duplicate templates
- Pre-execution confirmation summary
- Dry-run mode
- `config.yaml` with custom context variables
- **VS Code extension (MVP)**:
  - Command Palette commands (Run, Create, List)
  - Quick Pick template selector
  - Sequential Input Boxes for placeholder filling
  - Sidebar Tree View for template browsing
  - Basic `{{placeholder}}` syntax highlighting in template files

### Phase 3 — Advanced Placeholders & VS Code Polish (v0.3.0)

**Goal:** Richer template logic + full VS Code experience.

- Typed placeholders (`type: enum`, `type: number`, `type: file_path`)
- `options` field for enum placeholders (user picks from a list)
- Conditional sections (`{{#if placeholder}}...{{/if}}`)
- Template includes (`{{> other-template-name}}`)
- Placeholder validation rules
- Multi-step templates (chained execution)
- **VS Code extension enhancements**:
  - Webview form for multi-placeholder input
  - Live template preview panel
  - CodeLens ("Run" / "Preview" above frontmatter)
  - Inline diagnostics for undeclared/unused placeholders
  - Autocomplete for `{{placeholder}}` and `{{$ctx.*}}` in template files
  - Integration with Claude Code VS Code extension (send resolved prompt directly)

### Phase 4 — Remote & Collaboration (v0.4.0)

**Goal:** Share templates beyond a single git repo.

- Remote template registry (fetch templates from URL/git repo)
- `stencil install <source>` — install templates from remote
- `stencil publish` — share templates to a registry
- Template versioning with upgrade notifications
- Conflict resolution for template name collisions across sources
- **VS Code**: Browse and install remote templates from sidebar

### Phase 5 — Ecosystem (v1.0.0)

**Goal:** Mature, community-driven platform.

- Community template marketplace / curated index
- Template analytics (usage tracking, opt-in)
- Integration with CI/CD (generate artifacts from templates in pipelines)
- Plugin API for third-party extensions to the template system
- Template testing framework (assert expected output structure)
- **Codex adapter** (community-contributed or official)
- **Cursor / Windsurf adapters** (community-contributed)

---

## 11. Open Questions

| #   | Question                                                                                                                              | Impact                     | Status   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| 1   | Should `/stencilrun` directly execute the resolved prompt, or paste it into the conversation for the user to review and send?         | UX flow                    | Open     |
| 2   | What is the maximum practical template size before performance degrades in Claude Code?                                               | Template design guidelines | Open     |
| 3   | Should the plugin support importing templates from other formats (e.g., LangChain prompt templates, Fabric patterns)?                 | Phase 2+ scope             | Open     |
| 4   | How should the plugin handle templates that reference files in the codebase (e.g., "read {{file_path}} and review it")?               | Placeholder types          | Open     |
| 5   | Should there be a locking/ownership mechanism to prevent accidental edits to shared templates?                                        | Team workflow              | Open     |
| 6   | ~~What naming convention for the plugin?~~ **Resolved:** Product name "Prompt Manager", codename "Stencil", npm scope `@stencil-pm/*` | Branding                   | Resolved |

---

## 12. Success Metrics

| Metric                                | Target (6 months post-launch) |
| ------------------------------------- | ----------------------------- |
| GitHub stars                          | 500+                          |
| Claude Code plugin weekly installs    | 1,000+                        |
| VS Code extension weekly installs     | 2,000+                        |
| Templates created per active user     | 5+                            |
| Template executions per user per week | 10+                           |
| Community-contributed templates       | 50+                           |
| Issues resolved within 7 days         | 80%+                          |

---

## 13. Risks and Mitigations

| Risk                                                                          | Likelihood | Impact | Mitigation                                                                                                     |
| ----------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Claude Code plugin API changes break the plugin                               | Medium     | High   | Pin to stable API versions, maintain compatibility tests, engage with Anthropic plugin team early              |
| Low adoption due to friction in template creation                             | Medium     | High   | Ship with a curated set of 10-15 useful starter templates; make `/stencilcreate` as conversational as possible |
| Template syntax conflicts with Markdown or other tools                        | Low        | Medium | Use `{{` / `}}` which is uncommon in plain Markdown; make delimiters configurable                              |
| Performance issues with large template collections (100+)                     | Low        | Medium | Index templates in memory on first load; cache parsed frontmatter                                              |
| Security concerns with auto-resolved context variables leaking sensitive info | Low        | High   | Document exactly what `$ctx.*` exposes; never auto-resolve env vars or secrets                                 |

---

## 14. Cross-Tool Portability

### Design Principle

The plugin architecture must separate the **portable core** from **tool-specific adapters**. The template format and storage layer are the product — the Claude Code integration is one adapter among potentially many.

### Architecture Layers

```text
┌──────────────────────────────────────────────────────────────┐
│                   Tool-Specific Adapters                      │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────────┐ │
│  │Claude Code │ │  Codex    │ │  VS Code  │ │ Cursor /    │ │
│  │  Plugin    │ │  Adapter  │ │ Extension │ │ Other IDE   │ │
│  │ (Skills,  │ │ (CLI,     │ │ (Webview, │ │ (Extension  │ │
│  │  Hooks)   │ │  Sandbox) │ │  TreeView)│ │  API)       │ │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬──────┘ │
├────────┼──────────────┼──────────────┼──────────────┼────────┤
│        └──────────────┴──────────────┴──────────────┘        │
│                      Portable Core                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Template Parser (frontmatter + body)                   │  │
│  │ Placeholder Resolver (resolution order, defaults, ctx) │  │
│  │ Validator (schema, unused warnings)                    │  │
│  │ Storage Interface (read/write/list)                    │  │
│  │ Collection Manager                                     │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│                      Storage Backend                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │  Local    │ │   Git    │ │  Remote  │                     │
│  │  Files    │ │  Repo    │ │  Registry│                     │
│  └──────────┘ └──────────┘ └──────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

### What Each Adapter Must Implement

| Concern                | Claude Code                        | Codex                                         | VS Code Extension                                   | Cursor / Other         |
| ---------------------- | ---------------------------------- | --------------------------------------------- | --------------------------------------------------- | ---------------------- |
| **Command routing**    | Skills (`/stencilrun`)             | CLI wrapper or AGENTS.md instructions         | Command Palette + keybindings                       | Extension commands     |
| **Interactive fill**   | Conversational (Claude asks user)  | Pre-execution args only (no interactive loop) | Input boxes, Quick Picks, Webview forms             | IDE input dialogs      |
| **Context resolution** | Shell scripts in plugin            | Sandbox env inspection                        | `vscode.workspace` API                              | IDE workspace APIs     |
| **Permission model**   | Claude Code tool approvals         | Codex sandbox (permissive by default)         | VS Code extension sandbox                           | IDE permission prompts |
| **Template discovery** | Skill-based `/stencillist`         | File listing in AGENTS.md context             | Tree View sidebar panel                             | Extension UI panel     |
| **Template editing**   | Claude-assisted via `/stenciledit` | Not applicable (read-only)                    | Dedicated editor with syntax highlighting + preview | Extension editor       |
| **Output target**      | Claude conversation                | PR/patch                                      | Active editor, new file, or terminal                | Varies                 |

### VS Code Extension — Detailed Design

The VS Code adapter is a natural fit because VS Code's extension API provides **native UI primitives** for every interaction the plugin needs. This makes VS Code the richest UX surface for the plugin.

#### Extension Components

```
stencil-vscode/
  src/
    extension.ts              # Extension entry point, command registration
    core/
      index.ts                # Re-exports from stencil-core (portable core)
    providers/
      templateTreeProvider.ts # Tree View data provider for sidebar
      templateEditorProvider.ts # Custom editor for .md template files
      contextResolver.ts      # VS Code workspace-aware $ctx.* resolver
    commands/
      runTemplate.ts          # Execute a template (Command Palette + keybinding)
      createTemplate.ts       # Scaffold a new template
      listTemplates.ts        # Quick Pick template selector
      manageCollections.ts    # Collection CRUD
    ui/
      placeholderForm.ts      # Webview-based form for placeholder input
      templatePreview.ts      # Live preview of resolved template
    language/
      completionProvider.ts   # Autocomplete for {{placeholder}} in template files
      diagnosticProvider.ts   # Squiggly lines for undeclared/unused placeholders
  package.json                # Extension manifest, contributes commands/views/menus
```

#### UI Surfaces

| Surface                | Purpose                                                                             | VS Code API                    |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| **Sidebar Tree View**  | Browse templates by collection, search, favorites                                   | `TreeDataProvider`, `TreeView` |
| **Command Palette**    | Quick access to all commands (`Stencil: Run`, `Stencil: Create`, etc.)              | `commands.registerCommand`     |
| **Quick Pick**         | Select template from a filterable list; select enum placeholder values              | `window.showQuickPick`         |
| **Input Box**          | Fill individual text placeholders one by one                                        | `window.showInputBox`          |
| **Webview Form**       | Fill all placeholders at once in a form layout (for templates with 3+ placeholders) | `WebviewPanel`                 |
| **Status Bar**         | Show active template count, last-used template                                      | `StatusBarItem`                |
| **Editor Decorations** | Highlight `{{placeholders}}` in template files with distinct colors                 | `TextEditorDecorationType`     |
| **Diagnostics**        | Warn on undeclared or unused placeholders inline                                    | `DiagnosticCollection`         |
| **Code Lens**          | "Run this template" / "Preview resolved" links above template frontmatter           | `CodeLensProvider`             |

#### Interaction Flow: Running a Template in VS Code

```
1. User triggers Command Palette → "Stencil: Run Template"
   (or clicks ▶ icon on a template in the sidebar Tree View,
    or clicks the CodeLens "Run" link in an open template file)

2. Quick Pick appears with all templates, grouped by collection
   → User selects "backend / create-rest-endpoint"

3. Plugin reads frontmatter, identifies 3 placeholders:
   - entity_name (required, no default)
   - operations (required, default: "create, read, update, delete")
   - auth_required (optional, default: "true")

4. Decision: 1-2 placeholders → sequential Input Boxes
             3+ placeholders → Webview form

   In this case → Webview form opens as a side panel:
   ┌─────────────────────────────────────┐
   │  Run: create-rest-endpoint          │
   │                                     │
   │  Entity Name *    [Invoice      ]   │
   │  Operations *     [create, read,]   │  ← pre-filled with default
   │  Auth Required    [true         ]   │  ← pre-filled with default
   │                                     │
   │  ── Auto-resolved ──────────────    │
   │  $ctx.project_name: ezcsms-backend  │
   │  $ctx.current_branch: feature/auth  │
   │                                     │
   │  [Preview]  [Run]  [Cancel]         │
   └─────────────────────────────────────┘

5. User clicks [Preview] → resolved prompt shown in a new editor tab
   User clicks [Run] → resolved prompt is:
   a) Sent to the active Claude Code session (if Claude Code extension is active)
   b) Copied to clipboard with notification
   c) Inserted into the active terminal
   d) Written to a new editor tab
   (Output target configurable in settings)
```

#### Integration with Claude Code VS Code Extension

When both extensions are installed, the VS Code adapter can send resolved prompts directly to Claude Code via its extension API:

- Detect if Claude Code extension is active (`vscode.extensions.getExtension('anthropic.claude-code')`)
- If available, send resolved prompt to Claude's conversation panel
- If not available, fall back to clipboard/editor output

#### VS Code-Specific Context Variables

Additional `$ctx.*` variables available only in the VS Code adapter:

| Variable                      | Resolves to                                                 |
| ----------------------------- | ----------------------------------------------------------- |
| `{{$ctx.active_file}}`        | Path of the currently open file                             |
| `{{$ctx.active_selection}}`   | Currently selected text in the editor                       |
| `{{$ctx.workspace_folders}}`  | List of workspace folder paths                              |
| `{{$ctx.active_language_id}}` | Language ID of the active file (e.g., `java`, `typescript`) |
| `{{$ctx.diagnostics_count}}`  | Number of errors/warnings in the active file                |

### Codex-Specific Considerations

- **No interactive conversation loop** — Codex runs tasks to completion in a sandbox. The adapter must resolve all placeholders upfront (via args, defaults, or fail with a clear message). The "Claude asks one by one" flow is not available.
- **AGENTS.md integration** — Codex reads `AGENTS.md` for project instructions. The adapter could register template commands there.
- **Sandboxed environment** — Context variables (`$ctx.*`) must work within Codex's cloud sandbox, not the user's local machine. Some variables (e.g., `$ctx.git_user`) may resolve differently.
- **Output model** — Codex produces a PR/patch as output. Templates that instruct "generate code" map well; templates that instruct "explain" or "review" are less natural.

### Implementation Impact on Roadmap

- **Phase 1 (MVP):** Build the portable core as a standalone library/set of scripts. The Claude Code plugin wraps this core.
- **Phase 2+:** Extract the core into its own package (e.g., `stencil-core`) that adapters depend on.
- **Phase 4 (Remote):** The remote registry is inherently tool-agnostic — any adapter can fetch from it.
- **Future:** Community adapters for Codex, Cursor, Windsurf, Aider, etc.

---

## Appendix A: Competitive Landscape

| Tool                                                  | What it does                            | Gap this plugin fills                                                        |
| ----------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| **Claude Code custom commands** (`.claude/commands/`) | Simple prompt files with `$ARGUMENTS`   | No placeholder metadata, no validation, no organization, no interactive fill |
| **Fabric** (Daniel Miessler)                          | CLI prompt patterns with markdown files | Not integrated into Claude Code; no placeholder system; separate tool        |
| **LangChain PromptTemplate**                          | Programmatic prompt templates in Python | Developer-only; requires code; not a CLI tool                                |
| **PromptLayer / Promptfoo**                           | Prompt management platforms             | SaaS/hosted; heavyweight; not designed for CLI-first AI coding               |

This plugin differentiates by being **native to Claude Code**, **file-based and git-friendly**, and **accessible to non-developers**.

---

## Appendix B: Glossary

| Term                 | Definition                                                                       |
| -------------------- | -------------------------------------------------------------------------------- |
| **Template**         | A reusable prompt stored as a Markdown file with metadata                        |
| **Placeholder**      | A named variable in a template, delimited by `{{ }}`, resolved at execution time |
| **Context variable** | A placeholder prefixed with `$ctx.` that auto-resolves from the environment      |
| **Collection**       | A named group of templates, mapped to a subdirectory                             |
| **Resolution**       | The process of replacing placeholders with actual values                         |
| **Frontmatter**      | YAML metadata block at the top of a template file                                |
