import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, YAMLParseError } from 'yaml';

import type { StencilConfig } from './types.js';

const DEFAULT_STENCIL_CONFIG: StencilConfig = {
  placeholderEnd: '}}',
  placeholderStart: '{{',
  version: 1,
};

type RawConfig = Record<string, unknown>;

export class StencilConfigError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'StencilConfigError';
  }
}

export async function loadStencilConfig(
  projectStencilDir: string,
  globalDir?: string,
  runtimeOverrides?: Partial<StencilConfig>,
): Promise<StencilConfig> {
  const globalConfig = globalDir
    ? await readConfigFile(path.join(globalDir, 'config.yaml'))
    : undefined;
  const projectConfig = await readConfigFile(path.join(projectStencilDir, 'config.yaml'));

  return mergeStencilConfig(DEFAULT_STENCIL_CONFIG, globalConfig, projectConfig, runtimeOverrides);
}

export function mergeStencilConfig(
  ...configs: Array<Partial<StencilConfig> | undefined>
): StencilConfig {
  const merged = configs.reduce<StencilConfig>(
    (current, config) => {
      if (!config) return current;

      const next: StencilConfig = {
        ...current,
        ...config,
      };

      if (current.customContext || config.customContext) {
        next.customContext = {
          ...(current.customContext ?? {}),
          ...(config.customContext ?? {}),
        };
      }

      if (next.defaultCollection === undefined) {
        delete next.defaultCollection;
      }

      if (next.customContext && Object.keys(next.customContext).length === 0) {
        delete next.customContext;
      }

      return next;
    },
    { ...DEFAULT_STENCIL_CONFIG },
  );

  return merged;
}

async function readConfigFile(filePath: string): Promise<Partial<StencilConfig> | undefined> {
  let rawFile: string;
  try {
    rawFile = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }

  const parsed = parseConfigYaml(filePath, rawFile);
  return normalizeRawConfig(filePath, parsed);
}

function parseConfigYaml(filePath: string, rawFile: string): RawConfig {
  let parsed: unknown;
  try {
    parsed = parseYaml(rawFile);
  } catch (error) {
    if (error instanceof YAMLParseError) {
      throw new StencilConfigError(
        `Invalid YAML in config file "${filePath}": ${error.message}`,
        filePath,
      );
    }

    throw new StencilConfigError(`Failed to parse config file "${filePath}"`, filePath);
  }

  if (parsed === null) {
    return {};
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StencilConfigError(`Config file "${filePath}" must contain a YAML mapping`, filePath);
  }

  return parsed as RawConfig;
}

function normalizeRawConfig(filePath: string, raw: RawConfig): Partial<StencilConfig> {
  const normalized: Partial<StencilConfig> = {};

  if ('version' in raw) {
    if (typeof raw.version !== 'number') {
      throw invalidConfigField(filePath, 'version', 'must be a number');
    }
    normalized.version = raw.version;
  }

  if ('default_collection' in raw) {
    if (raw.default_collection !== null && typeof raw.default_collection !== 'string') {
      throw invalidConfigField(filePath, 'default_collection', 'must be a string or null');
    }

    if (typeof raw.default_collection === 'string') {
      normalized.defaultCollection = raw.default_collection;
    }
  }

  if ('custom_context' in raw) {
    const customContext = normalizeCustomContext(filePath, raw.custom_context);
    if (customContext !== undefined) {
      normalized.customContext = customContext;
    }
  }

  if ('placeholder_start' in raw) {
    if (typeof raw.placeholder_start !== 'string') {
      throw invalidConfigField(filePath, 'placeholder_start', 'must be a string');
    }
    normalized.placeholderStart = raw.placeholder_start;
  }

  if ('placeholder_end' in raw) {
    if (typeof raw.placeholder_end !== 'string') {
      throw invalidConfigField(filePath, 'placeholder_end', 'must be a string');
    }
    normalized.placeholderEnd = raw.placeholder_end;
  }

  return normalized;
}

function normalizeCustomContext(
  filePath: string,
  value: unknown,
): Record<string, string> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidConfigField(filePath, 'custom_context', 'must be a mapping of string values');
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const normalized: Record<string, string> = {};

  for (const [key, entryValue] of entries) {
    if (typeof entryValue !== 'string') {
      throw invalidConfigField(filePath, `custom_context.${key}`, 'must be a string');
    }

    normalized[key] = entryValue;
  }

  return normalized;
}

function invalidConfigField(filePath: string, field: string, message: string): StencilConfigError {
  return new StencilConfigError(
    `Invalid config field "${field}" in "${filePath}": ${message}`,
    filePath,
    field,
  );
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
