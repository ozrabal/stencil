// Template file parsing: extracts frontmatter and body from a template file.
import type { Template, TemplateFrontmatter } from './types.js';

/**
 * Parses a raw template string into a Template object.
 * Expected format:
 *   ---
 *   <yaml frontmatter>
 *   ---
 *   <body>
 */
export function parseTemplate(filePath: string, raw: string): Template {
  // TODO: implement YAML frontmatter extraction using the `yaml` package
  const frontmatter: TemplateFrontmatter = { name: '' };
  const body = raw;

  return { body, filePath, frontmatter };
}
