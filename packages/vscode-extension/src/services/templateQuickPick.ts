import * as vscode from 'vscode';

import type { Template } from '../core/index.js';
import type {
  TemplateQuickPickItem,
  TemplateQuickPickSeparator,
  TemplateQuickPickTemplateItem,
} from '../types.js';

const ROOT_TEMPLATES_GROUP_LABEL = 'Templates';

export function buildTemplateQuickPickItems(templates: Template[]): TemplateQuickPickItem[] {
  const items: TemplateQuickPickItem[] = [];
  let currentGroupLabel: string | undefined;

  for (const template of templates) {
    const groupLabel = template.collection ?? ROOT_TEMPLATES_GROUP_LABEL;

    if (groupLabel !== currentGroupLabel) {
      items.push(createSeparator(groupLabel));
      currentGroupLabel = groupLabel;
    }

    items.push(createTemplateItem(template));
  }

  return items;
}

export function isTemplateQuickPickTemplateItem(
  item: TemplateQuickPickItem | undefined,
): item is TemplateQuickPickTemplateItem {
  return item !== undefined && 'template' in item;
}

function createSeparator(label: string): TemplateQuickPickSeparator {
  return {
    kind: vscode.QuickPickItemKind.Separator,
    label,
  };
}

function createTemplateItem(template: Template): TemplateQuickPickTemplateItem {
  return {
    description: template.source,
    detail: template.frontmatter.description,
    label: template.frontmatter.name,
    template,
  };
}
