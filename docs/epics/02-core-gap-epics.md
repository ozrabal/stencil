# Core Package Status and Gap Epics — `@stencil-pm/core`

> Purpose: assess the current core against `docs/stencil-prd.md` and `docs/stencil-architecture.md`, then define only the remaining core epics.
> Audience: maintainers creating detailed implementation plans from the remaining gaps.
> Scope: `packages/core/src/*` and core-facing contract updates in docs/tests.

---

## 1. Current Status

The original scaffold epics are no longer accurate. The core package is not a stub package anymore.

### Implemented and verified

- `types.ts` is aligned with the architecture-level data model.
- `parser.ts` parses frontmatter/body, applies placeholder defaults, detects collections, and surfaces parse errors.
- `validator.ts` implements the expected validation rule set and frontmatter validation.
- `resolver.ts` performs explicit/context/default placeholder resolution and resolves `$ctx.*` tokens.
- `context.ts` provides `ContextEngine`, `SystemContextProvider`, `GitContextProvider`, and `ProjectContextProvider`.
- `storage.ts` provides local filesystem storage with project/global precedence and list/search filters.
- `collections.ts` implements collection CRUD and move/remove flows.
- `stencil.ts` exposes a functional high-level facade for init/create/list/get/delete/validate/resolve/search.
- Core tests currently pass: `194/194`.
- Core typecheck currently passes.

### Implemented but only partially aligned with docs

- `StencilOptions.config` and `StencilConfig` exist in types, but runtime config loading/application is not implemented.
- Global templates are supported only when `globalDir` is explicitly passed; there is no default `~/.stencil/` discovery path.
- Placeholder delimiters are defined in config types, but parser/validator/resolver still hardcode `{{` and `}}`.
- The facade exposes working methods, but not all product-level template mutation APIs needed for edit/copy-style workflows.
- Core error handling is still mostly generic `Error`-based outside parser-specific parse errors.

### Out of scope for these core epics

These are real product gaps, but they are adapter-owned rather than core-owned:

- VS Code command handlers are still TODOs.
- VS Code context resolver and tree provider are still TODOs.
- Codex adapter is still scaffold-only.
- Interactive prompting, confirmation UX, and final execution handoff are adapter responsibilities.

---

## 2. Gap Summary

The foundational core is implemented. The remaining core work is concentrated in five areas:

1. Config file support and runtime config application
2. Default global directory discovery and config precedence
3. Template mutation APIs for edit/copy-style workflows
4. Structured error model and adapter-safe diagnostics
5. Delimiter-aware placeholder pipeline and config-aware validation

The epics below are written as the next planning baseline.

---

## Epic A — Config System and Runtime Option Application

**Problem**

The architecture defines `.stencil/config.yaml`, merged project/global config, `custom_context`, `default_collection`, and configurable placeholder delimiters. The current core defines these types but does not load or apply them anywhere.

**Why this matters**

- `StencilConfig` is currently dead API surface.
- Adapters cannot rely on stable config-driven behavior.
- Future work such as custom context and delimiter customization has no runtime entry point.

**Primary outcomes**

- Project and global config files are discovered and merged.
- Config is available to the `Stencil` facade as resolved runtime state.
- `custom_context` is injected into context resolution.
- `default_collection` is honored when creating templates without an explicit collection.

**Scope**

- Add a config loader module in `packages/core/src/config.ts`.
- Support reading:
  - `<projectDir>/.stencil/config.yaml`
  - `<globalDir>/config.yaml`
- Merge global first, then project override.
- Normalize config keys from YAML snake_case to internal camelCase shape if needed.
- Apply sane defaults:
  - `version: 1`
  - `placeholderStart: '{{'`
  - `placeholderEnd: '}}'`
- Register resolved `custom_context` as a context provider inside `Stencil`.
- Use `defaultCollection` in `Stencil.create()` when `collection` is omitted.

**Implementation guide**

1. Add `config.ts` with:
   - `loadStencilConfig(projectStencilDir: string, globalDir?: string): Promise<StencilConfig>`
   - `mergeStencilConfig(globalConfig, projectConfig): StencilConfig`
   - YAML parsing and validation helpers
2. Keep config loading stateless and filesystem-based, consistent with the rest of core.
3. Introduce a simple `StaticContextProvider` or `ConfigContextProvider` for `custom_context`.
4. Update `Stencil` constructor/init path so resolved config is stored internally and reused.
5. Ensure malformed config produces typed, actionable errors instead of silently degrading.

**Suggested file touch points**

- `packages/core/src/config.ts` (new)
- `packages/core/src/stencil.ts`
- `packages/core/src/context.ts`
- `packages/core/src/types.ts`
- `packages/core/src/index.ts`
- `packages/core/test/*`

**Test plan**

- Loads with no config files present.
- Loads only project config.
- Loads only global config.
- Merges global + project config with project precedence.
- Registers `custom_context` values as `$ctx.*`.
- Applies `defaultCollection` on `create()`.
- Fails with clear diagnostics on malformed YAML or invalid config schema.

**Exit criteria**

- Config files are actually used at runtime by the core.
- `StencilConfig` fields are no longer inert types.
- Adapters can rely on config-driven defaults without re-implementing config parsing.

---

## Epic B — Global Directory Auto-Discovery and Precedence Completion

**Problem**

The PRD and architecture describe support for user-wide templates in `~/.stencil/`. The storage layer can already work with a global directory, but the facade does not discover it by default and config precedence is not wired around it.

**Why this matters**

- Current behavior only supports global templates when adapters explicitly pass `globalDir`.
- Product-level global template support is incomplete from a consumer perspective.

**Primary outcomes**

- `Stencil` automatically resolves a default global directory when one is not supplied.
- Global config and global templates work out of the box.
- Project-over-global precedence remains unchanged and explicit.

**Scope**

- Resolve a default global path using the current platform environment.
- Default to `~/.stencil/` when `globalDir` is not provided.
- Use the resolved global path for:
  - template listing/get precedence
  - config loading
- Keep opt-out behavior available for tests or adapters that want project-only mode.

**Implementation guide**

1. Add a small path utility, for example in `packages/core/src/paths.ts`:
   - `resolveGlobalStencilDir(explicitGlobalDir?: string): string | undefined`
2. Use `os.homedir()` and append `.stencil`.
3. Allow disabling global resolution through an explicit option if needed, for example `globalDir: null` semantics or a dedicated option.
4. Keep `LocalStorageProvider` unchanged where possible; this should mostly be a facade/runtime wiring change.
5. Fold this into the config-loading work so config precedence is coherent.

**Suggested file touch points**

- `packages/core/src/stencil.ts`
- `packages/core/src/paths.ts` (new)
- `packages/core/src/config.ts` (if Epic A lands)
- `packages/core/src/types.ts`
- `packages/core/test/storage.test.ts`
- `packages/core/test/stencil.test.ts`

**Test plan**

- Defaults to `~/.stencil/` when not configured.
- Honors an explicitly provided `globalDir`.
- Can run in project-only mode when explicitly disabled.
- Preserves project-over-global precedence for both templates and config.

**Exit criteria**

- A consumer can instantiate `Stencil({ projectDir })` and get working global template support automatically.

---

## Epic C — Template Mutation API (Edit, Update, Copy, Rename-Safe Workflows)

**Problem**

The core supports create/get/delete/search, but product-level template management also requires edit/update and duplicate/copy flows. Today, adapters would need to compose these manually against storage, which leaks low-level concerns and makes behavior inconsistent.

**Why this matters**

- PRD template management is not fully covered by the facade.
- Adapters need a stable, validated mutation API instead of reimplementing write flows.

**Primary outcomes**

- The facade supports updating existing templates.
- The facade supports duplicating templates under a new name.
- Rename-safe behavior and overwrite policy are defined explicitly.

**Scope**

- Add `update()` to replace frontmatter/body/collection of an existing template.
- Add `copy()` to duplicate an existing template under a new template name.
- Optionally add `rename()` if maintainers prefer explicit name mutation rather than overloading `update()`.
- Define collision semantics:
  - fail if target exists by default
  - optional explicit overwrite flag if desired
- Revalidate on every mutation before save.

**Implementation guide**

1. Extend `Stencil` API with mutation methods, for example:
   - `update(name, patch)`
   - `copy(sourceName, targetName, overrides?)`
   - optional `rename(oldName, newName)`
2. Avoid exposing partial invalid intermediate state.
3. Prefer composing existing `get`, `validateTemplate`, and `saveTemplate` behavior instead of adding duplicate logic into storage.
4. If renaming is added, handle old-file deletion and new-file creation atomically enough for local filesystem semantics.
5. Keep project/global behavior explicit:
   - allow updating project templates
   - reject mutation of global-only templates through a project-scoped facade unless explicitly supported

**Suggested file touch points**

- `packages/core/src/stencil.ts`
- `packages/core/src/storage.ts`
- `packages/core/src/types.ts`
- `packages/core/test/stencil.test.ts`
- `packages/core/test/storage.test.ts`

**Test plan**

- Update body only.
- Update frontmatter only.
- Move template between collections during update.
- Copy template with and without collection override.
- Reject copy/update when validation fails.
- Reject rename/copy collision unless overwrite is explicitly enabled.
- Reject mutation of global-only templates when unsupported.

**Exit criteria**

- The facade covers full core template CRUD plus duplicate-style workflows without adapters reaching into storage internals.

---

## Epic D — Structured Core Error Model and Diagnostics

**Problem**

Outside parser-specific errors, the core mostly throws generic `Error` strings. The architecture defines a richer error-handling approach, and adapters need typed failures to present good UX and automation.

**Why this matters**

- Adapters cannot reliably branch on error type.
- Generic string matching is brittle.
- Config, storage, and validation failures need clearer contracts.

**Primary outcomes**

- Core throws typed domain errors with stable metadata.
- Adapters can map failures to prompts, warnings, or hard stops without string parsing.
- Error messages remain human-readable while also machine-actionable.

**Scope**

- Introduce a core error hierarchy, for example:
  - `StencilError`
  - `TemplateNotFoundError`
  - `TemplateValidationError`
  - `TemplateConflictError`
  - `ConfigParseError`
  - `StorageOperationError`
- Include useful structured fields where appropriate:
  - `templateName`
  - `filePath`
  - `issues`
  - `operation`
- Replace generic throws in `stencil.ts` and config/storage paths.

**Implementation guide**

1. Add `packages/core/src/errors.ts`.
2. Normalize throw sites in:
   - `stencil.ts`
   - `parser.ts`
   - config loading
   - storage/mutation flows
3. Preserve original cause where the runtime supports it.
4. Ensure validation failures can carry the full `ValidationResult` or at least the error-severity subset.
5. Export error types from the public API.

**Suggested file touch points**

- `packages/core/src/errors.ts` (new)
- `packages/core/src/stencil.ts`
- `packages/core/src/parser.ts`
- `packages/core/src/storage.ts`
- `packages/core/src/config.ts`
- `packages/core/src/index.ts`
- `packages/core/test/*`

**Test plan**

- Not found errors are typed and carry template name.
- Validation failures carry issues.
- Config parse failures identify the failing file.
- Mutation conflicts are distinguishable from validation failures.
- Existing happy-path behavior remains unchanged.

**Exit criteria**

- Core consumers no longer need to pattern-match error strings.

---

## Epic E — Delimiter-Aware Placeholder Pipeline

**Problem**

The architecture exposes configurable placeholder delimiters, but parser/validator/resolver currently hardcode the `{{...}}` syntax. This leaves the config surface incomplete and creates a mismatch between docs, types, and runtime behavior.

**Why this matters**

- Placeholder syntax customization cannot work until the entire pipeline is delimiter-aware.
- Config support is incomplete unless the tokenization logic uses it.

**Primary outcomes**

- Validator token extraction respects configured delimiters.
- Resolver token replacement respects configured delimiters.
- The core keeps `{{...}}` as the default with no behavior change for current users.

**Scope**

- Replace hardcoded placeholder regex usage with a config-derived tokenizer.
- Ensure `$ctx.*` handling still works with custom delimiters.
- Preserve current warning behavior for undeclared/unused placeholders.

**Implementation guide**

1. Add a shared helper, for example in `packages/core/src/placeholders.ts`:
   - `buildPlaceholderRegex(start: string, end: string): RegExp`
   - `extractPlaceholderTokens(body, delimiters): Set<string>`
2. Escape delimiters safely before constructing regexes.
3. Pass resolved config into validation/resolution flows.
4. Keep public APIs simple: prefer internal wiring over forcing every consumer to pass delimiters manually.
5. Verify whitespace trimming and repeated token handling still behave exactly as today.

**Suggested file touch points**

- `packages/core/src/placeholders.ts` (new)
- `packages/core/src/resolver.ts`
- `packages/core/src/validator.ts`
- `packages/core/src/stencil.ts`
- `packages/core/test/resolver.test.ts`
- `packages/core/test/validator.test.ts`

**Test plan**

- Default delimiters keep all current tests green.
- Custom delimiters resolve placeholders correctly.
- `$ctx.*` works under custom delimiters.
- Undeclared and unused placeholder warnings still work.
- Mixed or malformed delimiters fail safely.

**Exit criteria**

- Placeholder delimiter configuration is fully functional, not type-only.

---

## 3. Recommended Delivery Order

```text
Epic A — Config System and Runtime Option Application
  -> Epic B — Global Directory Auto-Discovery and Precedence Completion
  -> Epic E — Delimiter-Aware Placeholder Pipeline
  -> Epic C — Template Mutation API
  -> Epic D — Structured Core Error Model and Diagnostics
```

### Rationale

- Epic A unlocks actual use of existing config types and is the foundation for the rest.
- Epic B should be delivered with config so global template and global config behavior land coherently.
- Epic E depends on config being real, otherwise delimiter settings remain nowhere to come from.
- Epic C is user-visible core capability expansion but can build on the now-stable config/runtime layer.
- Epic D can start earlier, but it is safest to finalize once the main new flows and failure modes are in place.

---

## 4. Planning Notes

When converting these epics into detailed plans:

- Treat the foundational module implementation as complete; do not re-plan parser/validator/resolver/storage from scratch.
- Keep adapter responsibilities out of core plans unless they require a new core contract.
- Prefer additive changes that preserve the current passing test suite.
- Require each epic plan to include both API-level tests and end-to-end facade tests.
