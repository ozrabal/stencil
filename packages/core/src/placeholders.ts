export interface PlaceholderDelimiters {
  end: string;
  start: string;
}

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

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
