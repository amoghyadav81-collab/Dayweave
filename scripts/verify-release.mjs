// Release gate runner. Uses disposable local fixtures; never runs fixture tests on a live URL.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--container')) throw Error('Usage: npm run verify:release -- [--container]');
if (process.env.DAYWEAVE_TEST_URL) throw Error('Unset DAYWEAVE_TEST_URL: release fixtures must run locally, never against a deployed service');
const directory = resolve('.verification');
mkdirSync(directory, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'dayweave-release-check-'));
const report = {
  startedAt: new Date().toISOString(),
  steps: [],
  unverified: ['Public hosting/TLS and provider recovery', 'Two real ChatGPT account connections', 'Unattended ChatGPT scheduling', 'Physical phone delivery and unrelated-user seven-day trial'],
};
const reportPath = join(directory, 'latest.json');
function save() { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
function run(name, command, argv, env = {}) {
  const step = { name, status: 'running', startedAt: new Date().toISOString() };
  report.steps.push(step); save();
  console.log('\nRelease gate: ' + name);
  const result = spawnSync(command, argv, { stdio: 'inherit', env: { ...process.env, ...env } });
  step.finishedAt = new Date().toISOString();
  step.exitCode = result.status;
  step.status = result.status === 0 ? 'passed' : 'failed'; save();
  if (result.status !== 0) throw Error(name + ' failed' + (result.error ? ': ' + result.error.message : ''));
}
try {
  run('TypeScript', 'npm', ['run', 'check']);
  run('Unit, security and recovery tests', 'npm', ['test']);
  const buildDatabase = join(scratch, 'must-not-be-created.sqlite');
  run('Production build', 'npm', ['run', 'build'], { DATABASE_PATH: buildDatabase, NODE_ENV: 'production' });
  if (existsSync(buildDatabase)) throw Error('Production build unexpectedly opened a runtime database');
  run('Desktop/mobile and authenticated MCP browser checks', 'npm', ['run', 'test:browser']);
  run('Locked production bundle', process.execPath, ['scripts/release.mjs']);
  if (args.includes('--container')) {
    run('Production image build', 'docker', ['build', '-t', 'dayweave:release', 'release']);
    run('Container browser checks and persistent-volume replacement', 'npm', ['run', 'test:container'], { DAYWEAVE_TEST_IMAGE: 'dayweave:release' });
  } else {
    report.steps.push({ name: 'Container image and persistent-volume checks', status: 'not_run', reason: 'Use --container on a Docker-enabled host' });
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); save();
  rmSync(scratch, { recursive: true, force: true });
  console.log('Verification report: ' + reportPath);
}
