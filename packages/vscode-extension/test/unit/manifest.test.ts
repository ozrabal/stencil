import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const packageJsonPath = path.resolve(import.meta.dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
  activationEvents?: string[];
  contributes?: {
    commands?: Array<Record<string, unknown>>;
    configuration?: Record<string, unknown>;
    configurationDefaults?: Record<string, Record<string, unknown>>;
    grammars?: Array<Record<string, unknown>>;
    languages?: Array<Record<string, unknown>>;
    menus?: Record<string, Array<Record<string, unknown>>>;
    views?: Record<string, Array<Record<string, unknown>>>;
  };
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
};

describe('package contributions', () => {
  it('targets the Copilot chat-mode compatible VS Code baseline', () => {
    expect(packageJson).toMatchObject({
      devDependencies: {
        '@types/vscode': '^1.100.0',
      },
      engines: {
        vscode: '^1.100.0',
      },
    });
  });

  it('contributes the supported run-template command surface', () => {
    expect(packageJson.activationEvents).toEqual([
      'onCommand:stencil.openTemplate',
      'onCommand:stencil.runTemplate',
      'onCommand:stencil.runTemplateWithMode',
      'onCommand:stencil.runTemplateInEditor',
      'onCommand:stencil.runTemplateInCopilotChat',
      'onCommand:stencil.runTemplateInCopilotChatSend',
      'onCommand:stencil.runTemplateWithLanguageModel',
      'onCommand:stencil.runTemplateWithLanguageModelSelectModel',
      'onCommand:stencil.runTemplateInCopilotChatWithMode',
      'onCommand:stencil.createTemplate',
      'onCommand:stencil.listTemplates',
      'onCommand:stencil.refreshTemplatesView',
      'onView:stencilTemplates',
      'workspaceContains:**/.stencil/**/*.md',
    ]);

    expect(packageJson.contributes?.commands).toEqual([
      { command: 'stencil.openTemplate', title: 'Stencil: Open Template' },
      { command: 'stencil.runTemplate', title: 'Stencil: Run Template' },
      {
        command: 'stencil.runTemplateWithMode',
        title: 'Stencil: Run Template With Mode...',
      },
      {
        command: 'stencil.runTemplateInEditor',
        title: 'Stencil: Run Template in Editor',
      },
      {
        command: 'stencil.runTemplateInCopilotChat',
        title: 'Stencil: Run Template in Copilot Chat',
      },
      {
        command: 'stencil.runTemplateInCopilotChatSend',
        title: 'Stencil: Run Template in Copilot Chat (Send)',
      },
      {
        command: 'stencil.runTemplateWithLanguageModel',
        title: 'Stencil: Run Template with Language Model',
      },
      {
        command: 'stencil.runTemplateWithLanguageModelSelectModel',
        title: 'Stencil: Run Template with Language Model (Select Model)',
      },
      {
        command: 'stencil.runTemplateInCopilotChatWithMode',
        title: 'Stencil: Run Template in Copilot Chat (Select Mode)',
      },
      { command: 'stencil.createTemplate', title: 'Stencil: Create Template' },
      { command: 'stencil.listTemplates', title: 'Stencil: List Templates' },
      {
        command: 'stencil.refreshTemplatesView',
        icon: '$(refresh)',
        title: 'Stencil: Refresh Templates View',
      },
    ]);
    expect(packageJson.contributes?.views?.explorer).toEqual([
      { id: 'stencilTemplates', name: 'Stencil Templates' },
    ]);
    expect(packageJson.contributes?.menus).toMatchObject({
      'view/item/context': [
        {
          command: 'stencil.runTemplate',
          group: 'inline',
          when: 'view == stencilTemplates && viewItem == stencil.template',
        },
        {
          command: 'stencil.openTemplate',
          group: 'navigation',
          when: 'view == stencilTemplates && viewItem == stencil.template',
        },
        {
          command: 'stencil.runTemplateWithMode',
          group: 'navigation',
          when: 'view == stencilTemplates && viewItem == stencil.template',
        },
        {
          command: 'stencil.runTemplateInEditor',
          group: 'navigation',
          when: 'view == stencilTemplates && viewItem == stencil.template',
        },
        {
          command: 'stencil.runTemplateInCopilotChat',
          group: 'navigation',
          when: 'view == stencilTemplates && viewItem == stencil.template',
        },
        {
          command: 'stencil.runTemplateInCopilotChatSend',
          group: 'navigation',
          when: 'view == stencilTemplates && viewItem == stencil.template',
        },
        {
          command: 'stencil.runTemplateWithLanguageModel',
          group: 'navigation',
          when: 'view == stencilTemplates && viewItem == stencil.template',
        },
      ],
      'view/title': [
        {
          command: 'stencil.refreshTemplatesView',
          group: 'navigation',
          when: 'view == stencilTemplates',
        },
      ],
    });
  });

  it('contributes run configuration settings for default target and selection behavior', () => {
    expect(packageJson.contributes?.configuration).toMatchObject({
      properties: {
        'stencil.run.defaultChatMode': {
          default: 'ask',
          enum: ['ask', 'edit', 'agent'],
          type: 'string',
        },
        'stencil.run.defaultMode': {
          default: 'default',
          enum: ['default', 'insert', 'send', 'execute'],
          type: 'string',
        },
        'stencil.run.defaultTarget': {
          default: 'copilot-chat',
          enum: ['editor', 'copilot-chat', 'lm-api'],
          type: 'string',
        },
        'stencil.run.lastUsedScope': {
          default: 'session',
          enum: ['session', 'workspace', 'global'],
          type: 'string',
        },
        'stencil.run.selectionBehavior': {
          default: 'defaults',
          enum: ['defaults', 'picker', 'last-used'],
          type: 'string',
        },
      },
      title: 'Stencil',
    });
  });

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

  it('does not advertise unsupported extra surfaces', () => {
    const commandIds =
      packageJson.contributes?.commands?.map((command) => command.command).sort() ?? [];
    expect(commandIds).not.toContain('stencil.previewTemplate');
    expect(commandIds).not.toContain('stencil.deleteTemplate');
    expect(commandIds).not.toContain('stencil.init');
  });
});
