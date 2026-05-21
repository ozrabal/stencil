import { access, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { StencilBootstrapResult, Template } from './types.js';

import { LocalStorageProvider } from './storage.js';

export const BOOTSTRAP_SAMPLE_TEMPLATE_NAME = 'quick-fix';

export async function bootstrapProjectStencil(
  projectDir: string,
  stencilDir: string,
  storage: LocalStorageProvider,
): Promise<StencilBootstrapResult> {
  const templatesDir = path.join(stencilDir, 'templates');
  const sampleTemplatePath = path.join(templatesDir, `${BOOTSTRAP_SAMPLE_TEMPLATE_NAME}.md`);
  const alreadyExisted = await pathExists(templatesDir);
  const createdPaths: string[] = [];

  await ensureDirectory(stencilDir, createdPaths);
  await ensureDirectory(templatesDir, createdPaths);

  const sampleTemplateCreated =
    !(await pathExists(sampleTemplatePath)) && !(await hasAnyProjectTemplateFile(stencilDir));

  if (sampleTemplateCreated) {
    await storage.saveTemplate(createBootstrapSampleTemplate());
    createdPaths.push(sampleTemplatePath);
  }

  const result: StencilBootstrapResult = {
    alreadyExisted,
    createdPaths,
    projectDir,
    sampleTemplateCreated,
    stencilDir,
  };

  if (sampleTemplateCreated) {
    result.sampleTemplateName = BOOTSTRAP_SAMPLE_TEMPLATE_NAME;
    result.sampleTemplatePath = sampleTemplatePath;
  }

  return result;
}

export function createBootstrapSampleTemplate(): Template {
  return {
    body: [
      'Review the change in {{input:file_path}} and propose the smallest safe fix.',
      '',
      'Problem summary: {{input:issue_summary}}.',
      'Constraints: {{input:constraints:Preserve current behavior, keep the patch minimal, and call out tests that should run.}}',
      '',
      'Use project context when it helps:',
      '- Project: {{$ctx.project_name}}',
      '- Branch: {{$ctx.current_branch}}',
      '',
      'Respond with:',
      '1. Root cause',
      '2. Minimal patch plan',
      '3. Risks or follow-up checks',
    ].join('\n'),
    filePath: '',
    frontmatter: {
      description: 'Inspect a focused code issue and propose a minimal safe fix.',
      name: BOOTSTRAP_SAMPLE_TEMPLATE_NAME,
      placeholders: [
        {
          description: 'Relative path or file being inspected',
          name: 'file_path',
          required: true,
        },
        {
          description: 'Short summary of the bug, regression, or task',
          name: 'issue_summary',
          required: true,
        },
        {
          default:
            'Preserve current behavior, keep the patch minimal, and call out tests that should run.',
          description: 'Non-negotiable constraints for the fix',
          name: 'constraints',
          required: false,
        },
      ],
      tags: ['bootstrap', 'review'],
      version: 1,
    },
    source: 'project',
  };
}

async function ensureDirectory(dirPath: string, createdPaths: string[]): Promise<void> {
  if (await pathExists(dirPath)) {
    return;
  }

  await mkdir(dirPath, { recursive: true });
  createdPaths.push(dirPath);
}

async function hasAnyProjectTemplateFile(stencilDir: string): Promise<boolean> {
  if (await directoryHasMarkdownFiles(path.join(stencilDir, 'templates'))) {
    return true;
  }

  const collectionsDir = path.join(stencilDir, 'collections');
  const collectionEntries = await readDirectory(collectionsDir);

  for (const entry of collectionEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (await directoryHasMarkdownFiles(path.join(collectionsDir, entry.name))) {
      return true;
    }
  }

  return false;
}

async function directoryHasMarkdownFiles(dirPath: string): Promise<boolean> {
  const entries = await readDirectory(dirPath);
  return entries.some((entry) => entry.isFile() && entry.name.endsWith('.md'));
}

async function readDirectory(dirPath: string) {
  try {
    return await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}
