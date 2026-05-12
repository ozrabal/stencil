// All shared type definitions for @stencil-pm/core
// Matches architecture spec §3.2 exactly.

// ── Template ──────────────────────────────────────────

export interface TemplateFrontmatter {
  author?: string;
  description: string; // human-readable summary
  name: string; // kebab-case unique identifier
  placeholders?: PlaceholderDefinition[];
  tags?: string[];
  version: number; // template version, starts at 1
}

export interface PlaceholderDefinition {
  default?: string; // default value if not provided
  description: string; // shown during interactive fill
  name: string; // snake_case identifier
  options?: string[]; // Phase 3: allowed values for enum
  required: boolean; // default: true
  type?: PlaceholderType; // Phase 3: validation type
}

export type PlaceholderType = 'boolean' | 'enum' | 'file_path' | 'number' | 'string';

export interface Template {
  body: string; // raw body with {{placeholder}} tokens
  bodyTokens?: TemplateBodyToken[]; // parsed token metadata derived from the body
  collection?: string; // collection name (from directory)
  filePath: string; // absolute path to the .md file
  frontmatter: TemplateFrontmatter;
  source: TemplateSource; // where this template came from
}

export type TemplateSource = 'global' | 'project' | 'remote';

export type TemplateBodyToken =
  | ContextTemplateBodyToken
  | InlineInputTemplateBodyToken
  | InvalidInlineInputTemplateBodyToken
  | LegacyPlaceholderTemplateBodyToken;

interface TemplateBodyTokenBase {
  raw: string;
  token: string;
}

export interface ContextTemplateBodyToken extends TemplateBodyTokenBase {
  contextKey: string;
  kind: 'context';
}

export interface InlineInputTemplateBodyToken extends TemplateBodyTokenBase {
  defaultValue?: string;
  inputName: string;
  kind: 'inline-input';
}

export interface InvalidInlineInputTemplateBodyToken extends TemplateBodyTokenBase {
  kind: 'invalid-inline-input';
  reason: 'empty-default' | 'missing-name';
}

export interface LegacyPlaceholderTemplateBodyToken extends TemplateBodyTokenBase {
  kind: 'legacy-placeholder';
  placeholderName: string;
}

export interface DiscoveredInlineInputToken extends InlineInputTemplateBodyToken {
  occurrenceIndex: number;
}

export interface NormalizedInputDefinition {
  defaultValue?: string;
  description?: string;
  name: string;
  options?: string[];
  required: boolean;
  sources: Array<'frontmatter' | 'inline' | 'legacy'>;
  type?: PlaceholderType;
}

export interface ResolvedInputState {
  defaultValue?: string;
  description?: string;
  name: string;
  required: boolean;
  source: 'context' | 'default' | 'explicit' | 'unresolved';
  sources: Array<'frontmatter' | 'inline' | 'legacy'>;
  value: string;
}

export interface TemplateInputNormalizationResult {
  inputs: NormalizedInputDefinition[];
  issues: ValidationIssue[];
}

// ── Resolution ────────────────────────────────────────

export interface ResolutionInput {
  /** Context variables auto-resolved from environment */
  context: Record<string, string>;
  /** Values explicitly passed by the user (e.g., CLI args) */
  explicit: Record<string, string>;
}

export interface ResolvedPlaceholder {
  name: string;
  source: 'context' | 'default' | 'explicit' | 'unresolved';
  value: string;
}

export interface ResolutionResult {
  inputs: ResolvedInputState[]; // normalized runtime input state with metadata
  placeholders: ResolvedPlaceholder[]; // resolution details per placeholder
  resolvedBody: string; // body with all placeholders filled
  unresolvedCount: number; // how many remain unresolved
}

// ── Validation ────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  field?: string; // frontmatter field path
  line?: number; // line number in template file
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  valid: boolean; // true if no errors (warnings OK)
}

// ── Storage ───────────────────────────────────────────

export interface StorageProvider {
  deleteTemplate(name: string): Promise<boolean>;
  getTemplate(name: string): Promise<null | Template>;
  listTemplates(options?: ListOptions): Promise<Template[]>;
  saveTemplate(template: Template): Promise<void>;
  templateExists(name: string): Promise<boolean>;
}

export interface ListOptions {
  collection?: string;
  searchQuery?: string;
  source?: TemplateSource;
  tags?: string[];
}

export interface UpdateTemplateInput {
  body?: string;
  collection?: null | string;
  frontmatter?: Partial<Omit<TemplateFrontmatter, 'name'>>;
}

export interface CopyTemplateOptions {
  body?: string;
  collection?: null | string;
  frontmatter?: Partial<Omit<TemplateFrontmatter, 'name'>>;
  overwrite?: boolean;
}

export interface RenameTemplateOptions {
  overwrite?: boolean;
}

// ── Context ───────────────────────────────────────────

export interface ContextProvider {
  /** Human-readable name for this provider (e.g., "Git", "VS Code") */
  name: string;

  /**
   * Returns all context variables this provider can resolve.
   * Keys are without the $ctx. prefix (e.g., "project_name", not "$ctx.project_name").
   */
  resolve(): Promise<Record<string, string>>;
}

// ── Configuration ─────────────────────────────────────

export interface StencilConfig {
  customContext?: Record<string, string>;
  defaultCollection?: string;
  placeholderEnd: string; // default: "}}"
  placeholderStart: string; // default: "{{"
  version: number;
}

// ── Public API ─────────────────────────────────────────

export interface StencilOptions {
  /** Partial config overrides. */
  config?: Partial<StencilConfig>;
  /** Additional context providers registered by the adapter. Override built-ins on collision. */
  contextProviders?: ContextProvider[];
  /**
   * Global stencil directory behavior:
   * - omitted: auto-discover ~/.stencil/
   * - string: use the explicit directory
   * - null: disable global lookup
   */
  globalDir?: null | string;
  /** Path to the project root directory (Stencil appends .stencil/ internally). */
  projectDir: string;
}
