import { describe, expect, it } from 'vitest';

import { buildPlaceholderRegex, extractPlaceholderTokens } from '../src/placeholders.js';

describe('buildPlaceholderRegex', () => {
  it('matches default delimiters', () => {
    const regex = buildPlaceholderRegex();
    const matches = [...'Hello {{name}} and {{value}}'.matchAll(regex)];

    expect(matches.map((match) => match[1])).toEqual(['name', 'value']);
  });

  it('escapes regex-special delimiters', () => {
    const regex = buildPlaceholderRegex({ end: ']]', start: '[[' });
    const matches = [...'Hello [[name]]'.matchAll(regex)];

    expect(matches).toHaveLength(1);
    expect(matches[0]?.[1]).toBe('name');
  });
});

describe('extractPlaceholderTokens', () => {
  it('extracts tokens with default delimiters', () => {
    expect(extractPlaceholderTokens('Hello {{name}} {{value}}')).toEqual(
      new Set(['name', 'value']),
    );
  });

  it('extracts tokens with custom delimiters', () => {
    expect(
      extractPlaceholderTokens('Hello [[name]] [[value]]', { end: ']]', start: '[[' }),
    ).toEqual(new Set(['name', 'value']));
  });

  it('trims whitespace inside delimiters', () => {
    expect(
      extractPlaceholderTokens('Hello [[ name ]] [[ $ctx.team_name ]]', {
        end: ']]',
        start: '[[',
      }),
    ).toEqual(new Set(['$ctx.team_name', 'name']));
  });

  it('returns an empty set when there are no matching tokens', () => {
    expect(extractPlaceholderTokens('Hello world', { end: ']]', start: '[[' })).toEqual(new Set());
  });

  it('ignores text using the wrong delimiter pair', () => {
    expect(extractPlaceholderTokens('Hello {{name}}', { end: ']]', start: '[[' })).toEqual(
      new Set(),
    );
  });
});
