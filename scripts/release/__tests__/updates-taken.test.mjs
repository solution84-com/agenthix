import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { TAKEN_FILE, takenDate, updatesTakenProblem } from '../updates-taken.mjs'

const main = { dryRun: false, ref: 'refs/heads/main' }

test('a real run on main passes when the updates were taken within the last month @SC-2163', () => {
  assert.equal(updatesTakenProblem({ ...main, taken: '2026-11-15', today: '2026-11-15' }), null)
  assert.equal(updatesTakenProblem({ ...main, taken: '2026-10-15', today: '2026-11-15' }), null)
  assert.equal(updatesTakenProblem({ ...main, taken: '2026-01-31', today: '2026-02-28' }), null)
})

test('a real run on main stops when the updates are more than a month old, and says what to do @SC-2163', () => {
  const problem = updatesTakenProblem({ ...main, taken: '2026-10-14', today: '2026-11-15' })
  assert.match(problem, /The updates were last taken on 2026-10-14, more than a month ago: run Take the updates first\./)
  assert.ok(updatesTakenProblem({ ...main, taken: '2026-01-31', today: '2026-03-01' }))
})

test('a record with no date stops it @SC-2163', () => {
  assert.match(updatesTakenProblem({ ...main, taken: null, today: '2026-11-15' }), /run Take the updates first/)
})

test('a dry run, and a patch on a release branch, are not stopped @SC-2163', () => {
  assert.equal(updatesTakenProblem({ dryRun: true, ref: 'refs/heads/main', taken: '2025-01-01', today: '2026-11-15' }), null)
  assert.equal(updatesTakenProblem({ dryRun: false, ref: 'refs/heads/release/0.1', taken: '2025-01-01', today: '2026-11-15' }), null)
})

test('the date is read from the record the step writes @SC-2163', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taken-'))
  assert.equal(takenDate(dir), null)
  fs.mkdirSync(path.join(dir, path.dirname(TAKEN_FILE)), { recursive: true })
  fs.writeFileSync(path.join(dir, TAKEN_FILE), '{"date":"2026-11-01","moved":{}}\n')
  assert.equal(takenDate(dir), '2026-11-01')
  fs.writeFileSync(path.join(dir, TAKEN_FILE), '{"moved":{}}\n')
  assert.equal(takenDate(dir), null)
})
