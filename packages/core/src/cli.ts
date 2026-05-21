#!/usr/bin/env node

import { CliInputError, CliUsageError, parseCliArgs } from './cli-args.js';
import { runParsedCliCommand } from './cli-runner.js';
import { Stencil } from './stencil.js';

async function main(): Promise<number> {
  try {
    const stdinText = await readStdin();
    const parsed = parseCliArgs(process.argv.slice(2), stdinText);
    const stencilOptions: ConstructorParameters<typeof Stencil>[0] = {
      projectDir: process.cwd(),
    };

    if ('projectOnly' in parsed && parsed.projectOnly) {
      stencilOptions.globalDir = null;
    }

    const stencil = new Stencil(stencilOptions);
    const result = await runParsedCliCommand(parsed, stencil);

    if (result.stdout.length > 0) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr.length > 0) {
      process.stderr.write(result.stderr);
    }

    return result.exitCode;
  } catch (error) {
    if (error instanceof CliUsageError || error instanceof CliInputError) {
      const output = error.exitCode === 0 ? process.stdout : process.stderr;
      output.write(`${error.message}\n`);
      return error.exitCode;
    }

    throw error;
  }
}

void main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unexpected CLI failure'}\n`);
    process.exitCode = 70;
  });

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}
