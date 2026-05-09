import * as vscode from 'vscode';

import type { Template } from '../core/index.js';
import type { TemplateTreeItemMetadata } from '../types.js';

import { OPEN_TEMPLATE_COMMAND_ID } from '../commands/openTemplate.js';
import { getStencil } from '../services/getStencil.js';
import { ROOT_TEMPLATES_GROUP_LABEL } from '../services/templateQuickPick.js';
import { hasStencilWorkspaceSetup, resolveWorkspace } from '../services/workspace.js';

export const STENCIL_TEMPLATES_VIEW_ID = 'stencilTemplates';
export const REFRESH_TEMPLATES_VIEW_COMMAND_ID = 'stencil.refreshTemplatesView';

export class TemplateTreeProvider implements vscode.TreeDataProvider<StencilTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    null | StencilTreeItem | undefined | void
  >();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: StencilTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: StencilTreeItem): Promise<StencilTreeItem[]> {
    if (element) {
      if (element.metadata.kind === 'collection' || element.metadata.kind === 'group') {
        return element.metadata.childTemplates.map((template) => createTemplateItem(template));
      }

      return [];
    }

    const workspace = resolveWorkspace();
    if (workspace.kind === 'missing-workspace') {
      return [createPlaceholderItem('Open a workspace folder to browse Stencil templates.')];
    }

    if (!(await hasStencilWorkspaceSetup(workspace.rootPath))) {
      return [createPlaceholderItem('Add a .stencil/ directory to enable template browsing.')];
    }

    try {
      const stencil = getStencil(workspace);
      const [templates, collectionNames] = await Promise.all([
        stencil.list(),
        stencil.collections.listCollections(),
      ]);

      return buildRootItems(templates, collectionNames);
    } catch (error) {
      return [
        createPlaceholderItem(
          'Could not load Stencil templates.',
          error instanceof Error ? error.message : undefined,
        ),
      ];
    }
  }
}

export function registerRefreshTemplatesViewCommand(templateTreeProvider: {
  refresh(): void;
}): vscode.Disposable {
  return vscode.commands.registerCommand(REFRESH_TEMPLATES_VIEW_COMMAND_ID, () => {
    templateTreeProvider.refresh();
  });
}

class StencilTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    readonly metadata: TemplateTreeItemMetadata,
  ) {
    super(label, getCollapsibleState(metadata));
    this.contextValue = getContextValue(metadata);

    const description = getItemDescription(metadata);
    if (description !== undefined) {
      this.description = description;
    }

    const tooltip = getTooltip(label, metadata);
    if (tooltip !== undefined) {
      this.tooltip = tooltip;
    }

    if (metadata.kind === 'template') {
      this.command = {
        arguments: [metadata],
        command: OPEN_TEMPLATE_COMMAND_ID,
        title: 'Open Template',
      };
    }
  }
}

function createPlaceholderItem(label: string, description?: string): StencilTreeItem {
  return new StencilTreeItem(label, {
    ...(description !== undefined ? { description } : {}),
    kind: 'empty-state',
  });
}

function createCollectionItem(collectionName: string, childTemplates: Template[]): StencilTreeItem {
  return new StencilTreeItem(collectionName, {
    childTemplates,
    collectionName,
    kind: 'collection',
  });
}

function createGroupItem(groupName: string, childTemplates: Template[]): StencilTreeItem {
  return new StencilTreeItem(groupName, {
    childTemplates,
    groupName,
    kind: 'group',
  });
}

function createTemplateItem(template: Template): StencilTreeItem {
  return new StencilTreeItem(template.frontmatter.name, {
    ...(template.collection !== undefined ? { collectionName: template.collection } : {}),
    description: template.frontmatter.description,
    kind: 'template',
    source: template.source,
    templateFilePath: template.filePath,
    templateName: template.frontmatter.name,
  });
}

function buildRootItems(templates: Template[], collectionNames: string[]): StencilTreeItem[] {
  const items: StencilTreeItem[] = [];

  const uncategorizedTemplates = templates.filter((template) => template.collection === undefined);
  if (uncategorizedTemplates.length > 0) {
    items.push(createGroupItem(ROOT_TEMPLATES_GROUP_LABEL, uncategorizedTemplates));
  }

  const collectionNamesFromTemplates = templates.flatMap((template) =>
    template.collection === undefined ? [] : [template.collection],
  );
  const visibleCollectionNames = [
    ...new Set([...collectionNames, ...collectionNamesFromTemplates]),
  ].sort();

  for (const collectionName of visibleCollectionNames) {
    items.push(
      createCollectionItem(
        collectionName,
        templates.filter((template) => template.collection === collectionName),
      ),
    );
  }

  if (items.length === 0) {
    return [createPlaceholderItem('No Stencil templates were found in this workspace.')];
  }

  return items;
}

function getCollapsibleState(metadata: TemplateTreeItemMetadata): vscode.TreeItemCollapsibleState {
  if (metadata.kind === 'collection' || metadata.kind === 'group') {
    return vscode.TreeItemCollapsibleState.Collapsed;
  }

  return vscode.TreeItemCollapsibleState.None;
}

function getContextValue(metadata: TemplateTreeItemMetadata): string {
  switch (metadata.kind) {
    case 'collection':
      return 'stencil.collection';
    case 'empty-state':
      return 'stencil.empty-state';
    case 'group':
      return 'stencil.group';
    case 'template':
      return 'stencil.template';
  }
}

function getItemDescription(metadata: TemplateTreeItemMetadata): string | undefined {
  if (metadata.kind === 'template') {
    return metadata.source;
  }

  if (metadata.kind === 'empty-state') {
    return metadata.description;
  }

  return undefined;
}

function getTooltip(label: string, metadata: TemplateTreeItemMetadata): string | undefined {
  switch (metadata.kind) {
    case 'collection':
      return metadata.childTemplates.length === 0
        ? `Collection "${label}" is empty.`
        : `Collection "${label}" contains ${metadata.childTemplates.length} template${metadata.childTemplates.length === 1 ? '' : 's'}.`;
    case 'empty-state':
      return metadata.description;
    case 'group':
      return `Uncategorized templates (${metadata.childTemplates.length}).`;
    case 'template':
      return `${metadata.templateName}\n${metadata.description}\n${metadata.templateFilePath}`;
  }
}
