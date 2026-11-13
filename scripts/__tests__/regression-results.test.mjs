import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exactPattern, failureLabel, fromPlaywright, fromVitest, rerunVerdict, summaryLine } from '../regression/results.mjs'

test("reads a Vitest report's counts and failed tests, a file that failed before its tests included", () => {
  const report = {
    numPassedTests: 5, numFailedTests: 1, numPendingTests: 2, numTodoTests: 1,
    testResults: [
      { name: '/r/a.test.ts', status: 'failed', assertionResults: [
        { fullName: 'group one fails', status: 'failed' }, { fullName: 'group two', status: 'passed' }] },
      { name: '/r/b.test.ts', status: 'failed', assertionResults: [] },
      { name: '/r/c.test.ts', status: 'passed', assertionResults: [{ fullName: 'ok', status: 'passed' }] },
    ],
  }
  assert.deepEqual(fromVitest(report), {
    passed: 5, failed: 2, skipped: 3,
    failures: [{ file: '/r/a.test.ts', name: 'group one fails' }, { file: '/r/b.test.ts', name: null }],
  })
})

test("reads a Playwright report's nested suites, projects and flaky tests", () => {
  const report = { suites: [{ file: 'a.spec.ts', specs: [
    { title: 'passes', file: 'a.spec.ts', line: 3, tests: [{ projectName: 'chromium', status: 'expected' }] },
  ], suites: [{ specs: [
    { title: 'fails', file: 'a.spec.ts', line: 9, tests: [
      { projectName: 'chromium', status: 'unexpected' }, { projectName: 'not-secure', status: 'flaky' }] },
    { title: 'skips', file: 'a.spec.ts', line: 20, tests: [{ projectName: 'chromium', status: 'skipped' }] },
  ] }] }] }
  assert.deepEqual(fromPlaywright(report), {
    passed: 1, failed: 1, skipped: 1, flaky: 1,
    failures: [{ file: 'a.spec.ts', line: 9, project: 'chromium', name: 'fails' }],
  })
})

test('labels a failure by file and line, or file and name', () => {
  assert.equal(failureLabel({ file: 'a.spec.ts', line: 9, project: 'chromium', name: 'fails' }), 'a.spec.ts:9 [chromium] fails')
  assert.equal(failureLabel({ file: '/r/a.test.ts', name: 'x y' }), '/r/a.test.ts > x y')
  assert.match(failureLabel({ file: '/r/b.test.ts', name: null }), /failed before its tests ran/)
})

test("a summary line gives the result, counts, duration and each rerun's verdict", () => {
  assert.equal(summaryLine({ id: 'hq-unit', ok: true, counts: { passed: 10, failed: 0, skipped: 2 }, durationMs: 61_400 }),
    'PASS  hq-unit  10 passed, 0 failed, 2 skipped  61 s')
  assert.equal(summaryLine({ id: 'hq-typecheck', ok: false, exitCode: 2, durationMs: 9_000 }), 'FAIL  hq-typecheck  exit 2  9 s')
  const line = summaryLine({
    id: 'e2e', ok: false, counts: { passed: 3, failed: 2, skipped: 0, flaky: 1 }, durationMs: 1000,
    reruns: [
      { failure: { file: 'a.spec.ts', line: 1, project: 'chromium', name: 'one' }, verdict: 'fails alone' },
      { failure: { file: 'b.spec.ts', line: 2, project: 'chromium', name: 'two' }, verdict: 'passes alone' },
    ],
  })
  assert.match(line, /^FAIL  e2e  3 passed, 2 failed, 0 skipped, 1 flaky  1 s — fails alone: a\.spec\.ts:1 \[chromium\] one \| passes alone: b\.spec\.ts:2/)
  assert.equal(summaryLine({ id: 'images', skipped: 'no image part changed' }), 'SKIP  images — no image part changed')
})

test('a rerun passes alone only when a test ran and none failed', () => {
  assert.equal(rerunVerdict({ passed: 1, failed: 0, skipped: 0 }, 0), 'passes alone')
  assert.equal(rerunVerdict({ passed: 0, failed: 1, skipped: 0 }, 1), 'fails alone')
  assert.equal(rerunVerdict({ passed: 0, failed: 0, skipped: 1 }, 0), 'did not run alone')
  assert.equal(rerunVerdict(null, 1), 'fails alone')
})

test("a test's name becomes a pattern that matches only itself", () => {
  const pattern = new RegExp(exactPattern('a (b) [c] * d.e?'))
  assert.ok(pattern.test('a (b) [c] * d.e?'))
  assert.ok(!pattern.test('xa (b) [c] * d.e?'))
})
