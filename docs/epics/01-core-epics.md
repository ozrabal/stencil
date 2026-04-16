# Core Package Epics — `@stencil-pm/core`

> Basis for implementation tasks. All work targets `packages/core/src/`.
> Current state: all modules are stubs. `types.ts` diverges from architecture spec (see Epic 1).

---

## Epic 1 — Type Alignment

**Goal:** Make `types.ts` match the architecture spec exactly. All other epics depend on this.

**Scope:**

- Rename `PlaceholderDefinition.key` → `name`
- Change `TemplateFrontmatter.version` from `string` to `number`
- Add missing fields: `author`, `PlaceholderType`, `TemplateSource`, `Template.collection`, `Template.source`
- Add `ResolutionInput`, `ResolvedPlaceholder`, `ResolutionResult`
- Add `ValidationSeverity`, `ValidationIssue`, `ValidationResult` (replace current simple version)
- Add `StorageProvider` interface and `ListOptions`
- Add `ContextProvider` interface (align with architecture — single `resolve()` method returning `Record<string, string>`)
- Add `StencilConfig`

**Exit criteria:** `types.ts` exports every type defined in architecture §3.2, tests typecheck cleanly.

---

## Epic 2 — Parser

**Goal:** Implement `parseTemplate()` so it correctly splits frontmatter from body and returns a typed `Template`.

**Scope:**

- Read raw string, detect `---` boundaries
- Parse YAML block via `yaml` package into `TemplateFrontmatter`
- Apply defaults: `placeholder.required = true` when not specified
- Detect `collection` from file path (`/collections/<name>/`)
- Throw `TemplateNotFoundError` / `ParseError` with line numbers on failure

**Exit criteria:** All `parser.test.ts` cases pass, including malformed-frontmatter and missing-`---` error paths.

---

## Epic 3 — Validator

**Goal:** Implement `validateTemplate()` with the full rule set from architecture §3.4.

**Scope (10 rules):**

| Rule | Check                                  | Severity |
| ---- | -------------------------------------- | -------- |
| V1   | `name` present                         | Error    |
| V2   | `name` is kebab-case                   | Error    |
| V3   | `description` present                  | Error    |
| V4   | `version` is positive integer          | Error    |
| V5   | `placeholders[].name` is snake_case    | Error    |
| V6   | `placeholders[].description` present   | Error    |
| V7   | No duplicate placeholder names         | Error    |
| V8   | Body references undeclared placeholder | Warning  |
| V9   | Declared placeholder not used in body  | Warning  |
| V10  | `required` placeholder has `default`   | Warning  |

- Add `validateFrontmatter(raw: unknown): ValidationResult` for pre-parse use
- Return structured `ValidationResult` with `ValidationIssue[]` (not plain `string[]`)

**Exit criteria:** All `validator.test.ts` cases pass, each rule exercised by at least one test.

---

## Epic 4 — Context Engine

**Goal:** Implement `ContextEngine` class with provider registry and three built-in providers.

**Scope:**

- `ContextEngine` class: `register()`, `resolveAll()`, `resolve(name)`
- Providers run in parallel (`Promise.all`); failures return `{}`, never throw
- Later-registered providers override earlier on key collision
- Built-in providers:
  - `SystemContextProvider` — `date` (ISO 8601), `os`, `cwd`
  - `GitContextProvider` — `current_branch`, `git_user` (shell-exec `git` commands)
  - `ProjectContextProvider` — `project_name` (dir name or from `package.json`/`pom.xml`/etc.), `language`

**Exit criteria:** Each provider resolves correctly; a failing provider (e.g., no git) does not block others.

---

## Epic 5 — Resolver

**Goal:** Implement `resolveTemplate()` — the placeholder substitution pipeline.

**Scope:**

- Accept `Template` + `ResolutionInput` (explicit values + pre-resolved context map)
- For each declared placeholder: apply priority order (explicit → context → default → unresolved)
- Scan body with `PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g`
- `$ctx.*` tokens look up context map; other tokens look up resolved placeholders
- Unknown tokens left as-is
- Return `ResolutionResult`: `resolvedBody`, per-placeholder `ResolvedPlaceholder[]`, `unresolvedCount`
- Resolver is pure/stateless — no I/O, no prompting

**Exit criteria:** All `resolver.test.ts` cases pass, including partial resolution and `$ctx.*` tokens.

---

## Epic 6 — Storage (`LocalStorageProvider`)

**Goal:** Implement filesystem read/write for templates.

**Scope:**

- Implements `StorageProvider` interface
- Constructor accepts `projectDir` and optional `globalDir`
- `listTemplates(options?)`: recursive scan for `*.md`, parse each, apply `ListOptions` filters, project wins on name collision, sort by collection → name
- `getTemplate(name)`: search project then global dir
- `saveTemplate(template)`: serialize to `---\nYAML\n---\n\nbody`, `mkdir -p`, write to correct path (collections vs templates/)
- `deleteTemplate(name)`: delete file, return `boolean`
- `templateExists(name)`: existence check without full parse

**Exit criteria:** Round-trip test (save → list → get → delete) passes; collection placement and precedence rules verified.

---

## Epic 7 — Collection Manager

**Goal:** Implement `CollectionManager` as a thin layer over `StorageProvider`.

**Scope:**

- `listCollections()` — derive collection names from subdirectories
- `createCollection(name)` — create directory
- `moveToCollection(templateName, collectionName)` — re-save template with new collection
- `removeCollection(name)` — move templates to uncategorized, remove directory
- `listTemplatesInCollection(name)` — filtered list

**Exit criteria:** All collection operations tested end-to-end against a temp directory.

---

## Epic 8 — Public API Facade (`Stencil` class)

**Goal:** Wire all modules into the `Stencil` facade and expose the high-level API.

**Scope:**

- `Stencil` constructor accepts `StencilOptions` (`projectDir`, optional `globalDir`, optional extra context providers)
- `init()` — create `.stencil/templates/` if missing
- `resolve(name, explicit)` — full pipeline: get → validate → resolveAll context → resolve placeholders
- `create(frontmatter, body, collection?)` — validate then save
- `list(options?)`, `get(name)`, `delete(name)`, `validate(name)`, `search(query)`
- Update `index.ts` exports

**Exit criteria:** Integration test covers the full happy-path flow end-to-end using a real temp `.stencil/` directory.

---

## Dependency Order

```text
Epic 1 (types)
  → Epic 2 (parser)
  → Epic 3 (validator)     depends on Epic 2
  → Epic 4 (context)
  → Epic 5 (resolver)      depends on Epics 2, 3, 4
  → Epic 6 (storage)       depends on Epic 2
  → Epic 7 (collections)   depends on Epic 6
  → Epic 8 (facade)        depends on all above
```

Epics 2, 4, and 6 can start in parallel after Epic 1 is done.
