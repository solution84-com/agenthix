import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseRun, isTrusted } from '../proven-run.mjs'

const repo = 'o/r'
let n = 0
const run = (over) => ({ id: ++n, event: 'push', head_branch: 'release/1.0.1', head_sha: 'c1', status: 'completed', conclusion: 'success', created_at: `2026-10-${String(10 + n).padStart(2, '0')}T00:00:00Z`, head_repository: { full_name: repo }, ...over })
const none = () => null

test('only a push to a release branch or a run by hand from main or a release branch, in this repository, is trusted @SC-1268', () => {
  assert.equal(isTrusted(run({}), repo), true)
  assert.equal(isTrusted(run({ head_branch: 'main' }), repo), false)
  assert.equal(isTrusted(run({ event: 'workflow_dispatch', head_branch: 'main' }), repo), true)
  assert.equal(isTrusted(run({ event: 'workflow_dispatch', head_branch: 'feature/x' }), repo), false)
  assert.equal(isTrusted(run({ event: 'pull_request' }), repo), false)
  assert.equal(isTrusted(run({ head_repository: { full_name: 'fork/r' } }), repo), false)
})

test('the latest run for the commit decides: a later failure refuses even after an earlier pass @SC-1268', () => {
  const runs = [run({}), run({ conclusion: 'failure' })]
  assert.equal(chooseRun({ runs, commit: 'c1', repository: repo, commitOf: none }).state, 'fail')
  assert.equal(chooseRun({ runs: [runs[1], run({})], commit: 'c1', repository: repo, commitOf: none }).state, 'pass')
})

test('a run by hand is matched by the commit its candidate names, not the branch tip it ran from @SC-1268', () => {
  const byHand = run({ event: 'workflow_dispatch', head_branch: 'main', head_sha: 'tip' })
  const commitOf = r => (r.id === byHand.id ? 'c0' : null)
  assert.equal(chooseRun({ runs: [byHand], commit: 'c0', repository: repo, commitOf }).run.id, byHand.id)
  assert.equal(chooseRun({ runs: [byHand], commit: 'tip', repository: repo, commitOf }).state, 'none')
})

test('a run still going for the commit, or a run by hand not yet saying which, is waited for @SC-1268', () => {
  assert.equal(chooseRun({ runs: [run({ status: 'in_progress', conclusion: null })], commit: 'c1', repository: repo, commitOf: none }).state, 'wait')
  const passed = run({})
  const going = run({ event: 'workflow_dispatch', head_branch: 'main', status: 'in_progress', conclusion: null })
  assert.equal(chooseRun({ runs: [passed, going], commit: 'c1', repository: repo, commitOf: none }).state, 'wait')
})

test('a commit no trusted run built finds none @SC-1268', () => {
  const runs = [run({ head_sha: 'other' }), run({ head_branch: 'feature/x', event: 'workflow_dispatch' })]
  // The run from another branch would name the commit, and is still not counted.
  assert.equal(chooseRun({ runs, commit: 'c1', repository: repo, commitOf: () => 'c1' }).state, 'none')
})
