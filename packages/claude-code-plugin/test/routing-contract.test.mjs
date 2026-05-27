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
const initSkillPath = path.join(packageRoot, 'skills', 'stencil-init', 'SKILL.md');
const initSkill = readFileSync(initSkillPath, 'utf8');
const listSkillPath = path.join(packageRoot, 'skills', 'stencil-list', 'SKILL.md');
const listSkill = readFileSync(listSkillPath, 'utf8');
const showSkillPath = path.join(packageRoot, 'skills', 'stencil-show', 'SKILL.md');
const showSkill = readFileSync(showSkillPath, 'utf8');
const createSkillPath = path.join(packageRoot, 'skills', 'stencil-create', 'SKILL.md');
const createSkill = readFileSync(createSkillPath, 'utf8');
const runSkillPath = path.join(packageRoot, 'skills', 'stencil-run', 'SKILL.md');
const runSkill = readFileSync(runSkillPath, 'utf8');
const deleteSkillPath = path.join(packageRoot, 'skills', 'stencil-delete', 'SKILL.md');
const deleteSkill = readFileSync(deleteSkillPath, 'utf8');
const commandScriptPath = path.join(packageRoot, 'scripts', 'stencil-command.sh');
const commandScript = readFileSync(commandScriptPath, 'utf8');
const bridgeScriptPath = path.join(packageRoot, 'scripts', 'lib', 'bridge.sh');
const bridgeScript = readFileSync(bridgeScriptPath, 'utf8');

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

test('read-path skills document bootstrap, empty-state, warnings, and next-step guidance', () => {
  assert.match(initSkill, /first bootstrap, already initialized, and handled failure/i);
  assert.match(initSkill, /\/stencillist/);
  assert.match(initSkill, /\/stencilrun <name> \.\.\./);

  assert.match(listSkill, /no project templates were found/i);
  assert.match(listSkill, /Do not claim the adapter knows whether the project is uninitialized or merely empty/i);
  assert.match(listSkill, /\/stencilcreate <name>/);

  assert.match(showSkill, /contains warnings, surface those warnings explicitly/i);
  assert.match(showSkill, /\/stencilrun <name>/);
  assert.match(showSkill, /\/stencillist/);
});

test('interactive skills document correction, cancellation, and handled failures', () => {
  assert.match(createSkill, /status=validation_failed/);
  assert.match(createSkill, /correctable template problems/i);
  assert.match(createSkill, /If the user cancels before confirmation, stop with no file write\./);
  assert.match(createSkill, /Do not expose raw JSON or shell details for handled `validation_failed` or `error` outcomes\./);

  assert.match(runSkill, /A declined final confirmation is a clean cancellation, not an error\./);
  assert.match(runSkill, /transport\/runtime failure .* bridge failure/i);
  assert.match(runSkill, /Do not print raw JSON or shell details for handled outcomes\./);

  assert.match(deleteSkill, /Inspect the target first through the shared `show` transport path\./);
  assert.match(deleteSkill, /Treat a declined confirmation as a clean cancellation, not an error\./);
  assert.match(deleteSkill, /transport failure rather than a handled delete outcome/i);
});

test('delete skill documents preview, explicit confirmation, cancellation, and project-only scope', () => {
  assert.match(deleteSkill, /Inspect the target first through the shared `show` transport path\./);
  assert.match(deleteSkill, /present a concise delete preview before any mutation/i);
  assert.match(deleteSkill, /Ask for explicit confirmation .* before invoking `delete`\./i);
  assert.match(deleteSkill, /If the user cancels, stop without invoking `delete`\./);
  assert.match(deleteSkill, /project-only for the MVP/i);
  assert.match(deleteSkill, /`deleted: false`/);
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

test('docs keep the shared handled-outcome and offline-first contract visible', () => {
  assert.match(readme, /## Handled Outcomes/);
  assert.match(readme, /status=ok/);
  assert.match(readme, /status=validation_failed/);
  assert.match(readme, /status=error/);
  assert.match(readme, /exit `64`/);
  assert.match(readme, /exit `70`/);
  assert.match(readme, /offline-first/i);
});

test('adapter transport scripts stay offline-first and avoid network tools', () => {
  assert.doesNotMatch(commandScript, /\b(curl|wget)\b/);
  assert.doesNotMatch(bridgeScript, /\b(curl|wget)\b/);
});
