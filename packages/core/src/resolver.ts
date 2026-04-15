// Placeholder resolution: substitutes {{key}} patterns with resolved values.
import type { ContextProvider, RenderResult, Template } from './types.js';

/**
 * Resolves all placeholders in a template body using the provided context providers.
 */
export function resolveTemplate(
  template: Template,
  providers: ContextProvider[],
): Promise<RenderResult> {
  // TODO: implement placeholder resolution
  void providers;
  return Promise.resolve({ content: template.body, unresolvedPlaceholders: [] });
}
