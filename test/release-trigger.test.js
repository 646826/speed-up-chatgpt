'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// Exercise the real workflow resolver, not a second implementation of its rules.
const workflow = readFileSync(join(__dirname, '../.github/workflows/publish.yml'), 'utf8');
const block = workflow.split('      - name: Resolve version and release mode\n')[1]?.split('\n      - name:')[0];
assert.ok(block, 'release resolver exists');
const script = block.split('        run: |\n')[1].split('\n')
  .map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');

function resolve({ version = '1.0.2', previous = version, event = 'push', requested = 'UPLOAD_ONLY', tagged = false, missingBefore = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'release-trigger-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  try {
    git('init', '-q');
    git('config', 'user.name', 'Release Trigger Test');
    git('config', 'user.email', 'release-trigger@example.invalid');
    writeFileSync(join(cwd, 'manifest.json'), JSON.stringify({ version: previous }));
    git('add', 'manifest.json'); git('commit', '-qm', 'fixture');
    const before = git('rev-parse', 'HEAD');
    writeFileSync(join(cwd, 'manifest.json'), JSON.stringify({ version }));
    if (tagged) git('tag', `v${version}`);
    const output = join(cwd, 'output');
    const result = spawnSync('bash', ['-c', script], { cwd, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, EVENT_NAME: event, BEFORE_SHA: missingBefore ? 'f'.repeat(40) : before,
        REQUESTED_PUBLISH_TYPE: requested, REQUESTED_SKIP_REVIEW: 'false', GITHUB_OUTPUT: output },
    });
    assert.equal(result.error, undefined);
    const values = existsSync(output) ? Object.fromEntries(readFileSync(output, 'utf8').trim()
      .split('\n').map(line => line.split('='))) : {};
    return { status: result.status, stderr: result.stderr, values };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

for (const version of ['1.0.2', '99.0.0']) {
  test(`unchanged untagged version ${version} does not start another automatic delivery`, () => {
    const result = resolve({ version, requested: 'DEFAULT_PUBLISH' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.values.should_upload, 'false');
    assert.equal(result.values.create_release, 'false');
  });
}

test('explicit manual publication can retry the unchanged version with normal review', () => {
  const result = resolve({ event: 'workflow_dispatch', requested: 'DEFAULT_PUBLISH' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.values.should_upload, 'true');
  assert.equal(result.values.create_release, 'false');
  assert.equal(result.values.publish_type, 'DEFAULT_PUBLISH');
  assert.equal(result.values.skip_review, 'false');
});

test('manual upload-only remains available even when the version tag exists', () => {
  const result = resolve({ event: 'workflow_dispatch', tagged: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.values.should_upload, 'true');
  assert.equal(result.values.publish_type, 'UPLOAD_ONLY');
});

test('unreadable nonzero previous commit fails rather than assuming a new release', () => {
  const result = resolve({ missingBefore: true });
  assert.notEqual(result.status, 0);
  assert.notEqual(result.values.should_upload, 'true');
});
