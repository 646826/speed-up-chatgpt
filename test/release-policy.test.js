"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const workflowPath = join(__dirname, '../.github/workflows/publish.yml');

const approvedVersion = '1.0.1';
const workflow = readFileSync(workflowPath, 'utf8');
const block = workflow.split('      - name: Resolve version and release mode\n')[1]?.split('\n      - name:')[0];
assert.ok(block, 'the actual release resolver must be present');
const script = block.split('        run: |\n')[1].split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
function resolveRelease({ version = approvedVersion, tagged = false, event = 'push', requested = 'UPLOAD_ONLY', skip = 'false', previous = '0.0.1' } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'cws-policy-'));
  const run = (command, args, env = process.env) => {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', env, timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  try {
    run('git', ['init', '-q']);
    run('git', ['config', 'user.name', 'Release Policy Test']);
    run('git', ['config', 'user.email', 'release-test@example.invalid']);
    writeFileSync(join(cwd, 'manifest.json'), JSON.stringify({ version: previous }));
    run('git', ['add', 'manifest.json']); run('git', ['commit', '-qm', 'fixture']);
    const before = run('git', ['rev-parse', 'HEAD']);
    writeFileSync(join(cwd, 'manifest.json'), JSON.stringify({ version }));
    if (tagged) run('git', ['tag', `v${version}`]);
    const output = join(cwd, 'output');
    run('bash', ['-c', script], { ...process.env,
      EVENT_NAME: event, BEFORE_SHA: before, REQUESTED_PUBLISH_TYPE: requested,
      REQUESTED_SKIP_REVIEW: skip, GITHUB_OUTPUT: output,
      CWS_PUBLISHER_ID: '', CWS_EXTENSION_ID: '', GCP_WORKLOAD_IDENTITY_PROVIDER: '',
      GCP_SERVICE_ACCOUNT: '', GOOGLE_CREDENTIALS: ''
    });
    return Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map(line => line.split('=')));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
test('the explicitly approved new version is submitted with review enabled', () => {
  const out = resolveRelease({ skip: 'true' });
  assert.equal(out.should_upload, 'true'); assert.equal(out.create_release, 'true');
  assert.equal(out.publish_type, 'DEFAULT_PUBLISH'); assert.equal(out.skip_review, 'false');
});
test('a different future version remains upload-only', () => {
  const out = resolveRelease({ version: '99.0.0', requested: 'DEFAULT_PUBLISH', skip: 'true' });
  assert.equal(out.publish_type, 'UPLOAD_ONLY'); assert.equal(out.skip_review, 'false');
});
test('an earlier unapproved version remains upload-only', () => {
  const out = resolveRelease({ version: '0.0.2', requested: 'DEFAULT_PUBLISH' });
  assert.equal(out.publish_type, 'UPLOAD_ONLY');
});
test('an existing tag prevents repeat automatic delivery', () => {
  const out = resolveRelease({ tagged: true });
  assert.equal(out.should_upload, 'false'); assert.equal(out.create_release, 'false');
});
test('manual upload-only behavior is preserved', () => {
  const out = resolveRelease({ event: 'workflow_dispatch' });
  assert.equal(out.publish_type, 'UPLOAD_ONLY'); assert.equal(out.create_release, 'false');
});
test('manual staged publishing remains an explicit choice', () => {
  const out = resolveRelease({ event: 'workflow_dispatch', requested: 'STAGED_PUBLISH' });
  assert.equal(out.publish_type, 'STAGED_PUBLISH'); assert.equal(out.skip_review, 'false');
});
