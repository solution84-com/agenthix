import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { moduleDeps, select } from '../affected.mjs'
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

// A job with a matrix is one entry in `needs`, whose result is the legs' together: success when every leg succeeded,
// failure when any failed, skipped when the job's condition kept it from running at all.
test('a matrix job counts as one job, passing only when every leg did @SC-1261', () => {
  const selected = ['hq', 'hq-integration']
  assert.deepEqual(verdict(needs({ changes: 'success', hq: 'success', 'hq-integration': 'success' }), selected), [])
  assert.deepEqual(verdict(needs({ changes: 'success', hq: 'success', 'hq-integration': 'failure' }), selected), ['hq-integration was selected and its result is failure'])
  assert.deepEqual(verdict(needs({ changes: 'success', hq: 'cancelled', 'hq-integration': 'success' }), selected), ['hq was selected and its result is cancelled'])
})

test('a matrix job that was not selected is skipped as a whole @SC-1261', () => {
  assert.deepEqual(verdict(needs({ changes: 'success', core: 'success', hq: 'skipped', 'hq-integration': 'skipped' }), ['core']), [])
  assert.deepEqual(verdict(needs({ changes: 'success', hq: 'success', 'hq-integration': 'skipped' }), ['hq', 'hq-integration']), ['hq-integration was selected and its result is skipped'])
})

test("every job the selector can pick is one 'All checks passed' waits for, and no other @SC-1261", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/checks.yml'), 'utf8')
  const waitsFor = /^    needs: \[(.*)\]$/m.exec(workflow.slice(workflow.indexOf('\n  all-passed:')))[1].split(',').map(j => j.trim())
  const defined = [...workflow.slice(workflow.indexOf('\njobs:')).matchAll(/^  ([a-z][a-z-]*):$/gm)].map(m => m[1])
  const selectable = select({ deps: moduleDeps(root), paths: [], all: true }).selected
  assert.deepEqual([...waitsFor].sort(), ['changes', ...selectable].sort())
  assert.deepEqual([...defined].sort(), [...waitsFor, 'all-passed'].sort())
})
