import { describe, expect, it } from 'vitest';

import {
  buildPlaceholderRegex,
  classifyTemplateBodyToken,
  extractInlineInputTokens,
  extractPlaceholderTokens,
  extractTemplateBodyTokens,
} from '../src/placeholders.js';

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

describe('classifyTemplateBodyToken', () => {
  it('classifies context tokens', () => {
    expect(classifyTemplateBodyToken('$ctx.team_name')).toEqual({
      contextKey: 'team_name',
      kind: 'context',
      raw: '$ctx.team_name',
      token: '$ctx.team_name',
    });
  });

  it('classifies inline input tokens without a default', () => {
    expect(classifyTemplateBodyToken('input:project_name')).toEqual({
      inputName: 'project_name',
      kind: 'inline-input',
      raw: 'input:project_name',
      token: 'input:project_name',
    });
  });

  it('classifies inline input tokens with a default', () => {
    expect(classifyTemplateBodyToken('input:review_type:general')).toEqual({
      defaultValue: 'general',
      inputName: 'review_type',
      kind: 'inline-input',
      raw: 'input:review_type:general',
      token: 'input:review_type:general',
    });
  });

  it('trims whitespace around inline input names and defaults', () => {
    expect(classifyTemplateBodyToken('input:  project_name :  discovery review  ')).toEqual({
      defaultValue: 'discovery review',
      inputName: 'project_name',
      kind: 'inline-input',
      raw: 'input:  project_name :  discovery review  ',
      token: 'input:  project_name :  discovery review',
    });
  });

  it('classifies invalid inline input tokens with missing names', () => {
    expect(classifyTemplateBodyToken('input:   ')).toEqual({
      kind: 'invalid-inline-input',
      raw: 'input:   ',
      reason: 'missing-name',
      token: 'input:',
    });
  });

  it('classifies invalid inline input tokens with empty defaults', () => {
    expect(classifyTemplateBodyToken('input:project_name:   ')).toEqual({
      kind: 'invalid-inline-input',
      raw: 'input:project_name:   ',
      reason: 'empty-default',
      token: 'input:project_name:',
    });
  });

  it('classifies plain tokens as legacy placeholders', () => {
    expect(classifyTemplateBodyToken('project_name')).toEqual({
      kind: 'legacy-placeholder',
      placeholderName: 'project_name',
      raw: 'project_name',
      token: 'project_name',
    });
  });
});

describe('extractTemplateBodyTokens', () => {
  it('preserves duplicate inline input occurrences in order', () => {
    expect(
      extractTemplateBodyTokens(
        'Project {{input:project_name}} again {{input:project_name}} owner {{$ctx.owner}}',
      ),
    ).toEqual([
      {
        inputName: 'project_name',
        kind: 'inline-input',
        raw: 'input:project_name',
        token: 'input:project_name',
      },
      {
        inputName: 'project_name',
        kind: 'inline-input',
        raw: 'input:project_name',
        token: 'input:project_name',
      },
      {
        contextKey: 'owner',
        kind: 'context',
        raw: '$ctx.owner',
        token: '$ctx.owner',
      },
    ]);
  });
});

describe('extractInlineInputTokens', () => {
  it('returns discovered inline inputs with occurrence indexes', () => {
    expect(
      extractInlineInputTokens(
        'Project {{input:project_name}} Review {{input:review_type:general}}',
      ),
    ).toEqual([
      {
        inputName: 'project_name',
        kind: 'inline-input',
        occurrenceIndex: 0,
        raw: 'input:project_name',
        token: 'input:project_name',
      },
      {
        defaultValue: 'general',
        inputName: 'review_type',
        kind: 'inline-input',
        occurrenceIndex: 1,
        raw: 'input:review_type:general',
        token: 'input:review_type:general',
      },
    ]);
  });
});
