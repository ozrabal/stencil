import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const fixturePath = path.join(__dirname, 'fixtures', 'routing-contract.json');
const contract = JSON.parse(readFileSync(fixturePath, 'utf8'));

const manifestPath = path.join(packageRoot, '.claude-plugin', 'plugin.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const readmePath = path.join(packageRoot, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const routerSkillPath = path.join(packageRoot, 'skills', 'stencil', 'SKILL.md');
const routerSkill = readFileSync(routerSkillPath, 'utf8');
const runSkillPath = path.join(packageRoot, 'skills', 'stencil-run', 'SKILL.md');
const runSkill = readFileSync(runSkillPath, 'utf8');
const commandScriptPath = path.join(packageRoot, 'scripts', 'stencil-command.sh');

function runCommand(args) {
  return spawnSync('bash', [commandScriptPath, ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

test('manifest references only existing skill directories', () => {
  assert.deepEqual(manifest.skills, contract.manifestSkills);

  for (const skillDir of manifest.skills) {
    const skillPath = path.join(packageRoot, skillDir, 'SKILL.md');
    assert.equal(existsSync(skillPath), true, `${skillPath} should exist`);
  }
});

test('canonical command names are documented and hyphenated public commands are absent', () => {
  assert.doesNotMatch(readme, /(^|[\s`])\/stencil-(init|create|list|show|run|delete)\b/m);

  for (const command of contract.directCommands) {
    assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const subcommand of contract.routerSubcommands) {
    assert.match(routerSkill, new RegExp(`/stencil ${subcommand}`));
  }
});

test('run skill documents needs_input handling and explicit execution confirmation', () => {
  assert.match(runSkill, /status=needs_input/);
  assert.match(runSkill, /ask only for unresolved required inputs/i);
  assert.match(runSkill, /explicit user confirmation before executing the resolved prompt/i);
  assert.match(runSkill, /user cancels/i);
});

test('skill frontmatter names match the canonical direct command surface', () => {
  for (const [relativePath, expectedName] of Object.entries(contract.skillFrontmatterNames)) {
    const fileContents = readFileSync(path.join(packageRoot, relativePath), 'utf8');
    assert.match(fileContents, new RegExp(`^name: ${expectedName}$`, 'm'));
  }
});

test('router help text stays aligned with the shared shell help output', () => {
  const expectedHelp = `${contract.helpLines.join('\n')}\n`;
  const helpResult = runCommand([]);

  assert.equal(helpResult.status, 0);
  assert.equal(helpResult.stdout, expectedHelp);
  assert.equal(helpResult.stderr, '');

  for (const line of contract.helpLines) {
    if (line.length > 0) {
      assert.match(routerSkill, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
});

test('unknown commands fail with a corrective adapter message', () => {
  const result = runCommand(['unknown']);

  assert.equal(result.status, 64);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Unknown stencil command: unknown\. Run \/stencil help for usage\./);
});

test('required positional arguments are enforced before bridge invocation', () => {
  const showResult = runCommand(['show']);
  assert.equal(showResult.status, 64);
  assert.equal(showResult.stdout, '');
  assert.match(showResult.stderr, /Missing template name for command "show"\./);

  const initResult = runCommand(['init', 'extra']);
  assert.equal(initResult.status, 64);
  assert.equal(initResult.stdout, '');
  assert.match(initResult.stderr, /Command "init" does not accept extra arguments\./);
});
