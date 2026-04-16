// Placeholder resolution: substitutes {{placeholder}} tokens with resolved values.
import type { ResolutionInput, ResolutionResult, Template } from './types.js';

/**
 * Resolves all placeholders in a template body using the provided inputs.
 * Full resolution pipeline implemented in Epic 5.
 */
export function resolveTemplate(_template: Template, _input: ResolutionInput): ResolutionResult {
  // TODO: implement placeholder resolution pipeline (Epic 5)
  return { placeholders: [], resolvedBody: '', unresolvedCount: 0 };
}
