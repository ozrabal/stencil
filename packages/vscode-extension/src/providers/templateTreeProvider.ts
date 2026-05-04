import * as vscode from 'vscode';

import type { TemplateTreeItemMetadata } from '../types.js';

import { hasStencilWorkspaceSetup, resolveWorkspace } from '../services/workspace.js';

export const STENCIL_TEMPLATES_VIEW_ID = 'stencilTemplates';

export class TemplateTreeProvider implements vscode.TreeDataProvider<StencilTreeItem> {
  getTreeItem(element: StencilTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: StencilTreeItem): Promise<StencilTreeItem[]> {
    if (element) {
      return [];
    }

    const workspace = resolveWorkspace();
    if (workspace.kind === 'missing-workspace') {
      return [createPlaceholderItem('Open a workspace folder to browse Stencil templates.')];
    }

    if (!(await hasStencilWorkspaceSetup(workspace.rootPath))) {
      return [createPlaceholderItem('Add a .stencil/ directory to enable template browsing.')];
    }

    return [createPlaceholderItem('Template browsing will arrive in a later Epic 1 step.')];
  }
}

class StencilTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    readonly metadata: TemplateTreeItemMetadata,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (metadata.description !== undefined) {
      this.description = metadata.description;
    }
  }
}

function createPlaceholderItem(label: string): StencilTreeItem {
  return new StencilTreeItem(label, { kind: 'empty-state' });
}
