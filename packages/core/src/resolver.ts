import type { PlaceholderDelimiters } from './placeholders.js';
import type { ResolutionInput, ResolutionResult, ResolvedPlaceholder, Template } from './types.js';

// Placeholder resolution: substitutes {{placeholder}} tokens with resolved values.
// Architecture §3.5
import { buildPlaceholderRegex, DEFAULT_PLACEHOLDER_DELIMITERS } from './placeholders.js';

/**
 * Resolves all placeholders in a template body using the provided inputs.
 *
 * Resolution priority (highest -> lowest):
 *   1. explicit
 *   2. context
 *   3. default
 *   4. unresolved
 */
export function resolveTemplate(
  template: Template,
  input: ResolutionInput,
  options: { delimiters?: PlaceholderDelimiters } = {},
): ResolutionResult {
  const { context, explicit } = input;
  const declared = template.frontmatter.placeholders ?? [];
  const delimiters = options.delimiters ?? DEFAULT_PLACEHOLDER_DELIMITERS;

  const resolvedMap = new Map<string, string>();
  const placeholders: ResolvedPlaceholder[] = [];

  for (const placeholder of declared) {
    const { default: defaultValue, name } = placeholder;
    let resolved: ResolvedPlaceholder;

    if (Object.hasOwn(explicit, name) && explicit[name] !== undefined) {
      resolved = { name, source: 'explicit', value: explicit[name] };
    } else if (Object.hasOwn(context, name) && context[name] !== undefined) {
      resolved = { name, source: 'context', value: context[name] };
    } else if (defaultValue !== undefined) {
      resolved = { name, source: 'default', value: defaultValue };
    } else {
      resolved = { name, source: 'unresolved', value: '' };
    }

    placeholders.push(resolved);
    if (resolved.source !== 'unresolved') {
      resolvedMap.set(name, resolved.value);
    }
  }

  const unresolvedCount = placeholders.filter(
    (placeholder) => placeholder.source === 'unresolved',
  ).length;

  const placeholderRegex = buildPlaceholderRegex(delimiters);
  const resolvedBody = template.body.replace(placeholderRegex, (match, token: string) => {
    const trimmed = token.trim();

    if (trimmed.startsWith('$ctx.')) {
      const key = trimmed.slice('$ctx.'.length);
      return context[key] ?? match;
    }

    return resolvedMap.get(trimmed) ?? match;
  });

  return { placeholders, resolvedBody, unresolvedCount };
}
