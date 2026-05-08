import * as vscode from 'vscode';

import type {
  CreateTemplateCollectionChoice,
  CreateTemplateCollectionQuickPickItem,
} from '../types.js';

const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DEFAULT_BODY_SCAFFOLD = 'Write the prompt body here.';

export function normalizeTemplateName(input: string): string {
  return input.trim();
}

export function validateTemplateNameInput(input: string): string | undefined {
  const normalizedName = normalizeTemplateName(input);
  if (normalizedName.length === 0) {
    return 'Template name is required.';
  }

  if (!KEBAB_CASE_RE.test(normalizedName)) {
    return 'Template name must be kebab-case, like "my-template".';
  }

  return undefined;
}

export function normalizeTemplateDescription(input: string): string {
  return input.trim();
}

export function validateTemplateDescriptionInput(input: string): string | undefined {
  if (normalizeTemplateDescription(input).length === 0) {
    return 'Template description is required.';
  }

  return undefined;
}

export function parseTemplateTags(input: string): string[] {
  const normalizedTags: string[] = [];
  const seenTags = new Set<string>();

  for (const rawTag of input.split(',')) {
    const tag = rawTag.trim().toLowerCase();
    if (tag.length === 0 || seenTags.has(tag)) {
      continue;
    }

    seenTags.add(tag);
    normalizedTags.push(tag);
  }

  return normalizedTags;
}

export function buildCreateTemplateCollectionItems(options: {
  collections: string[];
  defaultCollection?: string;
}): CreateTemplateCollectionQuickPickItem[] {
  const items: CreateTemplateCollectionQuickPickItem[] = [
    createCollectionItem(
      {
        kind: 'uncategorized',
      },
      {
        description: 'Save under .stencil/templates/',
        detail: 'Creates a root template outside any collection.',
        label: 'Uncategorized',
      },
    ),
  ];

  if (
    options.defaultCollection !== undefined &&
    !options.collections.includes(options.defaultCollection)
  ) {
    items.push(
      createCollectionItem(
        {
          collectionName: options.defaultCollection,
          kind: 'default',
        },
        {
          description: options.defaultCollection,
          detail: 'Uses the workspace default collection from .stencil/config.yaml.',
          label: 'Workspace Default',
        },
      ),
    );
  }

  for (const collectionName of options.collections) {
    items.push(
      createCollectionItem(
        {
          collectionName,
          kind: 'collection',
        },
        {
          description: 'Collection',
          detail: `Save under .stencil/collections/${collectionName}/.`,
          label: collectionName,
        },
      ),
    );
  }

  return items;
}

export function buildCreateTemplateBodyScaffold(seedInput: string | undefined): string {
  const normalizedSeed = seedInput?.trim();
  if (normalizedSeed && normalizedSeed.length > 0) {
    return normalizedSeed;
  }

  return DEFAULT_BODY_SCAFFOLD;
}

export function toCreateTemplateCollectionValue(
  choice: CreateTemplateCollectionChoice,
): null | string | undefined {
  if (choice.kind === 'uncategorized') {
    return null;
  }

  if (choice.kind === 'default') {
    return undefined;
  }

  return choice.collectionName;
}

function createCollectionItem(
  choice: CreateTemplateCollectionChoice,
  item: Omit<CreateTemplateCollectionQuickPickItem, 'choice'>,
): CreateTemplateCollectionQuickPickItem {
  return {
    ...item,
    choice,
  };
}

export function isCreateTemplateCollectionQuickPickItem(
  item: CreateTemplateCollectionQuickPickItem | undefined,
): item is CreateTemplateCollectionQuickPickItem {
  return item !== undefined && item.kind !== vscode.QuickPickItemKind.Separator;
}
