import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const packageJsonPath = path.resolve(import.meta.dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
  contributes?: {
    configurationDefaults?: Record<string, Record<string, unknown>>;
    grammars?: Array<Record<string, unknown>>;
    languages?: Array<Record<string, unknown>>;
  };
};

describe('package contributions', () => {
  it('contributes a stencil-template language scoped to .stencil markdown files', () => {
    const stencilTemplateLanguage = packageJson.contributes?.languages?.find(
      (language) => language.id === 'stencil-template',
    );

    expect(stencilTemplateLanguage).toMatchObject({
      aliases: ['Stencil Template', 'stencil-template'],
      configuration: './language-configuration.json',
      filenamePatterns: ['**/.stencil/**/*.md'],
      id: 'stencil-template',
    });
  });

  it('contributes the bundled TextMate grammar for stencil templates', () => {
    const stencilTemplateGrammar = packageJson.contributes?.grammars?.find(
      (grammar) => grammar.language === 'stencil-template',
    );

    expect(stencilTemplateGrammar).toMatchObject({
      language: 'stencil-template',
      path: './syntaxes/stencil-template.tmLanguage.json',
      scopeName: 'text.html.markdown.stencil',
    });
    expect(packageJson.contributes?.configurationDefaults?.['[stencil-template]']).toMatchObject({
      'diffEditor.ignoreTrimWhitespace': false,
      'editor.unicodeHighlight.ambiguousCharacters': false,
      'editor.unicodeHighlight.invisibleCharacters': false,
    });
  });
});
