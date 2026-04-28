# Stencil — Architecture Document

**Version:** 0.1.0 (Draft)
**Date:** 2026-04-08
**Author:** Piotr Lepkowski
**Status:** Draft
**Parent document:** [stencil-prd.md](./stencil-prd.md)

---

## 1. Architecture Overview

Stencil follows a **layered monorepo architecture** with a portable core and tool-specific adapters. The core is a standalone TypeScript library that handles all template logic. Each adapter wraps the core and exposes it through the native UX of its target tool.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Adapter Layer                                 │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Claude Code   │  │  VS Code     │  │  Codex       │  │ Future  │ │
│  │  Plugin       │  │  Extension   │  │  Adapter     │  │ Adapters│ │
│  │              │  │              │  │              │  │         │ │
│  │ Skills/SKILL │  │ Commands,    │  │ AGENTS.md,   │  │         │ │
│  │ .md files +  │  │ TreeView,    │  │ CLI scripts  │  │         │ │
│  │ shell scripts│  │ Webview,     │  │              │  │         │ │
│  │              │  │ CodeLens     │  │              │  │         │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬────┘ │
│         │                 │                 │                │      │
├─────────┴─────────────────┴─────────────────┴────────────────┴──────┤
│                        Core Layer (@stencil-pm/core)                 │
│                                                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │   Parser     │ │  Resolver   │ │  Validator   │ │  Collection  │  │
│  │             │ │             │ │             │ │   Manager    │  │
│  │ Frontmatter │ │ Placeholder │ │ Schema      │ │             │  │
│  │ extraction, │ │ resolution  │ │ validation, │ │ CRUD,       │  │
│  │ body parse  │ │ pipeline    │ │ consistency │ │ listing,    │  │
│  │             │ │             │ │ checks      │ │ search      │  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬───────┘  │
│         │               │               │               │          │
│  ┌──────┴───────────────┴───────────────┴───────────────┴───────┐  │
│  │                    Context Engine                             │  │
│  │          Resolves $ctx.* variables from environment           │  │
│  │          Extensible via ContextProvider interface             │  │
│  └──────────────────────────┬────────────────────────────────────┘  │
│                              │                                      │
├──────────────────────────────┼──────────────────────────────────────┤
│                        Storage Layer                                 │
│                                                                      │
│  ┌──────────────────────────┴────────────────────────────────────┐  │
│  │                   StorageProvider (interface)                  │  │
│  └──────────┬──────────────────┬──────────────────┬──────────────┘  │
│             │                  │                  │                  │
│  ┌──────────┴───┐  ┌──────────┴───┐  ┌──────────┴───┐             │
│  │ LocalStorage  │  │ GitStorage   │  │ RemoteStorage│             │
│  │ (MVP)         │  │ (Phase 2)    │  │ (Phase 4)    │             │
│  │               │  │              │  │              │             │
│  │ Reads/writes  │  │ Git-aware    │  │ Registry     │             │
│  │ .stencil/     │  │ merge,       │  │ fetch,       │             │
│  │ directory     │  │ conflict     │  │ publish,     │             │
│  │               │  │ detection    │  │ versioning   │             │
│  └───────────────┘  └──────────────┘  └──────────────┘             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Design Principles

| Principle                         | Description                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core is portable**              | The core library has zero dependencies on any specific AI tool. It runs in Node.js, Bun, or any JS runtime. Adapters depend on the core — never the reverse.                     |
| **Files are the source of truth** | Templates are plain Markdown files with YAML frontmatter. No database, no binary format, no lock files. Human-readable and git-diffable.                                         |
| **Offline-first**                 | All operations work without network access. Remote features (Phase 4+) are additive, never required.                                                                             |
| **Progressive complexity**        | Simple templates require only `name`, `description`, and body text. Advanced features (typed placeholders, conditionals, composition) are opt-in via frontmatter fields.         |
| **Adapter autonomy**              | Each adapter owns its UX entirely. The core provides data and logic; the adapter decides how to present it. The core never imports UI libraries or tool-specific APIs.           |
| **No runtime state**              | The core is stateless — every operation reads from disk, processes, and returns a result. No daemon, no cache process, no singletons. Adapters may cache, but the core does not. |

---

## 3. Core Layer (`@stencil-pm/core`)

The core is a TypeScript library published as an npm package. It exposes a programmatic API consumed by all adapters.

### 3.1 Module Dependency Graph

```
types.ts ◄──────────────────────────────────────────────┐
   ▲                                                     │
   │                                                     │
parser.ts ──────► validator.ts                           │
   ▲                  ▲                                  │
   │                  │                                  │
   │              resolver.ts ◄──── context.ts           │
   │                  ▲                  ▲               │
   │                  │                  │               │
storage.ts ──────► collections.ts       │               │
   ▲                                     │               │
   │                                     │               │
index.ts (public API) ──────────────────┴───────────────┘
```

No circular dependencies. Data flows upward from `types.ts`. The public API re-exports only what adapters need.

### 3.2 Type Definitions (`types.ts`)

```typescript
// ── Template ──────────────────────────────────────────

export interface TemplateFrontmatter {
  name: string; // kebab-case unique identifier
  description: string; // human-readable summary
  version: number; // template version, starts at 1
  author?: string;
  tags?: string[];
  placeholders?: PlaceholderDefinition[];
}

export interface PlaceholderDefinition {
  name: string; // snake_case identifier
  description: string; // shown during interactive fill
  required: boolean; // default: true
  default?: string; // default value if not provided
  type?: PlaceholderType; // Phase 3: validation type
  options?: string[]; // Phase 3: allowed values for enum
}

export type PlaceholderType = 'string' | 'number' | 'boolean' | 'enum' | 'file_path';

export interface Template {
  frontmatter: TemplateFrontmatter;
  body: string; // raw body with {{placeholder}} tokens
  filePath: string; // absolute path to the .md file
  collection?: string; // collection name (from directory)
  source: TemplateSource; // where this template came from
}

export type TemplateSource = 'project' | 'global' | 'remote';

// ── Resolution ────────────────────────────────────────

export interface ResolutionInput {
  /** Values explicitly passed by the user (e.g., CLI args) */
  explicit: Record<string, string>;
  /** Context variables auto-resolved from environment */
  context: Record<string, string>;
}

export interface ResolvedPlaceholder {
  name: string;
  value: string;
  source: 'explicit' | 'context' | 'default' | 'unresolved';
}

export interface ResolutionResult {
  resolvedBody: string; // body with all placeholders filled
  placeholders: ResolvedPlaceholder[]; // resolution details per placeholder
  unresolvedCount: number; // how many remain unresolved
}

// ── Validation ────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  field?: string; // frontmatter field path
  line?: number; // line number in template file
}

export interface ValidationResult {
  valid: boolean; // true if no errors (warnings OK)
  issues: ValidationIssue[];
}

// ── Storage ───────────────────────────────────────────

export interface StorageProvider {
  listTemplates(options?: ListOptions): Promise<Template[]>;
  getTemplate(name: string): Promise<Template | null>;
  saveTemplate(template: Template): Promise<void>;
  deleteTemplate(name: string): Promise<boolean>;
  templateExists(name: string): Promise<boolean>;
}

export interface ListOptions {
  collection?: string;
  tags?: string[];
  searchQuery?: string;
  source?: TemplateSource;
}

// ── Context ───────────────────────────────────────────

export interface ContextProvider {
  /**
   * Returns all context variables this provider can resolve.
   * Keys are without the $ctx. prefix (e.g., "project_name", not "$ctx.project_name").
   */
  resolve(): Promise<Record<string, string>>;

  /** Human-readable name for this provider (e.g., "Git", "VS Code") */
  name: string;
}

// ── Configuration ─────────────────────────────────────

export interface StencilConfig {
  version: number;
  defaultCollection?: string;
  customContext?: Record<string, string>;
  placeholderStart: string; // default: "{{"
  placeholderEnd: string; // default: "}}"
}
```

### 3.3 Parser (`parser.ts`)

Responsible for reading a `.md` file and producing a `Template` object.

**Algorithm:**

```
Input: file path (string)
Output: Template | ParseError

1. Read file contents as UTF-8 string
2. Detect frontmatter boundaries:
   - First line must be "---"
   - Scan for closing "---"
   - If not found → ParseError("Missing frontmatter")
3. Extract YAML string between boundaries
4. Parse YAML into object using yaml library
5. Map parsed object to TemplateFrontmatter
   - Apply defaults: placeholder.required = true if not specified
6. Extract body = everything after closing "---", trimmed
7. Detect collection from file path:
   - If path contains /collections/<name>/ → collection = <name>
   - Otherwise → collection = undefined
8. Return Template { frontmatter, body, filePath, collection, source }
```

**Dependencies:** `yaml` (YAML parser — the only external dependency of the core)

**Error cases:**

- File does not exist → `TemplateNotFoundError`
- Missing or malformed frontmatter → `ParseError`
- YAML syntax error → `ParseError` with line number from YAML parser
- Missing required frontmatter fields → delegated to Validator

### 3.4 Validator (`validator.ts`)

Validates a `Template` for correctness and consistency.

**Validation rules (ordered by severity):**

| ID  | Check                                  | Severity | Description                                                                    |
| --- | -------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| V1  | `name` present                         | Error    | Frontmatter must have `name`                                                   |
| V2  | `name` format                          | Error    | Must be kebab-case: `/^[a-z0-9]+(-[a-z0-9]+)*$/`                               |
| V3  | `description` present                  | Error    | Frontmatter must have `description`                                            |
| V4  | `version` present                      | Error    | Must be a positive integer                                                     |
| V5  | `placeholders[].name` format           | Error    | Must be snake*case: `/^[a-z0-9]+(*[a-z0-9]+)\*$/`                              |
| V6  | `placeholders[].description` present   | Error    | Each placeholder must have a description                                       |
| V7  | Duplicate placeholder names            | Error    | No two placeholders with the same name                                         |
| V8  | Body references undeclared placeholder | Warning  | `{{foo}}` in body but `foo` not in frontmatter placeholders (ignores `$ctx.*`) |
| V9  | Declared placeholder not used in body  | Warning  | Placeholder declared in frontmatter but no `{{name}}` in body                  |
| V10 | `default` on required placeholder      | Warning  | A required placeholder with a default is effectively optional                  |

**API:**

```typescript
function validate(template: Template): ValidationResult;
function validateFrontmatter(frontmatter: unknown): ValidationResult; // for pre-parse validation
```

### 3.5 Resolver (`resolver.ts`)

Replaces `{{placeholder}}` tokens in the template body with actual values.

**Resolution Pipeline:**

```
Input: Template + ResolutionInput
Output: ResolutionResult

For each placeholder declared in frontmatter:
  1. Check explicit values (user-provided args)        → source: 'explicit'
  2. Check context values ($ctx.* auto-resolved)        → source: 'context'
  3. Check default value from frontmatter               → source: 'default'
  4. Mark as unresolved                                 → source: 'unresolved'

For each {{token}} found in body via regex:
  - If token starts with "$ctx." → look up in context values
  - Otherwise → look up in resolved placeholders map
  - If found → replace with value
  - If not found → leave token as-is (adapter handles unresolved)

Return {
  resolvedBody,                      // string with replacements applied
  placeholders,                      // per-placeholder resolution details
  unresolvedCount                    // count of 'unresolved' placeholders
}
```

**Placeholder detection regex:**

```typescript
// Configurable delimiters, default {{ }}
const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;
```

**Important behaviors:**

- The resolver **never prompts the user**. It returns unresolved placeholders; the adapter decides how to handle them (interactive prompt, error, etc.).
- The resolver is **idempotent** — calling it again with the same inputs produces the same output.
- Context variables (`$ctx.*`) are resolved by the Context Engine before being passed to the resolver. The resolver itself does not execute context resolution — it receives pre-resolved values.
- Unknown `{{tokens}}` that are not declared in frontmatter and not `$ctx.*` are left as-is with a warning in the result.

### 3.6 Context Engine (`context.ts`)

Resolves `$ctx.*` variables from the runtime environment.

**Architecture:**

The Context Engine maintains a registry of `ContextProvider` implementations. Each provider resolves a subset of variables. Providers are registered by adapters at initialization.

```typescript
class ContextEngine {
  private providers: ContextProvider[] = [];

  /** Register a context provider (adapters call this at init) */
  register(provider: ContextProvider): void;

  /** Resolve all context variables from all providers.
   *  Later providers override earlier ones on key collision. */
  async resolveAll(): Promise<Record<string, string>>;

  /** Resolve a single variable by name (without $ctx. prefix) */
  async resolve(name: string): Promise<string | undefined>;
}
```

**Built-in providers (shipped with core):**

| Provider                 | Variables                    | Implementation                                                                                      |
| ------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `SystemContextProvider`  | `date`, `os`, `cwd`          | `Date.now()`, `process.platform`, `process.cwd()`                                                   |
| `GitContextProvider`     | `current_branch`, `git_user` | Executes `git rev-parse --abbrev-ref HEAD`, `git config user.name`                                  |
| `ProjectContextProvider` | `project_name`, `language`   | Reads directory name; detects language from `package.json`, `pom.xml`, `Cargo.toml`, `go.mod`, etc. |

**Adapter-provided providers (registered at runtime):**

| Provider                | Source            | Variables                                                                                         |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `VSCodeContextProvider` | VS Code extension | `active_file`, `active_selection`, `workspace_folders`, `active_language_id`, `diagnostics_count` |
| `CustomContextProvider` | `config.yaml`     | Any key-value pairs from `custom_context` section                                                 |

**Execution model:**

- Providers execute in parallel (`Promise.all`) for performance.
- If a provider fails (e.g., `git` not installed), it returns an empty object — it does not block other providers.
- Results are merged left-to-right by registration order. Custom/adapter providers override built-in ones on conflict.

### 3.7 Storage (`storage.ts`)

Implements the `StorageProvider` interface for local filesystem access.

**`LocalStorageProvider`:**

```typescript
class LocalStorageProvider implements StorageProvider {
  constructor(
    private projectDir: string,     // .stencil/ within project root
    private globalDir?: string      // ~/.stencil/ (optional)
  );

  async listTemplates(options?: ListOptions): Promise<Template[]>;
  async getTemplate(name: string): Promise<Template | null>;
  async saveTemplate(template: Template): Promise<void>;
  async deleteTemplate(name: string): Promise<boolean>;
  async templateExists(name: string): Promise<boolean>;
}
```

**File discovery algorithm:**

```
listTemplates():
  1. Scan projectDir recursively for *.md files
     - .stencil/templates/*.md         → uncategorized
     - .stencil/collections/<name>/*.md → collection = <name>
  2. If globalDir exists, scan the same structure
  3. Parse each file via Parser
  4. Apply ListOptions filters (collection, tags, searchQuery)
  5. On name collision between project and global → project wins
  6. Sort by: collection (alphabetical) → name (alphabetical)
  7. Return Template[]
```

**Name resolution (getTemplate):**

```
getTemplate("create-rest-endpoint"):
  1. Search projectDir first (templates/ then collections/*/)
  2. If not found and globalDir exists → search globalDir
  3. Parse and return, or return null
```

**Save path resolution:**

```
saveTemplate(template):
  1. If template.collection is set:
     → write to .stencil/collections/<collection>/<name>.md
  2. Else:
     → write to .stencil/templates/<name>.md
  3. Serialize: YAML frontmatter + "---\n\n" + body
  4. Create directories if needed (mkdir -p)
```

### 3.8 Collection Manager (`collections.ts`)

Thin layer over `StorageProvider` for collection-specific operations.

```typescript
class CollectionManager {
  constructor(private storage: StorageProvider);

  /** List all collection names (derived from subdirectories) */
  async listCollections(): Promise<string[]>;

  /** Create a new collection (creates the directory) */
  async createCollection(name: string): Promise<void>;

  /** Move a template into a collection */
  async moveToCollection(templateName: string, collectionName: string): Promise<void>;

  /** Remove a collection (moves templates to uncategorized) */
  async removeCollection(name: string): Promise<void>;

  /** List templates in a specific collection */
  async listTemplatesInCollection(name: string): Promise<Template[]>;
}
```

### 3.9 Public API (`index.ts`)

The core exposes a single high-level facade plus granular access to internal modules.

```typescript
// ── High-level facade ─────────────────────────────────

export class Stencil {
  readonly parser: Parser;
  readonly validator: Validator;
  readonly resolver: Resolver;
  readonly context: ContextEngine;
  readonly storage: LocalStorageProvider;
  readonly collections: CollectionManager;

  constructor(options: StencilOptions);

  /** Initialize: create .stencil/ directory if needed */
  async init(): Promise<void>;

  /** Full pipeline: parse → validate → resolve context → resolve placeholders */
  async resolve(
    templateName: string,
    explicitValues: Record<string, string>,
  ): Promise<ResolutionResult>;

  /** Create a new template from parts */
  async create(
    frontmatter: TemplateFrontmatter,
    body: string,
    collection?: string,
  ): Promise<Template>;

  /** List all templates, optionally filtered */
  async list(options?: ListOptions): Promise<Template[]>;

  /** Get a single template by name */
  async get(name: string): Promise<Template | null>;

  /** Delete a template by name */
  async delete(name: string): Promise<boolean>;

  /** Validate a template */
  async validate(templateName: string): Promise<ValidationResult>;

  /** Search templates by query string (matches name, description, tags) */
  async search(query: string): Promise<Template[]>;
}

export interface StencilOptions {
  projectDir: string; // path to project root (contains .stencil/)
  globalDir?: string | null; // omitted => ~/.stencil/, string => explicit dir, null => disable global lookup
  config?: Partial<StencilConfig>;
  contextProviders?: ContextProvider[]; // additional providers from adapter
}

// ── Re-exports for adapter use ────────────────────────

export { Parser } from './parser';
export { Resolver } from './resolver';
export { Validator } from './validator';
export { ContextEngine } from './context';
export { LocalStorageProvider } from './storage';
export { CollectionManager } from './collections';
export * from './types';
```

---

## 4. Adapter Layer

Each adapter is a separate package that depends on `@stencil-pm/core`. Adapters are responsible for:

1. **Command routing** — mapping user actions to core API calls
2. **Interactive fill** — gathering unresolved placeholder values from the user
3. **Output delivery** — presenting the resolved prompt to the user/tool
4. **Adapter-specific context** — registering additional `ContextProvider` implementations

### 4.1 Claude Code Plugin Adapter

**Package:** `packages/claude-code-plugin/`

The Claude Code adapter uses **Skills** (SKILL.md files) as the command routing layer. Each skill is a markdown prompt that instructs Claude how to interact with the core via shell scripts.

#### Architecture

```
┌────────────────────────────────────────────────────┐
│                Claude Code Runtime                  │
│                                                    │
│  User types: /stencil run create-rest-endpoint     │
│       │                                            │
│       ▼                                            │
│  ┌──────────────────────┐                          │
│  │  SKILL.md (stencil)  │  Routes to sub-skill     │
│  │  Main router skill   │  based on subcommand     │
│  └──────────┬───────────┘                          │
│             ▼                                      │
│  ┌──────────────────────┐                          │
│  │ SKILL.md (stencil-   │  Contains instructions   │
│  │ run)                 │  for Claude to:           │
│  │                      │  1. Call resolve script   │
│  │                      │  2. Handle unresolved     │
│  │                      │  3. Present result        │
│  └──────────┬───────────┘                          │
│             │                                      │
│             │  !`./scripts/resolve-template.sh`     │
│             ▼                                      │
│  ┌──────────────────────┐                          │
│  │  Shell Scripts       │  Thin wrappers that       │
│  │                      │  invoke @stencil-pm/core  │
│  │  resolve-template.sh │  via Node.js CLI          │
│  │  validate-template.sh│                          │
│  │  list-templates.sh   │                          │
│  │  detect-context.sh   │                          │
│  └──────────┬───────────┘                          │
│             ▼                                      │
│  ┌──────────────────────┐                          │
│  │  @stencil-pm/core    │  Portable core            │
│  │  (Node.js)           │                          │
│  └──────────────────────┘                          │
└────────────────────────────────────────────────────┘
```

#### Skill Routing

The main skill (`skills/stencil/SKILL.md`) acts as a router:

```markdown
---
name: stencil
description: Prompt template manager — create, organize, and run reusable prompt templates
argument-hint: <command> [args...]
---

Parse the first argument as a subcommand and delegate:

- "init" → /stencil-init
- "create" → /stencil-create $ARGUMENTS[1:]
- "list" → /stencil-list $ARGUMENTS[1:]
- "show" → /stencil-show $ARGUMENTS[1:]
- "run" → /stencil-run $ARGUMENTS[1:]
- "edit" → /stencil-edit $ARGUMENTS[1:]
- "delete" → /stencil-delete $ARGUMENTS[1:]
- "search" → /stencil-search $ARGUMENTS[1:]

If no subcommand or "help" → show available commands with descriptions.
```

#### Shell Script Interface

Each shell script is a thin wrapper that calls a Node.js CLI entry point:

```bash
#!/bin/bash
# scripts/resolve-template.sh
# Usage: resolve-template.sh <template-name> [key=value ...]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/../node_modules/@stencil-pm/core/dist/cli.js" resolve "$@"
```

The CLI entry point (`cli.js` in core) outputs JSON to stdout, which Claude Code parses and acts upon.

**CLI output format (JSON):**

```json
{
  "status": "ok",
  "resolvedBody": "Create a REST endpoint for the **Invoice** entity...",
  "placeholders": [
    { "name": "entity_name", "value": "Invoice", "source": "explicit" },
    { "name": "operations", "value": "create, read, update, delete", "source": "default" }
  ],
  "unresolved": [
    { "name": "auth_required", "description": "Whether endpoints require authentication" }
  ]
}
```

Claude Code reads this JSON and, if there are unresolved placeholders, asks the user conversationally.

#### Interactive Fill Flow (Claude Code)

```
1. User: /stencil run create-rest-endpoint entity_name=Invoice
2. Skill invokes: resolve-template.sh create-rest-endpoint entity_name=Invoice
3. Core returns JSON with:
   - entity_name: "Invoice" (explicit)
   - operations: "create, read, update, delete" (default)
   - auth_required: unresolved
4. Skill instructs Claude: "Ask the user for auth_required"
5. Claude: "Should these endpoints require authentication? (default: true)"
6. User: "yes"
7. Skill re-invokes: resolve-template.sh create-rest-endpoint entity_name=Invoice auth_required=true
8. Core returns fully resolved prompt
9. Claude presents the resolved prompt and asks for confirmation
10. User confirms → Claude executes the prompt in conversation
```

#### Plugin Manifest

```json
{
  "name": "stencil",
  "description": "Prompt template manager for Claude Code",
  "version": "0.1.0",
  "author": { "name": "Stencil Contributors" },
  "homepage": "https://github.com/stencil-pm/stencil",
  "repository": "https://github.com/stencil-pm/stencil",
  "license": "MIT"
}
```

### 4.2 VS Code Extension Adapter

**Package:** `packages/vscode-extension/`

The VS Code adapter imports `@stencil-pm/core` directly as a TypeScript dependency (no shell scripts, no CLI — direct API calls).

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      VS Code Runtime                                │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Extension Entry Point (extension.ts)                         │  │
│  │  - Activates on workspace containing .stencil/ directory      │  │
│  │  - Registers commands, providers, views                       │  │
│  │  - Instantiates Stencil core with VSCodeContextProvider       │  │
│  └──────────────────────────┬────────────────────────────────────┘  │
│                              │                                      │
│          ┌───────────────────┼───────────────────┐                  │
│          │                   │                   │                  │
│          ▼                   ▼                   ▼                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐        │
│  │  Commands     │  │  Providers   │  │  Language Support │        │
│  │              │  │              │  │                   │        │
│  │ runTemplate  │  │ TreeView     │  │ CompletionProvider│        │
│  │ createTemp.  │  │ (sidebar     │  │ ({{}} autocomplete│        │
│  │ listTemp.    │  │  browser)    │  │                   │        │
│  │ deleteTemp.  │  │              │  │ DiagnosticProvider│        │
│  │ searchTemp.  │  │ CodeLens     │  │ (unused/undeclared│        │
│  │              │  │ (inline run/ │  │  warnings)        │        │
│  │              │  │  preview)    │  │                   │        │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬─────────┘        │
│         │                 │                     │                  │
│         └─────────────────┼─────────────────────┘                  │
│                           │                                        │
│                           ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  UI Layer                                                    │  │
│  │                                                              │  │
│  │  PlaceholderForm (Webview)     TemplatePreview (Webview)     │  │
│  │  ┌─────────────────────────┐   ┌────────────────────────┐    │  │
│  │  │ Dynamic form generated  │   │ Shows resolved prompt  │    │  │
│  │  │ from placeholder defs   │   │ with syntax highlighting│   │  │
│  │  │ with validation         │   │ before execution       │    │  │
│  │  └─────────────────────────┘   └────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           │                                        │
│                           ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  @stencil-pm/core (direct import, in-process)                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Extension Activation

```typescript
// extension.ts
export async function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  // Initialize core with VS Code context provider
  const stencil = new Stencil({
    projectDir: workspaceRoot,
    contextProviders: [new VSCodeContextProvider()],
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('stencil.run', () => runTemplate(stencil)),
    vscode.commands.registerCommand('stencil.create', () => createTemplate(stencil)),
    vscode.commands.registerCommand('stencil.list', () => listTemplates(stencil)),
    vscode.commands.registerCommand('stencil.delete', () => deleteTemplate(stencil)),
    vscode.commands.registerCommand('stencil.init', () => initStencil(stencil)),
  );

  // Register providers
  const treeProvider = new TemplateTreeProvider(stencil);
  vscode.window.registerTreeDataProvider('stencilTemplates', treeProvider);

  const codeLensProvider = new TemplateCodeLensProvider(stencil);
  vscode.languages.registerCodeLensProvider({ pattern: '**/.stencil/**/*.md' }, codeLensProvider);

  // Register language features for template files
  const completionProvider = new PlaceholderCompletionProvider(stencil);
  vscode.languages.registerCompletionItemProvider(
    { pattern: '**/.stencil/**/*.md' },
    completionProvider,
    '{', // trigger character
  );

  const diagnosticCollection = vscode.languages.createDiagnosticCollection('stencil');
  const diagnosticProvider = new TemplateDiagnosticProvider(stencil, diagnosticCollection);
  context.subscriptions.push(diagnosticCollection);
}
```

#### Interactive Fill Strategy

The VS Code adapter uses different UI patterns based on placeholder count:

```
Placeholders = 0  → Execute immediately (no form)
Placeholders = 1-2 → Sequential vscode.window.showInputBox()
Placeholders ≥ 3  → Webview form panel

All paths → Preview step (optional) → Output delivery
```

**Webview form** renders an HTML form dynamically generated from placeholder definitions:

```typescript
// ui/placeholderForm.ts
function generateFormHtml(template: Template, contextValues: Record<string, string>): string {
  // Generates HTML with:
  // - Input field per placeholder (pre-filled with defaults)
  // - "Required" indicators
  // - Read-only section showing auto-resolved $ctx.* values
  // - Preview / Run / Cancel buttons
  // - postMessage() back to extension on submit
}
```

#### Output Delivery

After resolution, the VS Code adapter supports multiple output targets (user-configurable in settings):

```typescript
type OutputTarget = 'claude-code' | 'clipboard' | 'new-editor' | 'terminal';

async function deliverOutput(resolvedBody: string, target: OutputTarget): Promise<void> {
  switch (target) {
    case 'claude-code':
      // Detect Claude Code extension, send via its API
      const claudeExt = vscode.extensions.getExtension('anthropic.claude-code');
      if (claudeExt) {
        await claudeExt.exports.sendMessage(resolvedBody);
      } else {
        // Fallback to clipboard
        await vscode.env.clipboard.writeText(resolvedBody);
        vscode.window.showInformationMessage(
          'Prompt copied to clipboard (Claude Code not detected)',
        );
      }
      break;
    case 'clipboard':
      await vscode.env.clipboard.writeText(resolvedBody);
      break;
    case 'new-editor':
      const doc = await vscode.workspace.openTextDocument({
        content: resolvedBody,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc);
      break;
    case 'terminal':
      const terminal = vscode.window.activeTerminal || vscode.window.createTerminal('Stencil');
      terminal.sendText(resolvedBody);
      break;
  }
}
```

#### VS Code Extension Manifest (package.json contributes)

```json
{
  "contributes": {
    "commands": [
      { "command": "stencil.run", "title": "Stencil: Run Template" },
      { "command": "stencil.create", "title": "Stencil: Create Template" },
      { "command": "stencil.list", "title": "Stencil: List Templates" },
      { "command": "stencil.delete", "title": "Stencil: Delete Template" },
      { "command": "stencil.init", "title": "Stencil: Initialize" },
      { "command": "stencil.preview", "title": "Stencil: Preview Template" }
    ],
    "views": {
      "explorer": [
        {
          "id": "stencilTemplates",
          "name": "Stencil Templates",
          "when": "workspaceFolderCount > 0"
        }
      ]
    },
    "menus": {
      "view/item/context": [
        { "command": "stencil.run", "when": "viewItem == stencilTemplate" },
        { "command": "stencil.delete", "when": "viewItem == stencilTemplate" }
      ]
    },
    "configuration": {
      "title": "Stencil",
      "properties": {
        "stencil.outputTarget": {
          "type": "string",
          "default": "claude-code",
          "enum": ["claude-code", "clipboard", "new-editor", "terminal"],
          "description": "Where to send resolved prompts"
        },
        "stencil.globalTemplatesDir": {
          "type": "string",
          "default": "~/.stencil",
          "description": "Path to global templates directory"
        }
      }
    }
  }
}
```

### 4.3 Codex Adapter (Future — Phase 5)

**Package:** `packages/codex-adapter/`

Codex operates in a sandboxed cloud VM with no interactive loop. The adapter is a CLI wrapper that must resolve all placeholders before execution.

```
┌────────────────────────────────────────────────┐
│              Codex Sandbox                      │
│                                                │
│  AGENTS.md references stencil commands         │
│       │                                        │
│       ▼                                        │
│  ┌──────────────────────┐                      │
│  │  run-template.sh     │  CLI entry point     │
│  │                      │  All args required    │
│  │  stencil run <name>  │  upfront — no         │
│  │  key1=val1 key2=val2 │  interactive fill     │
│  └──────────┬───────────┘                      │
│             ▼                                  │
│  ┌──────────────────────┐                      │
│  │  @stencil-pm/core    │                      │
│  │  (bundled)           │                      │
│  └──────────┬───────────┘                      │
│             ▼                                  │
│  Resolved prompt → Codex executes as task      │
│  Output → PR/patch                             │
└────────────────────────────────────────────────┘
```

**Key constraint:** If any required placeholder is unresolved and has no default, the adapter exits with error code 1 and a message listing missing values. No interactive fallback is possible.

---

## 5. Data Flow Diagrams

### 5.1 Template Resolution (Full Pipeline)

```
                    ┌──────────────┐
                    │  User Input   │
                    │  (CLI args /  │
                    │   form values)│
                    └──────┬───────┘
                           │
                           ▼
┌──────────┐     ┌──────────────────┐     ┌──────────────┐
│ .stencil/│────►│     Parser        │────►│  Validator    │
│ file.md  │     │                  │     │              │
└──────────┘     │ 1. Read file     │     │ 1. Schema    │
                 │ 2. Extract YAML  │     │ 2. Consistency│
                 │ 3. Extract body  │     │ 3. Return     │
                 │ 4. Return        │     │    issues[]   │
                 │    Template      │     └──────┬───────┘
                 └──────────────────┘            │
                                                 │ if valid
                                                 ▼
                 ┌──────────────────┐     ┌──────────────────┐
                 │  Context Engine   │────►│    Resolver       │
                 │                  │     │                  │
                 │ 1. Run all       │     │ 1. Merge inputs  │
                 │    providers     │     │    (explicit +   │
                 │    in parallel   │     │     context +    │
                 │ 2. Merge results │     │     defaults)    │
                 │ 3. Return        │     │ 2. Replace {{}}  │
                 │    ctx values    │     │ 3. Return result │
                 └──────────────────┘     └──────┬───────────┘
                                                  │
                                                  ▼
                                          ┌──────────────────┐
                                          │ ResolutionResult  │
                                          │                  │
                                          │ resolvedBody     │
                                          │ placeholders[]   │
                                          │ unresolvedCount  │
                                          └──────────────────┘
                                                  │
                                    ┌─────────────┼─────────────┐
                                    │             │             │
                              unresolved=0   unresolved>0      │
                                    │             │             │
                                    ▼             ▼             │
                              ┌──────────┐ ┌───────────────┐   │
                              │ Deliver  │ │ Adapter asks  │   │
                              │ output   │ │ user for      │   │
                              │ to user  │ │ missing values│   │
                              └──────────┘ │ → re-resolve  │   │
                                           └───────┬───────┘   │
                                                   │           │
                                                   └───────────┘
                                                   (loop until
                                                    all resolved)
```

### 5.2 Template Creation

```
User provides:
  name, description, tags, placeholders, body
           │
           ▼
  ┌──────────────────┐
  │  Validator        │ Validate frontmatter + body consistency
  │                  │
  │  If invalid →    │──── Return errors to adapter
  │  errors          │
  └──────┬───────────┘
         │ if valid
         ▼
  ┌──────────────────┐
  │  Parser           │ Serialize Template → Markdown string
  │  (reverse)        │
  │                  │ "---\n" + YAML.stringify(frontmatter) + "---\n\n" + body
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────┐
  │  Storage          │ Write to .stencil/templates/<name>.md
  │                  │ or .stencil/collections/<collection>/<name>.md
  └──────────────────┘
```

### 5.3 Template Discovery (List/Search)

```
  ┌──────────────────┐
  │  Storage          │
  │                  │
  │  1. Glob .stencil/│──► *.md files
  │     **/*.md      │
  │  2. Parse each   │──► Template[]
  │  3. Filter by    │
  │     ListOptions  │
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────┐
  │  Search Index     │ (in-memory, rebuilt on each call in MVP)
  │                  │
  │  Matches against: │
  │  - name          │
  │  - description   │
  │  - tags[]        │
  │  - collection    │
  │                  │
  │  Scoring:        │
  │  - Exact name    │ = highest
  │  - Tag match     │ = high
  │  - Description   │ = fuzzy substring
  │  substring       │
  └──────────────────┘
```

---

## 6. File Format Specification

### 6.1 Template File (`.md`)

A template file consists of two parts separated by YAML frontmatter delimiters:

```
┌─────────────────────────────────────────┐
│ ---                                     │  ← Opening delimiter (must be line 1)
│ name: create-rest-endpoint              │
│ description: Generate a REST endpoint   │
│ version: 1                              │
│ author: piotr                           │  ← YAML frontmatter
│ tags: [backend, rest]                   │
│ placeholders:                           │
│   - name: entity_name                   │
│     description: Domain entity name     │
│     required: true                      │
│ ---                                     │  ← Closing delimiter
│                                         │  ← Blank line (convention, not required)
│ Create a REST endpoint for              │
│ **{{entity_name}}** with full CRUD.     │  ← Body (Markdown with placeholders)
│                                         │
│ Project: {{$ctx.project_name}}          │  ← Context variable reference
│ Generated on: {{$ctx.date}}             │
└─────────────────────────────────────────┘
```

**Encoding:** UTF-8 (no BOM)
**Line endings:** LF (Unix) preferred; CRLF tolerated
**Max recommended size:** 10KB (no hard limit, but larger templates may impact UX)

### 6.2 Frontmatter Schema (JSON Schema)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["name", "description", "version"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "description": "Unique template identifier in kebab-case"
    },
    "description": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable template description"
    },
    "version": {
      "type": "integer",
      "minimum": 1,
      "description": "Template version number"
    },
    "author": {
      "type": "string",
      "description": "Template author name"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Categorization tags"
    },
    "placeholders": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "description"],
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[a-z0-9]+(_[a-z0-9]+)*$",
            "description": "Placeholder identifier in snake_case"
          },
          "description": {
            "type": "string",
            "description": "Shown to user during interactive fill"
          },
          "required": {
            "type": "boolean",
            "default": true
          },
          "default": {
            "type": "string",
            "description": "Default value if not provided"
          },
          "type": {
            "type": "string",
            "enum": ["string", "number", "boolean", "enum", "file_path"],
            "default": "string",
            "description": "Phase 3: Validation type"
          },
          "options": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Phase 3: Allowed values for enum type"
          }
        }
      }
    }
  }
}
```

### 6.3 Placeholder Syntax

```
Standard:         {{placeholder_name}}
Context variable: {{$ctx.variable_name}}
```

**Parsing rules:**

- Delimiters are `{{` and `}}` by default (configurable via `config.yaml`)
- Whitespace inside delimiters is trimmed: `{{ name }}` equals `{{name}}`
- Nested delimiters are not supported: `{{{{nested}}}}` is invalid
- Escaped delimiters: `\{\{literal\}\}` renders as `{{literal}}` (not resolved)
- Placeholder names must match `[a-zA-Z0-9_.$]+`
- The `$ctx.` prefix is reserved for context variables

### 6.4 Config File (`config.yaml`)

```yaml
# .stencil/config.yaml
version: 1 # Config format version

default_collection: null # Default collection for new templates

custom_context: # Additional $ctx.* variables
  team_name: 'Platform' # Available as {{$ctx.team_name}}
  jira_project: 'PLAT'

placeholder_start: '{{' # Opening delimiter
placeholder_end: '}}' # Closing delimiter
```

**Location priority:** `.stencil/config.yaml` (project) overrides `~/.stencil/config.yaml` (global). Values are merged, not replaced — project config extends global config.

---

## 7. Directory Structure

### 7.1 User-Facing Structure (in a project)

```
project-root/
  .stencil/                              # Stencil root (git-committable)
    config.yaml                          # Project configuration (optional)
    templates/                           # Uncategorized templates
      quick-fix.md
      explain-code.md
    collections/                         # Organized templates
      backend/
        create-rest-endpoint.md
        add-migration.md
        add-service.md
      review/
        security-review.md
        performance-review.md
        accessibility-review.md
      docs/
        write-adr.md
        write-runbook.md
```

### 7.2 Global Templates

```
~/.stencil/                              # User-wide templates
  config.yaml                           # Global configuration (optional)
  templates/
    my-daily-standup.md
    general-review.md
```

### 7.3 Monorepo Structure (Development)

```
stencil/
  packages/
    core/                                # @stencil-pm/core
      src/
        parser.ts
        resolver.ts
        validator.ts
        storage.ts
        collections.ts
        context.ts
        types.ts
        index.ts                         # Public API facade
        cli.ts                           # CLI entry point (for shell adapters)
      __tests__/
        parser.test.ts
        resolver.test.ts
        validator.test.ts
        storage.test.ts
        context.test.ts
        integration.test.ts             # Full pipeline tests
      package.json
      tsconfig.json

    claude-code-plugin/                  # Claude Code adapter
      .claude-plugin/
        plugin.json
      skills/
        stencil/SKILL.md
        stencil-init/SKILL.md
        stencil-create/SKILL.md
        stencil-list/SKILL.md
        stencil-run/SKILL.md
        stencil-show/SKILL.md
        stencil-edit/SKILL.md
        stencil-delete/SKILL.md
        stencil-search/SKILL.md
      scripts/
        resolve-template.sh
        validate-template.sh
        list-templates.sh
        create-template.sh
        delete-template.sh
        detect-context.sh
      package.json                       # Depends on @stencil-pm/core

    vscode-extension/                    # VS Code adapter
      src/
        extension.ts
        providers/
          templateTreeProvider.ts
          templateCodeLensProvider.ts
          contextResolver.ts
        commands/
          runTemplate.ts
          createTemplate.ts
          listTemplates.ts
          deleteTemplate.ts
          initStencil.ts
        ui/
          placeholderForm.ts
          templatePreview.ts
          formHtmlGenerator.ts
        language/
          completionProvider.ts
          diagnosticProvider.ts
      __tests__/
        commands.test.ts
        providers.test.ts
        ui.test.ts
      package.json                       # Depends on @stencil-pm/core
      tsconfig.json

    codex-adapter/                       # Future
      AGENTS.md
      scripts/run-template.sh
      package.json

  .github/
    workflows/
      ci.yml                             # Lint, test, build all packages
      release.yml                        # Publish to npm + VS Code marketplace
  package.json                           # Monorepo root (workspaces)
  pnpm-workspace.yaml                    # pnpm workspaces config
  tsconfig.base.json                     # Shared TypeScript config
  README.md
  LICENSE
  CHANGELOG.md
  CONTRIBUTING.md
```

---

## 8. Technology Choices

| Concern              | Choice                       | Rationale                                                                               |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| **Language**         | TypeScript                   | Type safety, runs in Node.js (Claude Code/Codex), compiles for VS Code, large ecosystem |
| **Package manager**  | pnpm                         | Efficient monorepo support via workspaces, strict dependency resolution                 |
| **Monorepo tool**    | pnpm workspaces + turborepo  | Fast incremental builds, simple config, good caching                                    |
| **YAML parser**      | `yaml` (npm)                 | Full YAML 1.2 spec, good error messages with line numbers, zero subdependencies         |
| **Testing**          | Vitest                       | Fast, TypeScript-native, compatible with VS Code extension testing                      |
| **Linting**          | ESLint + Prettier            | Standard tooling, consistent formatting                                                 |
| **Build**            | tsup                         | Zero-config TypeScript bundler, produces CJS + ESM                                      |
| **VS Code bundling** | esbuild (via `@vscode/vsce`) | Fast bundling for extension packaging                                                   |
| **CI/CD**            | GitHub Actions               | Standard for open-source, free for public repos                                         |
| **Versioning**       | Changesets                   | Monorepo-aware versioning and changelog generation                                      |

### External Dependencies (Core)

The core minimizes dependencies to stay portable:

| Dependency | Purpose                      | Size   |
| ---------- | ---------------------------- | ------ |
| `yaml`     | YAML parsing for frontmatter | ~150KB |

That's it. The core has **one runtime dependency**. File I/O uses Node.js built-in `fs/promises`. Glob uses Node.js 22+ built-in `fs.glob` or a polyfill.

---

## 9. Error Handling

### 9.1 Error Hierarchy

```typescript
// Base error — all Stencil errors extend this
export class StencilError extends Error {
  constructor(
    message: string,
    public readonly code: StencilErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StencilError';
  }
}

export enum StencilErrorCode {
  // Parser errors
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  FRONTMATTER_MISSING = 'FRONTMATTER_MISSING',
  FRONTMATTER_INVALID_YAML = 'FRONTMATTER_INVALID_YAML',
  FRONTMATTER_SCHEMA_ERROR = 'FRONTMATTER_SCHEMA_ERROR',

  // Resolver errors
  UNRESOLVED_REQUIRED = 'UNRESOLVED_REQUIRED',
  CIRCULAR_INCLUDE = 'CIRCULAR_INCLUDE', // Phase 3

  // Storage errors
  STORAGE_READ_ERROR = 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR = 'STORAGE_WRITE_ERROR',
  TEMPLATE_ALREADY_EXISTS = 'TEMPLATE_ALREADY_EXISTS',
  COLLECTION_NOT_FOUND = 'COLLECTION_NOT_FOUND',

  // Context errors
  CONTEXT_PROVIDER_FAILED = 'CONTEXT_PROVIDER_FAILED',

  // Config errors
  CONFIG_INVALID = 'CONFIG_INVALID',
}
```

### 9.2 Error Handling Strategy Per Layer

| Layer                   | Strategy                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core**                | Throws `StencilError` with structured code and details. Never catches silently. Never logs — the adapter decides how to present errors.         |
| **Context Engine**      | Individual provider failures are caught and logged as warnings. Other providers continue. The engine never throws — it returns partial results. |
| **Claude Code adapter** | Catches `StencilError`, formats as human-readable message for Claude to present conversationally.                                               |
| **VS Code adapter**     | Catches `StencilError`, shows via `vscode.window.showErrorMessage()` or inline diagnostics.                                                     |
| **Codex adapter**       | Catches `StencilError`, prints to stderr, exits with code 1.                                                                                    |

---

## 10. Testing Strategy

### 10.1 Test Pyramid

```
          ┌──────────┐
          │   E2E    │  VS Code extension tests (vscode-test)
          │  Tests   │  Claude Code plugin smoke tests
          └────┬─────┘
               │
        ┌──────┴──────┐
        │ Integration  │  Full pipeline: parse → validate → resolve
        │   Tests      │  Storage with real filesystem (temp dirs)
        │              │  Context providers with mocked env
        └──────┬───────┘
               │
    ┌──────────┴──────────┐
    │     Unit Tests       │  Parser: edge cases, malformed YAML
    │                      │  Resolver: all resolution paths
    │                      │  Validator: every rule
    │                      │  Storage: list/get/save/delete
    │                      │  Context: each provider
    └─────────────────────┘
```

### 10.2 Test Coverage Targets

| Package              | Target      | Focus                                               |
| -------------------- | ----------- | --------------------------------------------------- |
| `@stencil-pm/core`   | 90%+        | All exported functions, all error paths             |
| `claude-code-plugin` | Smoke tests | Skill routing, script execution, JSON output format |
| `vscode-extension`   | 70%+        | Commands, providers (mocked VS Code API)            |

### 10.3 Test Fixtures

A shared `fixtures/` directory contains template files for testing:

```
packages/core/__tests__/fixtures/
  valid/
    simple.md                   # Minimal valid template (name + description + body)
    with-placeholders.md        # Template with multiple placeholders
    with-defaults.md            # Template with default values
    with-context-vars.md        # Template using $ctx.* variables
    in-collection/
      backend/
        endpoint.md             # Template in a collection
  invalid/
    missing-frontmatter.md      # No --- delimiters
    missing-name.md             # Frontmatter without name field
    invalid-yaml.md             # Malformed YAML
    bad-placeholder-name.md     # Placeholder with invalid characters
    duplicate-placeholders.md   # Two placeholders with same name
  edge-cases/
    empty-body.md               # Valid frontmatter, empty body
    no-placeholders.md          # Body with no {{}} tokens
    unicode-body.md             # Body with emoji and CJK characters
    large-template.md           # 10KB body for performance testing
    windows-line-endings.md     # CRLF line endings
```

---

## 11. Security Considerations

### 11.1 Context Variable Safety

| Rule                   | Description                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **No env vars**        | `$ctx.*` never auto-resolves from `process.env`. Environment variables often contain secrets (API keys, tokens).                       |
| **No file contents**   | `$ctx.*` variables return metadata (file names, paths), never file contents. A `$ctx.active_file` returns the path, not the file body. |
| **Explicit allowlist** | Only variables from registered `ContextProvider` instances are resolved. No dynamic or wildcard resolution.                            |
| **Config disclosure**  | `config.yaml` with `custom_context` is committed to git. Warn users in docs to never put secrets there.                                |

### 11.2 Template Safety

| Rule                        | Description                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No code execution**       | Templates are text substitution only. No `eval()`, no shell expansion, no template engine with code blocks.                                          |
| **No file system access**   | The template body cannot read, write, or reference files. File operations happen only through the core API at the adapter's request.                 |
| **Sanitization not needed** | Resolved prompts are plain text sent to an AI model. There is no HTML rendering, no SQL, no command injection vector. The output is always a string. |

### 11.3 Storage Safety

| Rule                          | Description                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Path traversal prevention** | Template names are validated as kebab-case. File operations use `path.resolve()` and verify the result is within `.stencil/`. |
| **No symlink following**      | Storage operations use `lstat()` and reject symlinks to prevent directory escape.                                             |
| **Permission preservation**   | The plugin creates files with the user's default umask. It never changes permissions on existing files.                       |

---

## 12. Performance Characteristics

| Operation                          | Expected Performance | Implementation Note                              |
| ---------------------------------- | -------------------- | ------------------------------------------------ |
| Parse single template              | <5ms                 | Single file read + YAML parse                    |
| Validate single template           | <1ms                 | In-memory schema check                           |
| Resolve single template            | <10ms                | String replacement + context resolution          |
| List all templates (100 files)     | <200ms               | Glob + parse all (parallelized)                  |
| Search templates (100 files)       | <250ms               | List + in-memory substring matching              |
| Context resolution (all providers) | <50ms                | Parallel provider execution; git commands cached |
| Full pipeline (parse → resolve)    | <20ms                | Single template end-to-end                       |

**MVP has no caching.** If performance becomes an issue with large collections (500+ templates), Phase 2+ can add:

- Frontmatter-only parsing mode (skip body until needed)
- File watcher + in-memory index (VS Code extension)
- Serialized index file (`.stencil/.index.json`, gitignored)

---

## 13. Phase-Aligned Architecture Evolution

### Phase 1 (MVP)

```
Implemented:
  ✓ @stencil-pm/core (parser, resolver, validator, storage, context)
  ✓ Claude Code plugin (skills + shell scripts)
  ✓ LocalStorageProvider (project dir only)
  ✓ Built-in context providers (System, Git, Project)

Not yet:
  ✗ Global templates (~/.stencil/)
  ✗ Collections management
  ✗ VS Code extension
  ✗ Config file support
```

### Phase 2

```
Added:
  ✓ Global templates (second StorageProvider path)
  ✓ CollectionManager
  ✓ Config file parsing + custom context
  ✓ Search (in-memory substring)
  ✓ VS Code extension MVP (commands, TreeView, Input Boxes)
```

### Phase 3

```
Added:
  ✓ Typed placeholders (type field in PlaceholderDefinition)
  ✓ Placeholder validation in Resolver
  ✓ Conditional sections (new syntax: {{#if}}...{{/if}})
  ✓ Template includes ({{> template-name}})
  ✓ VS Code: Webview form, CodeLens, diagnostics, autocomplete
```

### Phase 4

```
Added:
  ✓ RemoteStorageProvider (implements StorageProvider interface)
  ✓ Registry protocol (fetch, publish, version check)
  ✓ Template versioning + conflict resolution
  ✓ VS Code: remote browser in sidebar
```

### Phase 5

```
Added:
  ✓ Codex adapter
  ✓ Plugin API (adapters can extend core via hooks)
  ✓ Template testing framework
  ✓ Analytics (opt-in telemetry)
```

---

## 14. Key Architectural Decisions

| #     | Decision                             | Rationale                                                                                                                                                                                                                          | Alternatives Considered                                                                                                    |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| AD-1  | TypeScript for core                  | Runs natively in Node.js (Claude Code, Codex), compiles for VS Code extension, single language across all adapters                                                                                                                 | Python (poor VS Code integration), Go (no VS Code extension support), Rust (overkill for text processing)                  |
| AD-2  | Single `yaml` dependency in core     | Minimizes supply chain risk, keeps core portable. YAML parsing is the only thing that needs a library — everything else uses Node.js built-ins.                                                                                    | `gray-matter` (adds markdown parsing we don't need), `js-yaml` (YAML 1.1 only, less accurate)                              |
| AD-3  | Stateless core (no daemon, no cache) | Simplifies adapter integration, prevents state synchronization bugs, works in Codex sandbox. Adapters can add caching if needed.                                                                                                   | SQLite index (adds dependency, overkill for MVP), file watcher daemon (complexity for adapters)                            |
| AD-4  | Shell scripts as Claude Code bridge  | Claude Code skills execute shell commands via `!` syntax. Shell scripts are the only way to invoke Node.js code from a SKILL.md.                                                                                                   | MCP server (heavier, requires running process), direct Node.js execution (not supported by Claude Code skill system)       |
| AD-5  | Monorepo with pnpm workspaces        | All packages share types, single CI pipeline, atomic cross-package changes. pnpm is faster and stricter than npm/yarn.                                                                                                             | Separate repos per package (harder to keep in sync), npm workspaces (slower, less strict)                                  |
| AD-6  | `{{` / `}}` as default delimiters    | Familiar from Handlebars/Mustache, rare in plain Markdown, visually distinct. Configurable for edge cases.                                                                                                                         | `<% %>` (conflicts with HTML), `${}` (conflicts with JS template literals), `[[ ]]` (conflicts with wiki links)            |
| AD-7  | Context variables use `$ctx.` prefix | Clearly separates auto-resolved variables from user-defined placeholders. Prevents name collisions. The `$` prefix signals "system-provided."                                                                                      | No prefix (ambiguous), `@ctx.` (less standard), separate syntax like `<<ctx.date>>` (inconsistent with placeholder syntax) |
| AD-8  | Project templates override global    | Local project context should take precedence — a team's "review" template is more relevant than a personal one. Matches how `.gitconfig` works (local > global).                                                                   | Global overrides project (counterintuitive), error on collision (too strict)                                               |
| AD-9  | Resolver never prompts user          | Keeps core adapter-agnostic. Interactive prompting is fundamentally a UX concern — CLI prompts, VS Code input boxes, and Codex "no prompting" are all different. Core returns unresolved placeholders; adapter decides what to do. | Core includes prompt interface (couples core to I/O model), callback-based prompting (complex, still adapter-specific)     |
| AD-10 | JSON output from CLI scripts         | Structured output that Claude Code can parse reliably. Shell scripts output JSON to stdout; Claude reads it. Human-readable errors go to stderr.                                                                                   | Plain text output (hard to parse), YAML output (unnecessary complexity), exit codes only (insufficient detail)             |

---

## Appendix A: Glossary

| Term                 | Definition                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| **Adapter**          | A package that wraps the core and exposes it through a specific tool's UX (Claude Code, VS Code, Codex) |
| **Collection**       | A named group of templates, mapped to a subdirectory under `.stencil/collections/`                      |
| **Context Engine**   | The subsystem that resolves `$ctx.*` variables from the runtime environment                             |
| **Context Provider** | A pluggable module that supplies a set of `$ctx.*` variables (e.g., `GitContextProvider`)               |
| **Core**             | The portable TypeScript library (`@stencil-pm/core`) containing all template logic                      |
| **Frontmatter**      | YAML metadata block at the top of a template file, delimited by `---`                                   |
| **Placeholder**      | A named variable in a template body, delimited by `{{ }}`, resolved at execution time                   |
| **Resolution**       | The process of replacing placeholders with actual values via the resolution pipeline                    |
| **Skill**            | A Claude Code extension point — a SKILL.md file that instructs Claude how to handle a command           |
| **Storage Provider** | An implementation of the `StorageProvider` interface (local, git, remote)                               |
| **Template**         | The atomic unit of Stencil — a Markdown file with YAML frontmatter and a parameterized body             |
