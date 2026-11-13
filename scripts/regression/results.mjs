// Reading what a step's test runner reported: its counts, its failed tests, and the one line the summary gives it.
// Vitest's and Playwright's JSON reports; a step with neither (a typecheck, a build) has only its exit code.

/** Counts and failed tests from a Vitest JSON report (`--reporter=json`). */
export function fromVitest(report) {
  const failures = []
  for (const file of report.testResults ?? []) {
    const failed = (file.assertionResults ?? []).filter((t) => t.status === 'failed')
    for (const t of failed) failures.push({ file: file.name, name: t.fullName ?? [...(t.ancestorTitles ?? []), t.title].join(' ') })
    // A file that failed before any test ran (an import error, a failing hook) has no test to name.
    if (file.status === 'failed' && failed.length === 0) failures.push({ file: file.name, name: null })
  }
  return {
    passed: report.numPassedTests ?? 0,
    failed: Math.max(report.numFailedTests ?? 0, failures.length),
    skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
    failures,
  }
}

function* playwrightTests(suite) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) yield { spec, test }
  for (const child of suite.suites ?? []) yield* playwrightTests(child)
}

/** Counts and failed tests from a Playwright JSON report (`--reporter=json`). `flaky` passed on a retry. */
export function fromPlaywright(report) {
  const failures = []
  const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 }
  for (const suite of report.suites ?? []) {
    for (const { spec, test } of playwrightTests(suite)) {
      if (test.status === 'expected') counts.passed++
      else if (test.status === 'flaky') counts.flaky++
      else if (test.status === 'skipped') counts.skipped++
      else {
        counts.failed++
        failures.push({ file: spec.file, line: spec.line, project: test.projectName, name: spec.title })
      }
    }
  }
  return { ...counts, failures }
}

/** A name for a failed test that a person can find it by. */
export function failureLabel(f) {
  if (f.line != null) return `${f.file}:${f.line}${f.project ? ` [${f.project}]` : ''} ${f.name}`
  return f.name ? `${f.file} > ${f.name}` : `${f.file} (the file failed before its tests ran)`
}

const seconds = (ms) => `${Math.round(ms / 1000)} s`

/**
 * The summary's line for one finished step:
 *   PASS  hq-unit  1200 passed, 0 failed, 4 skipped  301 s
 *   FAIL  e2e  150 passed, 2 failed, 60 skipped  250 s — fails alone: …; passes alone: …
 */
export function summaryLine(step) {
  const verdict = step.skipped ? 'SKIP' : step.ok ? 'PASS' : 'FAIL'
  const parts = [step.id]
  const c = step.counts
  if (c) parts.push(`${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped${c.flaky ? `, ${c.flaky} flaky` : ''}`)
  else if (!step.skipped) parts.push(`exit ${step.exitCode}`)
  if (step.durationMs != null) parts.push(seconds(step.durationMs))
  let line = `${verdict.padEnd(6)}${parts.join('  ')}`
  if (step.skipped) line += ` — ${step.skipped}`
  const reruns = step.reruns ?? []
  const group = (verdictWanted) => reruns.filter((r) => r.verdict === verdictWanted).map((r) => failureLabel(r.failure))
  const notes = [
    ['fails alone', group('fails alone')],
    ['passes alone', group('passes alone')],
    ['did not run alone', group('did not run alone')],
  ].filter(([, list]) => list.length).map(([label, list]) => `${label}: ${list.join('; ')}`)
  if (step.note) notes.push(step.note)
  if (notes.length) line += ` — ${notes.join(' | ')}`
  return line
}

/** What a rerun of one failed test alone showed, from its own report's counts. */
export function rerunVerdict(counts, exitCode) {
  if (!counts || counts.passed + counts.failed + (counts.flaky ?? 0) === 0) return exitCode === 0 ? 'did not run alone' : 'fails alone'
  return counts.failed === 0 && exitCode === 0 ? 'passes alone' : 'fails alone'
}

/** `text` as a regular expression matching itself exactly, for Vitest's `-t`. */
export function exactPattern(text) {
  return `^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}
