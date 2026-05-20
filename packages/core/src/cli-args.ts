import type { StencilCliCommand } from './cli-contract.js';
import type { TemplateFrontmatter } from './types.js';

export const STENCIL_CLI_EXIT_INVALID_USAGE = 64;
export const STENCIL_CLI_EXIT_RUNTIME_FAILURE = 70;

export type ParsedStencilCliCommand =
  | { command: 'create'; payload: CreateStdinPayload }
  | { command: 'delete'; templateName: string }
  | { command: 'detect-context' }
  | { command: 'init' }
  | { command: 'list' }
  | { command: 'resolve'; explicitValues: Record<string, string>; templateName: string }
  | { command: 'show'; templateName: string }
  | { command: 'validate'; templateName: string };

export interface CreateStdinPayload {
  body: string;
  collection?: null | string;
  frontmatter: TemplateFrontmatter;
}

export class CliUsageError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = STENCIL_CLI_EXIT_INVALID_USAGE) {
    super(message);
    this.name = 'CliUsageError';
    this.exitCode = exitCode;
  }
}

export class CliInputError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = STENCIL_CLI_EXIT_RUNTIME_FAILURE) {
    super(message);
    this.name = 'CliInputError';
    this.exitCode = exitCode;
  }
}

export function parseCliArgs(argv: string[], stdinText: string): ParsedStencilCliCommand {
  const [commandToken, ...rest] = argv;

  if (
    commandToken === undefined ||
    commandToken === '--help' ||
    commandToken === '-h' ||
    commandToken === 'help'
  ) {
    throw new CliUsageError(getCliHelpText(), 0);
  }

  switch (commandToken as StencilCliCommand) {
    case 'create':
      return parseCreateArgs(rest, stdinText);
    case 'delete':
    case 'show':
    case 'validate':
      if (commandToken === 'show') {
        return {
          command: 'show',
          templateName: parseSingleTemplateArg(commandToken, rest),
        };
      }

      if (commandToken === 'validate') {
        return {
          command: 'validate',
          templateName: parseSingleTemplateArg(commandToken, rest),
        };
      }

      return {
        command: 'delete',
        templateName: parseSingleTemplateArg(commandToken, rest),
      };
    case 'detect-context':
    case 'init':
    case 'list':
      assertNoExtraArgs(commandToken, rest);
      return { command: commandToken as 'detect-context' | 'init' | 'list' };
    case 'resolve':
      return parseResolveArgs(rest);
    default:
      throw new CliUsageError(`Unknown stencil CLI command: ${commandToken}`);
  }
}

export function getCliHelpText(): string {
  return [
    'Usage:',
    '  stencil-cli init',
    '  stencil-cli list',
    '  stencil-cli show <name>',
    '  stencil-cli validate <name>',
    '  stencil-cli delete <name>',
    '  stencil-cli resolve <name> [key=value ...]',
    '  stencil-cli create --stdin-json',
  ].join('\n');
}

function assertNoExtraArgs(command: string, args: string[]): void {
  if (args.length > 0) {
    throw new CliUsageError(`Command "${command}" does not accept extra arguments.`);
  }
}

function parseSingleTemplateArg(command: string, args: string[]): string {
  if (args.length === 0) {
    throw new CliUsageError(`Missing template name for command "${command}".`);
  }

  if (args.length > 1) {
    throw new CliUsageError(`Command "${command}" accepts only one template name argument.`);
  }

  return args[0] as string;
}

function parseResolveArgs(args: string[]): ParsedStencilCliCommand {
  if (args.length === 0) {
    throw new CliUsageError('Missing template name for command "resolve".');
  }

  const [templateName, ...tokens] = args;
  const explicitValues: Record<string, string> = {};

  for (const token of tokens) {
    const separatorIndex = token.indexOf('=');
    if (separatorIndex <= 0) {
      throw new CliUsageError(`Invalid resolve argument "${token}". Expected key=value.`);
    }

    const key = token.slice(0, separatorIndex);
    const value = token.slice(separatorIndex + 1);
    explicitValues[key] = value;
  }

  return {
    command: 'resolve',
    explicitValues,
    templateName: templateName as string,
  };
}

function parseCreateArgs(args: string[], stdinText: string): ParsedStencilCliCommand {
  if (args.length !== 1 || args[0] !== '--stdin-json') {
    throw new CliUsageError('Command "create" requires exactly one flag: --stdin-json.');
  }

  if (stdinText.trim().length === 0) {
    throw new CliInputError('Create payload is required on stdin when using --stdin-json.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdinText);
  } catch (error) {
    throw new CliInputError(
      `Failed to parse create payload from stdin as JSON: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  return {
    command: 'create',
    payload: parseCreatePayload(parsed),
  };
}

function parseCreatePayload(payload: unknown): CreateStdinPayload {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CliInputError('Create payload must be a JSON object.');
  }

  const record = payload as Record<string, unknown>;
  const { body, collection, frontmatter } = record;

  if (typeof body !== 'string') {
    throw new CliInputError('Create payload must include a string "body" field.');
  }

  if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new CliInputError('Create payload must include an object "frontmatter" field.');
  }

  if (collection !== undefined && collection !== null && typeof collection !== 'string') {
    throw new CliInputError(
      'Create payload field "collection" must be a string, null, or omitted.',
    );
  }

  const result: CreateStdinPayload = {
    body,
    frontmatter: frontmatter as TemplateFrontmatter,
  };

  if (collection !== undefined) {
    result.collection = collection;
  }

  return result;
}
