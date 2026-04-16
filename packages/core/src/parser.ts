// Template file parsing: extracts frontmatter and body from a template file.
import type { Template, TemplateFrontmatter } from './types.js';

/**
 * Parses a raw template string into a Template object.
 * Expected format:
 *   ---
 *   <yaml frontmatter>
 *   ---
 *   <body>
 *
 * Full implementation in Epic 2.
 */
export function parseTemplate(filePath: string, raw: string): Template {
  // TODO: implement YAML frontmatter extraction using the `yaml` package (Epic 2)
  const frontmatter: TemplateFrontmatter = {
    description: '',
    name: '',
    version: 1,
  };
  const body = raw;

  return { body, filePath, frontmatter, source: 'project' };
}
