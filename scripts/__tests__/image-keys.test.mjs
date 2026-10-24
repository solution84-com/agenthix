// node --test scripts/__tests__/image-keys.test.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { computeKeys, fromReferences } from '../images/keys.mjs'

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim()

/** A small repository with two parts: `a` reads a/ and shared/, `b` reads b/ and shared/. */
function fixture(epoch = 1) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-'))
  const write = (p, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true })
    fs.writeFileSync(path.join(dir, p), text)
  }
  write('.dockerignore', 'node_modules\n')
  write('a/Dockerfile', 'FROM node:24 AS build\nFROM build AS app\nCOPY a a\n')
  write('b/Dockerfile', 'FROM --platform=$BUILDPLATFORM alpine:3 AS x\nCOPY b b\n')
  write('a/file', '1')
  write('b/file', '1')
  write('shared/file', '1')
  write('unrelated/file', '1')
  write('scripts/images/parts.json', JSON.stringify({
    rebuildEpoch: epoch,
    parts: {
      a: { dockerfile: 'a/Dockerfile', target: 'app', inputs: ['a/', 'shared/'] },
      b: { dockerfile: 'b/Dockerfile', target: null, inputs: ['b/', 'shared/'] },
    },
  }))
  git(dir, 'init', '-q')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'one')
  const commit = message => { git(dir, 'add', '-A'); git(dir, 'commit', '-qm', message) }
  return { dir, write, commit }
}

test('a key changes exactly when something its part is built from changes @SC-1264', () => {
  const { dir, write, commit } = fixture()
  const before = computeKeys({ cwd: dir })
  assert.equal(Object.keys(before).length, 2)
  assert.match(before.a, /^[0-9a-f]{64}$/)

  write('unrelated/file', '2'); commit('unrelated')
  assert.deepEqual(computeKeys({ cwd: dir }), before)

  write('a/file', '2'); commit('a')
  const afterA = computeKeys({ cwd: dir })
  assert.notEqual(afterA.a, before.a)
  assert.equal(afterA.b, before.b)

  write('shared/file', '2'); commit('shared')
  const afterShared = computeKeys({ cwd: dir })
  assert.notEqual(afterShared.a, afterA.a)
  assert.notEqual(afterShared.b, afterA.b)

  write('b/Dockerfile', 'FROM alpine:3.1 AS x\nCOPY b b\n'); commit('base moved')
  const afterBase = computeKeys({ cwd: dir })
  assert.notEqual(afterBase.b, afterShared.b)
  assert.equal(afterBase.a, afterShared.a)

  write('.dockerignore', 'node_modules\n.env\n'); commit('ignore')
  const afterIgnore = computeKeys({ cwd: dir })
  assert.notEqual(afterIgnore.a, afterBase.a)
  assert.notEqual(afterIgnore.b, afterBase.b)
})

test('a key is the same at a commit whatever has happened since, and --worktree keys uncommitted changes @SC-1264', () => {
  const { dir, write, commit } = fixture()
  const head = git(dir, 'rev-parse', 'HEAD')
  const before = computeKeys({ cwd: dir, ref: head })
  write('a/file', '9')
  assert.deepEqual(computeKeys({ cwd: dir, ref: head }), before)
  const dirty = computeKeys({ cwd: dir, worktree: true })
  assert.notEqual(dirty.a, before.a)
  assert.equal(dirty.b, before.b)
  commit('a')
  assert.deepEqual(computeKeys({ cwd: dir, worktree: true }), computeKeys({ cwd: dir }))
  assert.equal(git(dir, 'status', '--porcelain'), '')
})

test('the rebuild epoch changes every key @SC-1266', () => {
  const { dir, write, commit } = fixture()
  const before = computeKeys({ cwd: dir })
  write('scripts/images/parts.json', fs.readFileSync(path.join(dir, 'scripts/images/parts.json'), 'utf8').replace('"rebuildEpoch":1', '"rebuildEpoch":2'))
  commit('epoch')
  const after = computeKeys({ cwd: dir })
  assert.notEqual(after.a, before.a)
  assert.notEqual(after.b, before.b)
})

test('a Dockerfile\'s own stages are not base images @SC-1266', () => {
  assert.deepEqual(fromReferences('FROM node:24 AS build\nFROM build AS app\nFROM --platform=$BUILDPLATFORM x@sha256:ab AS y\nFROM app\n'), ['node:24', 'x@sha256:ab'])
})
