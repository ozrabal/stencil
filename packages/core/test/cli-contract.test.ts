import { describe, expect, it } from 'vitest';

import {
  createCliErrorEnvelope,
  createCliNeedsInputEnvelope,
  createCliOkEnvelope,
  createCliValidationFailedEnvelope,
  toCliTemplateDetail,
  toCliTemplateSummary,
} from '../src/cli-contract.js';
import { TemplateValidationError } from '../src/errors.js';
import type { Template } from '../src/types.js';

function makeTemplate(): Template {
  return {
    body: 'Body text',
    collection: 'backend',
    filePath: '/tmp/project/.stencil/collections/backend/example.md',
    frontmatter: {
      author: 'alice',
      description: 'Example template',
      name: 'example',
      placeholders: [{ description: 'Entity', name: 'entity', required: true }],
      tags: ['backend'],
      version: 1,
    },
    source: 'project',
  };
}

describe('CLI contract helpers', () => {
  it('serializes template summaries without bodies', () => {
    expect(toCliTemplateSummary(makeTemplate())).toEqual({
      collection: 'backend',
      description: 'Example template',
      filePath: '/tmp/project/.stencil/collections/backend/example.md',
      name: 'example',
      source: 'project',
      tags: ['backend'],
      version: 1,
    });
  });

  it('serializes template details for create and show payloads', () => {
    expect(toCliTemplateDetail(makeTemplate())).toEqual({
      author: 'alice',
      body: 'Body text',
      collection: 'backend',
      description: 'Example template',
      filePath: '/tmp/project/.stencil/collections/backend/example.md',
      name: 'example',
      placeholders: [{ description: 'Entity', name: 'entity', required: true }],
      source: 'project',
      tags: ['backend'],
      version: 1,
    });
  });

  it('builds ok envelopes with empty issues by default', () => {
    expect(createCliOkEnvelope('list', { templates: [] })).toEqual({
      command: 'list',
      data: { templates: [] },
      error: null,
      issues: [],
      status: 'ok',
    });
  });

  it('builds needs_input envelopes for unresolved resolve results', () => {
    expect(
      createCliNeedsInputEnvelope('resolve', {
        inputs: [
          {
            description: 'Owner of the change',
            name: 'owner',
            required: true,
            source: 'unresolved',
            sources: ['frontmatter', 'legacy'],
            value: '',
          },
        ],
        placeholders: [{ name: 'owner', source: 'unresolved', value: '' }],
        resolvedBody: 'Body',
        unresolvedCount: 1,
      }),
    ).toEqual({
      command: 'resolve',
      data: {
        inputs: [
          {
            description: 'Owner of the change',
            name: 'owner',
            required: true,
            source: 'unresolved',
            sources: ['frontmatter', 'legacy'],
            value: '',
          },
        ],
        placeholders: [{ name: 'owner', source: 'unresolved', value: '' }],
        resolvedBody: 'Body',
        unresolvedCount: 1,
      },
      error: null,
      issues: [],
      status: 'needs_input',
    });
  });

  it('builds validation_failed envelopes from template validation errors', () => {
    const error = new TemplateValidationError(
      'Cannot create template',
      'create',
      [{ message: 'Name is required', severity: 'error' }],
      { templateName: 'example' },
    );

    expect(
      createCliValidationFailedEnvelope('create', error, {
        operation: 'create',
        templateName: 'example',
      }),
    ).toEqual({
      command: 'create',
      data: { operation: 'create', templateName: 'example' },
      error: null,
      issues: [{ message: 'Name is required', severity: 'error' }],
      status: 'validation_failed',
    });
  });

  it('builds error envelopes with projected stencil errors', () => {
    const error = new TemplateValidationError(
      'Cannot resolve template',
      'resolve',
      [{ message: 'broken', severity: 'error' }],
      { templateName: 'bad-template' },
    );

    expect(
      createCliErrorEnvelope('resolve', error, {
        operation: 'resolve',
        templateName: 'bad-template',
      }),
    ).toEqual({
      command: 'resolve',
      data: { operation: 'resolve', templateName: 'bad-template' },
      error: {
        code: 'TEMPLATE_VALIDATION_FAILED',
        details: {
          issues: [{ message: 'broken', severity: 'error' }],
          operation: 'resolve',
          templateName: 'bad-template',
        },
        message: 'Cannot resolve template',
      },
      issues: [],
      status: 'error',
    });
  });
});
