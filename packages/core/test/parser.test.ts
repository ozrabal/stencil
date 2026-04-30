import { describe, expect, it } from 'vitest';
import { StencilError, StencilErrorCode } from '../src/errors.js';
import { ParseError, parseTemplate, TemplateNotFoundError } from '../src/parser.js';

function makeRaw(frontmatter: string, body = ''): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

const MINIMAL_FRONTMATTER = 'name: my-template\ndescription: A test template\nversion: 1';

describe('parseTemplate', () => {
  describe('happy path', () => {
    it('returns a typed template for a minimal valid template', () => {
      const result = parseTemplate(
        '/project/.stencil/templates/my-template.md',
        makeRaw(MINIMAL_FRONTMATTER, 'Hello world'),
      );

      expect(result.filePath).toBe('/project/.stencil/templates/my-template.md');
      expect(result.source).toBe('project');
      expect(result.collection).toBeUndefined();
      expect(result.frontmatter.name).toBe('my-template');
      expect(result.frontmatter.description).toBe('A test template');
      expect(result.frontmatter.version).toBe(1);
      expect(result.body).toBe('Hello world');
    });

    it('parses optional frontmatter fields', () => {
      const frontmatter = [
        'name: full-template',
        'description: Full featured template',
        'version: 3',
        'author: piotr',
        'tags: [backend, rest]',
      ].join('\n');

      const result = parseTemplate('/fake/full-template.md', makeRaw(frontmatter, 'body'));

      expect(result.frontmatter.author).toBe('piotr');
      expect(result.frontmatter.tags).toEqual(['backend', 'rest']);
      expect(result.frontmatter.version).toBe(3);
    });

    it('passes the source parameter through', () => {
      const result = parseTemplate('/fake/t.md', makeRaw(MINIMAL_FRONTMATTER), 'global');

      expect(result.source).toBe('global');
    });

    it('defaults source to project', () => {
      const result = parseTemplate('/fake/t.md', makeRaw(MINIMAL_FRONTMATTER));

      expect(result.source).toBe('project');
    });

    it('trims the body', () => {
      const result = parseTemplate('/fake/t.md', makeRaw(MINIMAL_FRONTMATTER, '\n\n  Hello  \n\n'));

      expect(result.body).toBe('Hello');
    });

    it('returns an empty body when there is no content after the closing delimiter', () => {
      const result = parseTemplate('/fake/t.md', `---\n${MINIMAL_FRONTMATTER}\n---`);

      expect(result.body).toBe('');
    });
  });

  describe('placeholder defaults', () => {
    it('defaults placeholder.required to true when omitted', () => {
      const frontmatter = [
        ...MINIMAL_FRONTMATTER.split('\n'),
        'placeholders:',
        '  - name: entity_name',
        '    description: The entity name',
      ].join('\n');

      const result = parseTemplate('/fake/t.md', makeRaw(frontmatter));

      expect(result.frontmatter.placeholders?.[0]?.required).toBe(true);
    });

    it('preserves placeholder.required when explicitly false', () => {
      const frontmatter = [
        ...MINIMAL_FRONTMATTER.split('\n'),
        'placeholders:',
        '  - name: auth_required',
        '    description: Whether auth is needed',
        '    required: false',
      ].join('\n');

      const result = parseTemplate('/fake/t.md', makeRaw(frontmatter));

      expect(result.frontmatter.placeholders?.[0]?.required).toBe(false);
    });

    it('parses placeholder default values', () => {
      const frontmatter = [
        ...MINIMAL_FRONTMATTER.split('\n'),
        'placeholders:',
        '  - name: operations',
        '    description: CRUD operations',
        '    required: true',
        "    default: 'create, read'",
      ].join('\n');

      const result = parseTemplate('/fake/t.md', makeRaw(frontmatter));

      expect(result.frontmatter.placeholders?.[0]?.default).toBe('create, read');
    });

    it('parses multiple placeholders', () => {
      const frontmatter = [
        ...MINIMAL_FRONTMATTER.split('\n'),
        'placeholders:',
        '  - name: entity_name',
        '    description: Entity name',
        '  - name: operations',
        '    description: Operations',
        '    required: false',
        "    default: 'create'",
      ].join('\n');

      const result = parseTemplate('/fake/t.md', makeRaw(frontmatter));

      expect(result.frontmatter.placeholders).toHaveLength(2);
      expect(result.frontmatter.placeholders?.[0]?.required).toBe(true);
      expect(result.frontmatter.placeholders?.[1]?.required).toBe(false);
      expect(result.frontmatter.placeholders?.[1]?.default).toBe('create');
    });
  });

  describe('collection detection', () => {
    it('detects collection names from /collections/<name>/', () => {
      const result = parseTemplate(
        '/project/.stencil/collections/backend/create-rest-endpoint.md',
        makeRaw(MINIMAL_FRONTMATTER),
      );

      expect(result.collection).toBe('backend');
    });

    it('detects collection names with nested subdirectories', () => {
      const result = parseTemplate(
        '/home/user/.stencil/collections/review/security-review.md',
        makeRaw(MINIMAL_FRONTMATTER),
      );

      expect(result.collection).toBe('review');
    });

    it('returns undefined when the path is not in collections', () => {
      const result = parseTemplate(
        '/project/.stencil/templates/quick-fix.md',
        makeRaw(MINIMAL_FRONTMATTER),
      );

      expect(result.collection).toBeUndefined();
    });

    it('supports windows path separators', () => {
      const result = parseTemplate(
        'C:\\project\\.stencil\\collections\\backend\\create-rest-endpoint.md',
        makeRaw(MINIMAL_FRONTMATTER),
      );

      expect(result.collection).toBe('backend');
    });
  });

  describe('missing delimiter errors', () => {
    it('throws when the file does not start with the frontmatter delimiter', () => {
      expect(() => parseTemplate('/fake/t.md', 'No frontmatter here')).toThrow(ParseError);
    });

    it('includes a descriptive missing frontmatter message', () => {
      expect(() => parseTemplate('/fake/t.md', 'name: foo\n---\nbody')).toThrow(
        /Missing frontmatter/,
      );
    });

    it('stores line 1 when the opening delimiter is missing', () => {
      expect.assertions(4);

      try {
        parseTemplate('/fake/t.md', 'no delimiter');
      } catch (error) {
        expect(error).toBeInstanceOf(StencilError);
        expect(error).toBeInstanceOf(ParseError);
        expect((error as ParseError).code).toBe(StencilErrorCode.FRONTMATTER_MISSING);
        expect((error as ParseError).line).toBe(1);
      }
    });

    it('throws when the closing delimiter is missing', () => {
      expect(() => parseTemplate('/fake/t.md', '---\nname: foo')).toThrow(ParseError);
    });

    it('includes a descriptive closing delimiter message', () => {
      expect(() => parseTemplate('/fake/t.md', '---\nname: foo')).toThrow(/closing ---/);
    });
  });

  describe('malformed YAML errors', () => {
    it('throws for invalid YAML indentation', () => {
      const raw = '---\nname: foo\n  bad: indentation: here\n---\nbody';

      expect(() => parseTemplate('/fake/t.md', raw)).toThrow(ParseError);
    });

    it('mentions YAML in syntax errors', () => {
      const raw = '---\nname: [unclosed\n---\nbody';

      expect(() => parseTemplate('/fake/t.md', raw)).toThrow(/YAML/i);
    });

    it('rejects YAML lists as frontmatter', () => {
      const raw = '---\n- item1\n- item2\n---\nbody';

      expect(() => parseTemplate('/fake/t.md', raw)).toThrow(ParseError);
    });

    it('exposes the YAML line number when available', () => {
      expect.assertions(4);

      try {
        parseTemplate('/fake/t.md', '---\nname: ok\n  bad: indentation: here\n---\nbody');
      } catch (error) {
        expect(error).toBeInstanceOf(StencilError);
        expect(error).toBeInstanceOf(ParseError);
        expect((error as ParseError).code).toBe(StencilErrorCode.FRONTMATTER_INVALID_YAML);
        expect((error as ParseError).line).toBeDefined();
      }
    });
  });

  describe('error classes', () => {
    it('TemplateNotFoundError is a StencilError with file path context', () => {
      const error = new TemplateNotFoundError('/some/path.md');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(StencilError);
      expect(error.code).toBe(StencilErrorCode.TEMPLATE_NOT_FOUND);
      expect(error.filePath).toBe('/some/path.md');
      expect(error.name).toBe('TemplateNotFoundError');
      expect(error.message).toContain('/some/path.md');
    });

    it('ParseError is a StencilError with an optional line number', () => {
      const withLine = new ParseError('bad yaml', StencilErrorCode.FRONTMATTER_INVALID_YAML, 5, {
        filePath: '/some/path.md',
      });
      const withoutLine = new ParseError('bad yaml', StencilErrorCode.FRONTMATTER_SCHEMA_ERROR);

      expect(withLine).toBeInstanceOf(Error);
      expect(withLine).toBeInstanceOf(StencilError);
      expect(withLine.name).toBe('ParseError');
      expect(withLine.code).toBe(StencilErrorCode.FRONTMATTER_INVALID_YAML);
      expect(withLine.filePath).toBe('/some/path.md');
      expect(withLine.line).toBe(5);
      expect(withoutLine.code).toBe(StencilErrorCode.FRONTMATTER_SCHEMA_ERROR);
      expect(withoutLine.line).toBeUndefined();
    });
  });
});
