import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { cloneMirrorAtomically } from '../../src/services/agent-tasks/repository-workspace.js';

let root = '';
let source = '';

before(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'nexus-mirror-'));
  source = path.join(root, 'source');
  execFileSync('git', ['init', '-q', '-b', 'main', source]);
  writeFileSync(path.join(source, 'README.md'), 'hello\n');
  execFileSync('git', ['-C', source, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.']);
  execFileSync('git', ['-C', source, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init']);
});

after(() => rmSync(root, { recursive: true, force: true }));

const leftovers = (dir: string) => readdirSync(dir).filter((name) => name.includes('.clone-'));

test('clones a mirror into place', async () => {
  const target = path.join(root, 'mirrors-a', 'owner__repo');
  execFileSync('mkdir', ['-p', path.dirname(target)]);
  await cloneMirrorAtomically(source, target);
  assert.ok(existsSync(path.join(target, 'README.md')));
  assert.deepEqual(leftovers(path.dirname(target)), []);
});

test('two tasks cloning the same repo at once both succeed (was "File exists")', async () => {
  const target = path.join(root, 'mirrors-b', 'owner__repo');
  execFileSync('mkdir', ['-p', path.dirname(target)]);
  await Promise.all([cloneMirrorAtomically(source, target), cloneMirrorAtomically(source, target)]);
  assert.ok(existsSync(path.join(target, 'README.md')));
  assert.deepEqual(leftovers(path.dirname(target)), []);
});

test('a failed clone leaves nothing behind for the next task to trip on', async () => {
  const target = path.join(root, 'mirrors-c', 'owner__repo');
  execFileSync('mkdir', ['-p', path.dirname(target)]);
  await assert.rejects(cloneMirrorAtomically(path.join(root, 'does-not-exist'), target));
  assert.equal(existsSync(target), false);
  assert.deepEqual(leftovers(path.dirname(target)), []);
});
