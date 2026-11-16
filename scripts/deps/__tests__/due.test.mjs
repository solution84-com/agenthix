import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dueState, isPatch, lineFor, nextUpdatesName, patchOnReleaseBranch, releaseProblem, sydneyMonth, takenMonth } from '../due.mjs'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'due.mjs')

test('the current month is the one in Sydney, wherever the check runs', () => {
  // 14:00 UTC on 30 November is already 1 December in Sydney (UTC+11 in summer).
  assert.deepEqual(sydneyMonth(new Date('2026-11-30T14:00:00Z')), { month: '2026-12', day: 1 })
  assert.deepEqual(sydneyMonth(new Date('2026-11-30T12:59:00Z')), { month: '2026-11', day: 30 })
  // 31 December UTC afternoon is 1 January in Sydney: the year moves too.
  assert.deepEqual(sydneyMonth(new Date('2026-12-31T13:30:00Z')), { month: '2027-01', day: 1 })
  // Winter (UTC+10): 14:00 UTC on 30 June is 1 July in Sydney.
  assert.deepEqual(sydneyMonth(new Date('2026-06-30T14:00:00Z')), { month: '2026-07', day: 1 })
})

test('a month is done when the recorded month is the current one', () => {
  assert.equal(dueState('2026-11', new Date('2026-11-15T00:00:00Z')).state, 'done')
  assert.equal(dueState('2026-11', new Date('2026-11-30T12:00:00Z')).state, 'done')
})

test('from the 1st of a month not done, the updates are due; from the 8th, overdue', () => {
  // The last hour of 30 November in UTC is 1 December in Sydney: due, though a UTC clock still says November.
  assert.deepEqual(dueState('2026-11', new Date('2026-11-30T14:00:00Z')), { state: 'due', month: '2026-12', name: 'December' })
  assert.equal(dueState('2026-11', new Date('2026-12-07T12:59:00Z')).state, 'due') // 7 December, 23:59 in Sydney
  assert.equal(dueState('2026-11', new Date('2026-12-07T13:00:00Z')).state, 'overdue') // 8 December, 00:00 in Sydney
  assert.equal(dueState('2026-10', new Date('2026-11-20T00:00:00Z')).state, 'overdue')
})

test('no recorded month is due, then overdue, as a month not done', () => {
  assert.equal(dueState(null, new Date('2026-12-02T00:00:00Z')).state, 'due')
  assert.equal(dueState(null, new Date('2026-12-10T00:00:00Z')).state, 'overdue')
})

test('the next monthly updates are this month\'s until done, then next month\'s', () => {
  assert.equal(nextUpdatesName({ state: 'due', month: '2026-12', name: 'December' }), 'December')
  assert.equal(nextUpdatesName({ state: 'done', month: '2026-11', name: 'November' }), 'December')
  assert.equal(nextUpdatesName({ state: 'done', month: '2026-12', name: 'December' }), 'January')
})

test('the line names the month and what to run, and is empty when done', () => {
  assert.equal(lineFor({ state: 'done', name: 'November' }), '')
  assert.equal(lineFor({ state: 'due', name: 'December' }),
    "Dependency updates for December aren't done: run the monthly dependency updates.")
  assert.equal(lineFor({ state: 'overdue', name: 'December' }),
    'Dependency updates for December are overdue: run the monthly dependency updates.')
})

test('a patch is x.y.z with z above 0, or a pre-release of one; a major or minor is not', () => {
  for (const v of ['0.1.1', 'v0.1.1', '1.4.3', '0.1.10', '0.1.1-rc.1', '2.0.1-alpha.3']) assert.equal(isPatch(v), true, v)
  for (const v of ['0.1.0', 'v0.2.0', '1.0.0', '2.0.0', '0.2.0-rc.1', '0.1.0-alpha.6', '', undefined, '0.1', '0.1.x', '0.1.01', 'latest']) {
    assert.equal(isPatch(v), false, String(v))
  }
})

test('only a patch version on a release branch skips the gate; a major or minor is checked wherever it is cut', () => {
  assert.equal(patchOnReleaseBranch('0.1.1', 'refs/heads/release/v0.1.1'), true)
  assert.equal(patchOnReleaseBranch('0.1.1-rc.1', 'refs/heads/release/v0.1.1'), true)
  assert.equal(patchOnReleaseBranch('0.1.0', 'refs/heads/release/v0.1.0'), false)
  assert.equal(patchOnReleaseBranch('0.2.0', 'refs/heads/release/v0.2.0'), false)
  assert.equal(patchOnReleaseBranch('2.0.0', 'refs/heads/release/v2.0.0'), false)
  assert.equal(patchOnReleaseBranch('0.1.1', 'refs/heads/main'), false)
  assert.equal(patchOnReleaseBranch('0.1.1', 'refs/heads/fix/x'), false)
  assert.equal(patchOnReleaseBranch('0.1.1', undefined), false)
  assert.equal(patchOnReleaseBranch(undefined, 'refs/heads/release/v0.1.1'), false)
})

test('Release stops whenever the month is not done, except a dry run or a patch version on a release branch', () => {
  assert.equal(releaseProblem({ state: 'done', name: 'November' }, { dryRun: false, exempt: false }), null)
  assert.equal(releaseProblem({ state: 'due', name: 'December' }, { dryRun: false, exempt: false }),
    "Dependency updates for December aren't done: run the monthly dependency updates first.")
  assert.ok(releaseProblem({ state: 'overdue', name: 'December' }, { dryRun: false, exempt: false }))
  assert.equal(releaseProblem({ state: 'overdue', name: 'December' }, { dryRun: true, exempt: false }), null)
  assert.equal(releaseProblem({ state: 'overdue', name: 'December' }, { dryRun: false, exempt: true }), null)
})

test('the month is read from taken.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'due-'))
  const file = path.join(dir, 'taken.json')
  assert.equal(takenMonth(file), null)
  fs.writeFileSync(file, '{"date":"2026-11-15","month":"2026-11","moved":{}}\n')
  assert.equal(takenMonth(file), '2026-11')
  fs.writeFileSync(file, '{"date":"2026-11-15","moved":{}}\n')
  assert.equal(takenMonth(file), null)
  fs.writeFileSync(file, '{"month":"November"}\n')
  assert.equal(takenMonth(file), null)
})

function run(args, { month, now, env = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'due-cli-'))
  const file = path.join(dir, 'taken.json')
  fs.writeFileSync(file, JSON.stringify({ date: '2026-11-15', month, moved: {} }))
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GITHUB_')))
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...clean, DEPS_TAKEN_FILE: file, DEPS_NOW: now, ...env },
  })
}

test('--line prints one line when due and nothing when done, and exits 0 either way', () => {
  const due = run(['--line'], { month: '2026-11', now: '2026-12-10T00:00:00Z' })
  assert.equal(due.status, 0)
  assert.equal(due.stdout, 'Dependency updates for December are overdue: run the monthly dependency updates.\n')
  const done = run(['--line'], { month: '2026-12', now: '2026-12-10T00:00:00Z' })
  assert.equal(done.status, 0)
  assert.equal(done.stdout, '')
})

test('--release exits non-zero when not done, and passes with --dry-run', () => {
  const main = { GITHUB_REF: 'refs/heads/main' }
  assert.equal(run(['--release', '--version', '0.2.0'], { month: '2026-11', now: '2026-12-02T00:00:00Z', env: main }).status, 1)
  assert.equal(run(['--release', '--version', '0.2.0', '--dry-run'], { month: '2026-11', now: '2026-12-02T00:00:00Z', env: main }).status, 0)
  assert.equal(run(['--release', '--version', '0.2.0'], { month: '2026-12', now: '2026-12-02T00:00:00Z', env: main }).status, 0)
})

test('--release skips the month for a patch version on a release branch, and checks a major or minor there', () => {
  const at = (version, ref) => run(['--release', '--version', version], { month: '2026-11', now: '2026-12-02T00:00:00Z', env: { GITHUB_REF: ref } })
  const patch = at('0.1.1', 'refs/heads/release/v0.1.1')
  assert.equal(patch.status, 0)
  assert.match(patch.stdout, /not checked: .*patch/)
  assert.equal(at('0.1.0', 'refs/heads/release/v0.1.0').status, 1)
  assert.equal(at('0.2.0-rc.1', 'refs/heads/release/v0.2.0').status, 1)
  assert.equal(at('0.1.1', 'refs/heads/main').status, 1)
})

test('--release without the version is refused: the gate cannot tell a patch from a minor', () => {
  const r = run(['--release'], { month: '2026-12', now: '2026-12-02T00:00:00Z', env: { GITHUB_REF: 'refs/heads/release/v0.1.1' } })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /--version/)
})

test('the committed taken.json records a month', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd: path.dirname(script) }).trim()
  assert.match(takenMonth(path.join(root, 'scripts/deps/taken.json')) ?? '', /^\d{4}-\d{2}$/)
})
