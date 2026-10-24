import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verdict } from '../checks-verdict.mjs'

const needs = results => Object.fromEntries(Object.entries(results).map(([job, result]) => [job, { result }]))

test('passes when every selected job succeeded and every other was skipped @SC-1261', () => {
  assert.deepEqual(verdict(needs({ changes: 'success', core: 'success', hq: 'skipped' }), ['core']), [])
})

test('fails when a selected job was skipped or cancelled @SC-1261', () => {
  assert.deepEqual(verdict(needs({ changes: 'success', core: 'skipped', hq: 'success' }), ['core', 'hq']), ['core was selected and its result is skipped'])
  assert.deepEqual(verdict(needs({ changes: 'success', core: 'cancelled' }), ['core']), ['core was selected and its result is cancelled'])
})

test('fails when a job ran without being selected, or a selected job failed @SC-1261', () => {
  assert.deepEqual(verdict(needs({ changes: 'success', core: 'success' }), []), ['core was not selected and its result is success'])
  assert.deepEqual(verdict(needs({ changes: 'success', core: 'failure' }), ['core']), ['core was selected and its result is failure'])
})

test("fails when 'changes' did not succeed, or names a job not checked here @SC-1261", () => {
  assert.deepEqual(verdict(needs({ changes: 'failure', core: 'skipped' }), []), ["'changes' did not succeed (failure)"])
  assert.deepEqual(verdict(needs({ changes: 'success' }), ['ghost']), ['ghost was selected but is not one of the jobs checked here'])
})
