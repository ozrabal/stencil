// All shared type definitions for @stencil-pm/core

/**
 * Represents the frontmatter of a template file.
 */
export interface TemplateFrontmatter {
  description?: string;
  name: string;
  placeholders?: PlaceholderDefinition[];
  tags?: string[];
  version?: string;
}

/**
 * A placeholder defined in a template's frontmatter.
 */
export interface PlaceholderDefinition {
  default?: string;
  description?: string;
  key: string;
  required?: boolean;
  source?: PlaceholderSource;
}

/**
 * Source from which a placeholder value is resolved.
 */
export type PlaceholderSource = 'env' | 'git' | 'prompt' | 'static';

/**
 * A parsed template, combining frontmatter and body.
 */
export interface Template {
  body: string;
  filePath: string;
  frontmatter: TemplateFrontmatter;
}

/**
 * A collection groups multiple templates under a named scope.
 */
export interface Collection {
  description?: string;
  name: string;
  templates: Template[];
}

/**
 * Context values resolved for placeholder substitution.
 */
export type ResolvedContext = Record<string, string>;

/**
 * Result of a template render operation.
 */
export interface RenderResult {
  content: string;
  unresolvedPlaceholders: string[];
}

/**
 * Provider interface for persisting template data.
 */
export interface StorageProvider {
  deleteTemplate(filePath: string): Promise<void>;
  listTemplates(directory: string): Promise<string[]>;
  readTemplate(filePath: string): Promise<string>;
  writeTemplate(filePath: string, content: string): Promise<void>;
}

/**
 * Provider interface for resolving context values.
 */
export interface ContextProvider {
  resolve(key: string): Promise<string | undefined>;
}
