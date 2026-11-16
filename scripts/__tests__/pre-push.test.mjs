// The pre-push hook, run by real pushes from throwaway repositories to a bare remote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hooks = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.githooks')
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}

function ok(cwd, ...args) {
  const r = git(cwd, ...args)
  assert.equal(r.code, 0, `git ${args.join(' ')}: ${r.out}`)
  return r.out
}

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'pre-push-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  ok(root, 'init', '-q', '--bare', '-b', 'main', 'remote.git')
  const work = join(root, 'work')
  ok(root, 'init', '-q', '-b', 'main', 'work')
  mkdirSync(join(work, '.githooks'))
  for (const f of ['pre-push', 'public-text-patterns']) copyFileSync(join(hooks, f), join(work, '.githooks', f))
  chmodSync(join(work, '.githooks', 'pre-push'), 0o755)
  ok(work, 'config', 'core.hooksPath', '.githooks')
  ok(work, 'config', 'user.name', 'Avery Chen')
  ok(work, 'config', 'user.email', 'avery@example.com')
  ok(work, 'remote', 'add', 'origin', join(root, 'remote.git'))
  ok(work, 'remote', 'add', 'private', join(root, 'remote.git'))
  ok(work, 'add', '.')
  ok(work, 'commit', '-qm', 'chore: the hooks')
  ok(work, 'push', '-q', 'origin', 'main')
  return work
}

function commit(work, files, message = 'docs: a change') {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true })
    if (text === null) rmSync(join(work, path))
    else writeFileSync(join(work, path), text)
  }
  ok(work, 'add', '-A')
  ok(work, 'commit', '-qm', message)
}

const push = (work, ...args) => git(work, 'push', '-q', ...(args.length ? args : ['origin', 'HEAD']))

test('a push with nothing to refuse passes', (t) => {
  const work = repo(t)
  commit(work, { 'README.md': 'Agenthix runs agents.\n' })
  assert.equal(push(work).code, 0)
})

test('a spec whose unit has no plan is refused, and passes once the plan is there', (t) => {
  const work = repo(t)
  commit(work, { 'docs/work/2026-01-01-thing/spec.md': '# Spec\n' })
  const r = push(work)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /docs\/work\/2026-01-01-thing\/spec\.md has no plan\.md beside it/)
  commit(work, { 'docs/work/2026-01-01-thing/plan.md': '# Plan\n' })
  assert.equal(push(work).code, 0)
})

test('planning files at the pushed tip are refused', (t) => {
  for (const path of ['docs/product/x.md', 'docs/roadmap.md', 'docs/cloud-delivery.md', 'docs/epics/e.md']) {
    const work = repo(t)
    commit(work, { [path]: 'plan\n' })
    const r = push(work)
    assert.notEqual(r.code, 0, path)
    assert.match(r.out, /carries planning/, path)
  }
})

test('a push to the remote named private is never checked', (t) => {
  const work = repo(t)
  commit(work, { 'docs/roadmap.md': 'see planning#12\n' })
  assert.equal(push(work, 'private', 'HEAD').code, 0)
})

test('--no-verify overrides the hook', (t) => {
  const work = repo(t)
  commit(work, { 'notes.md': 'see planning#12\n' })
  assert.equal(push(work, '--no-verify', 'origin', 'HEAD').code, 0)
})

test('an added line matching a public pattern is refused with its file, line and reason only', (t) => {
  const work = repo(t)
  commit(work, { 'docs/notes.md': 'one\ntwo\nthe token hunter2 and planning#42 here\n' })
  const r = push(work)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /docs\/notes\.md:3: .*an issue in a private repository/)
  assert.doesNotMatch(r.out, /hunter2/)
})

test('each public pattern catches what it is for', (t) => {
  const lines = [
    'tracked in planning#7',
    'recorded as bdr-0018',
    'that use may not be permitted by the terms',
    'it appears to breach the licence',
    'priced at $20/mo',
    'between $5-$15 per seat',
  ]
  for (const line of lines) {
    const work = repo(t)
    commit(work, { 'a.md': `${line}\n` })
    assert.notEqual(push(work).code, 0, line)
  }
})

test('public patterns leave ordinary text alone', (t) => {
  const work = repo(t)
  commit(work, { 'a.md': 'see adr-0042 and #128\nit costs $0.28 per million tokens\nthe planning log\n' })
  assert.equal(push(work).code, 0)
})

test('a commit message matching a pattern is refused', (t) => {
  const work = repo(t)
  commit(work, { 'a.md': 'fine\n' }, 'fix(hq): the thing\n\nCloses planning#9')
  const r = push(work)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /commit [0-9a-f]+ message:3: .*an issue in a private repository/)
})

test('text already on the remote and deleted lines are not checked', (t) => {
  const work = repo(t)
  commit(work, { 'a.md': 'planning#1\nkeep\n' })
  assert.equal(push(work, '--no-verify', 'origin', 'HEAD').code, 0)
  commit(work, { 'a.md': 'keep\n' })
  commit(work, { 'b.md': 'clean\n' })
  assert.equal(push(work).code, 0)
})

test('a new branch is checked only for the commits the remote does not have', (t) => {
  const work = repo(t)
  commit(work, { 'a.md': 'planning#1\n' })
  assert.equal(push(work, '--no-verify', 'origin', 'HEAD').code, 0)
  ok(work, 'checkout', '-qb', 'feature')
  commit(work, { 'b.md': 'clean\n' })
  assert.equal(push(work, 'origin', 'feature').code, 0)
  commit(work, { 'c.md': 'bdr-0001\n' })
  ok(work, 'checkout', '-qb', 'other')
  assert.notEqual(push(work, 'origin', 'other').code, 0)
})

test('every commit of the push is checked, not only the tip', (t) => {
  const work = repo(t)
  commit(work, { 'a.md': 'planning#3\n' })
  commit(work, { 'a.md': 'clean\n' })
  assert.notEqual(push(work).code, 0)
})

test('skipped: the pattern files, the writing-in-public skill, the hook tests, unit execution folders and binaries', (t) => {
  const work = repo(t)
  commit(work, {
    '.githooks/public-text-patterns': 'planning#1\tan example\n',
    'scripts/__tests__/pre-push.test.mjs': '// planning#1\n',
    '.agents/skills/writing-in-public/SKILL.md': 'Never write planning#1 here.\n',
    'docs/work/2026-01-01-u/execution/notes.md': 'planning#1\n',
  })
  writeFileSync(join(work, 'blob.bin'), Buffer.from([0, 1, 2, ...Buffer.from('planning#1\n'), 0]))
  ok(work, 'add', '-A')
  ok(work, 'commit', '-qm', 'chore: binary')
  assert.equal(push(work).code, 0)
})

test('the maintainers private list applies when present, with Python-style inline flags', (t) => {
  const work = repo(t)
  commit(work, { 'a.md': 'we use the Fernhill-Tools repo\n' })
  assert.equal(push(work, '--dry-run', 'origin', 'HEAD').code, 0)
  const common = ok(work, 'rev-parse', '--git-common-dir').trim()
  mkdirSync(join(work, common, 'info'), { recursive: true })
  writeFileSync(join(work, common, 'info', 'private-patterns'),
    '# a comment\n\n(?i)\\bfernhill[-_]tools\\b\ta private repository\n')
  const r = push(work)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /a\.md:1: a private repository/)
  assert.doesNotMatch(r.out, /Fernhill/)
})

test('an invalid pattern refuses the push rather than checking nothing', (t) => {
  const work = repo(t)
  const common = ok(work, 'rev-parse', '--git-common-dir').trim()
  writeFileSync(join(work, common, 'info', 'private-patterns'), '(unclosed\tbroken\n')
  commit(work, { 'a.md': 'clean\n' })
  const r = push(work)
  assert.notEqual(r.code, 0)
  assert.match(r.out, /invalid pattern/)
})

test('a force push over a remote commit this clone never fetched still checks the text', (t) => {
  const work = repo(t)
  const other = join(dirname(work), 'other')
  ok(dirname(work), 'clone', '-q', join(dirname(work), 'remote.git'), 'other')
  ok(other, 'config', 'user.name', 'Avery Chen')
  ok(other, 'config', 'user.email', 'avery@example.com')
  ok(other, 'commit', '-q', '--allow-empty', '-m', 'docs: someone else')
  ok(other, 'push', '-q', '--no-verify', 'origin', 'main')
  commit(work, { 'notes.md': 'See planning#12.\n' })
  const r = push(work, '--force', 'origin', 'HEAD:main')
  assert.notEqual(r.code, 0)
  assert.match(r.out, /notes\.md:1: a reference to an issue in a private repository/)
})

test('an edit to a spec already public passes, though its unit has no plan', (t) => {
  const work = repo(t)
  commit(work, { 'docs/work/2026-01-01-old/spec.md': '# Spec\n' })
  assert.equal(push(work, '--no-verify', 'origin', 'HEAD').code, 0)
  commit(work, { 'docs/work/2026-01-01-old/spec.md': '# Spec, reworded\n' })
  assert.equal(push(work).code, 0)
})
