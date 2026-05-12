import type { PlaceholderDelimiters } from './placeholders.js';
import type {
  ResolutionInput,
  ResolutionResult,
  ResolvedInputState,
  ResolvedPlaceholder,
  Template,
} from './types.js';

// Placeholder resolution: substitutes {{placeholder}} tokens with resolved values.
// Architecture §3.5
import {
  buildPlaceholderRegex,
  classifyTemplateBodyToken,
  DEFAULT_PLACEHOLDER_DELIMITERS,
} from './placeholders.js';
import { normalizeTemplateInputs } from './validator.js';

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
  const delimiters = options.delimiters ?? DEFAULT_PLACEHOLDER_DELIMITERS;
  const normalizedInputs = normalizeTemplateInputs(template, { delimiters }).inputs;

  const resolvedMap = new Map<string, string>();
  const inputs: ResolvedInputState[] = normalizedInputs.map((normalizedInput) => {
    const { defaultValue, name, required, sources } = normalizedInput;
    const metadata = {
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(normalizedInput.description !== undefined
        ? { description: normalizedInput.description }
        : {}),
    };
    let resolved: ResolvedInputState;

    if (Object.hasOwn(explicit, name) && explicit[name] !== undefined) {
      resolved = {
        ...metadata,
        name,
        required,
        source: 'explicit',
        sources,
        value: explicit[name],
      };
    } else if (
      sources.includes('legacy') &&
      Object.hasOwn(context, name) &&
      context[name] !== undefined
    ) {
      resolved = {
        ...metadata,
        name,
        required,
        source: 'context',
        sources,
        value: context[name],
      };
    } else if (defaultValue !== undefined) {
      resolved = {
        ...metadata,
        name,
        required,
        source: 'default',
        sources,
        value: defaultValue,
      };
    } else {
      resolved = {
        ...metadata,
        name,
        required,
        source: 'unresolved',
        sources,
        value: '',
      };
    }

    if (resolved.source !== 'unresolved') {
      resolvedMap.set(name, resolved.value);
    }

    return resolved;
  });

  const placeholders: ResolvedPlaceholder[] = inputs.map(({ name, source, value }) => ({
    name,
    source,
    value,
  }));

  const unresolvedCount = inputs.filter(
    (resolvedInput) => resolvedInput.source === 'unresolved',
  ).length;

  const placeholderRegex = buildPlaceholderRegex(delimiters);
  const resolvedBody = template.body.replace(placeholderRegex, (match, token: string) => {
    const classifiedToken = classifyTemplateBodyToken(token);

    switch (classifiedToken.kind) {
      case 'context':
        return context[classifiedToken.contextKey] ?? match;
      case 'inline-input':
        return resolvedMap.get(classifiedToken.inputName) ?? match;
      case 'invalid-inline-input':
        return match;
      case 'legacy-placeholder':
        return resolvedMap.get(classifiedToken.placeholderName) ?? match;
    }
  });

  return { inputs, placeholders, resolvedBody, unresolvedCount };
}
