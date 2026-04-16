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
  collection?: string; // collection name (from directory)
  filePath: string; // absolute path to the .md file
  frontmatter: TemplateFrontmatter;
  source: TemplateSource; // where this template came from
}

export type TemplateSource = 'global' | 'project' | 'remote';

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
