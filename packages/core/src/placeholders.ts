export interface PlaceholderDelimiters {
  end: string;
  start: string;
}

import type { DiscoveredInlineInputToken, TemplateBodyToken } from './types.js';

export const DEFAULT_PLACEHOLDER_DELIMITERS: PlaceholderDelimiters = {
  end: '}}',
  start: '{{',
};

export function buildPlaceholderRegex(
  delimiters: PlaceholderDelimiters = DEFAULT_PLACEHOLDER_DELIMITERS,
): RegExp {
  return new RegExp(
    `${escapeForRegExp(delimiters.start)}([\\s\\S]+?)${escapeForRegExp(delimiters.end)}`,
    'g',
  );
}

export function extractPlaceholderTokens(
  body: string,
  delimiters: PlaceholderDelimiters = DEFAULT_PLACEHOLDER_DELIMITERS,
): Set<string> {
  const tokens = new Set<string>();
  const regex = buildPlaceholderRegex(delimiters);

  let match: null | RegExpExecArray;
  while ((match = regex.exec(body)) !== null) {
    const token = match[1]?.trim();
    if (token) {
      tokens.add(token);
    }
  }

  return tokens;
}

export function extractTemplateBodyTokens(
  body: string,
  delimiters: PlaceholderDelimiters = DEFAULT_PLACEHOLDER_DELIMITERS,
): TemplateBodyToken[] {
  const tokens: TemplateBodyToken[] = [];
  const regex = buildPlaceholderRegex(delimiters);

  let match: null | RegExpExecArray;
  while ((match = regex.exec(body)) !== null) {
    const raw = match[1];
    if (raw === undefined) {
      continue;
    }

    const token = raw.trim();
    if (token.length === 0) {
      continue;
    }

    tokens.push(classifyTemplateBodyToken(token, raw));
  }

  return tokens;
}

export function extractInlineInputTokens(
  body: string,
  delimiters: PlaceholderDelimiters = DEFAULT_PLACEHOLDER_DELIMITERS,
): DiscoveredInlineInputToken[] {
  return extractTemplateBodyTokens(body, delimiters).flatMap((token, index) =>
    token.kind === 'inline-input' ? [{ ...token, occurrenceIndex: index }] : [],
  );
}

export function classifyTemplateBodyToken(token: string, raw = token): TemplateBodyToken {
  const trimmedToken = token.trim();

  if (trimmedToken.startsWith('$ctx.')) {
    const contextKey = trimmedToken.slice('$ctx.'.length).trim();
    if (contextKey.length > 0) {
      return {
        contextKey,
        kind: 'context',
        raw,
        token: trimmedToken,
      };
    }
  }

  if (trimmedToken.startsWith('input:')) {
    const inlineDescriptor = trimmedToken.slice('input:'.length);
    const separatorIndex = inlineDescriptor.indexOf(':');

    if (separatorIndex === -1) {
      const inputName = inlineDescriptor.trim();
      if (inputName.length === 0) {
        return {
          kind: 'invalid-inline-input',
          raw,
          reason: 'missing-name',
          token: trimmedToken,
        };
      }

      return {
        inputName,
        kind: 'inline-input',
        raw,
        token: trimmedToken,
      };
    }

    const inputName = inlineDescriptor.slice(0, separatorIndex).trim();
    const defaultValue = inlineDescriptor.slice(separatorIndex + 1).trim();
    if (inputName.length === 0) {
      return {
        kind: 'invalid-inline-input',
        raw,
        reason: 'missing-name',
        token: trimmedToken,
      };
    }

    if (defaultValue.length === 0) {
      return {
        kind: 'invalid-inline-input',
        raw,
        reason: 'empty-default',
        token: trimmedToken,
      };
    }

    return {
      defaultValue,
      inputName,
      kind: 'inline-input',
      raw,
      token: trimmedToken,
    };
  }

  return {
    kind: 'legacy-placeholder',
    placeholderName: trimmedToken,
    raw,
    token: trimmedToken,
  };
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
