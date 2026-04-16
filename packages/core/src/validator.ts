// Validation logic for templates and placeholder definitions.
import type { Template, ValidationResult } from './types.js';

/**
 * Validates a parsed template for required fields and structural correctness.
 * Full rule set implemented in Epic 3.
 */
export function validateTemplate(_template: Template): ValidationResult {
  // TODO: implement validation rules (Epic 3)
  return { issues: [], valid: true };
}

/**
 * Validates raw (pre-parse) frontmatter data.
 * Used before full parsing to catch YAML-level issues.
 * Full implementation in Epic 3.
 */
export function validateFrontmatter(_raw: unknown): ValidationResult {
  // TODO: implement pre-parse validation (Epic 3)
  return { issues: [], valid: true };
}
