import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../src/parser.js';

describe('parseTemplate', () => {
  it('should return a Template object', () => {
    const result = parseTemplate('/fake/path.md', 'body content');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('frontmatter');
    expect(result).toHaveProperty('body');
  });
});
