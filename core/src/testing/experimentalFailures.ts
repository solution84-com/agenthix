/**
 * The record of an experimental feature's failing tests (adr-0172): a failing test in a feature's own group, while its
 * flag is at `experimental`, is written here instead of failing the run, and the run's summary lists it. Shared by
 * every suite that switches a flag on for a group (vitest's `withFeature`, and hq's end-to-end and cross-app helpers),
 * so each writes the same record and prints the same summary.
 *
 * A run's records are files of JSON lines in one folder, one file per process, since a suite's tests run in several
 * processes at once. The folder is `EXPERIMENTAL_FAILURES_DIR` when set, otherwise one under the working folder's
 * `node_modules/.cache`, which no repository commits.
 */
import fs from 'node:fs'
import path from 'node:path'

export type ExperimentalFailure = {
  /** The flag the group switched on, at experimental when the test failed. */
  flag: string
  /** The test's full name, its file and groups first. */
  test: string
  /** What failed: the first error's message. */
  error: string
}

export const EXPERIMENTAL_FAILURES_DIR_ENV = 'EXPERIMENTAL_FAILURES_DIR'

export function experimentalFailuresDir(): string {
  return process.env[EXPERIMENTAL_FAILURES_DIR_ENV] || path.join(process.cwd(), 'node_modules', '.cache', 'experimental-failures')
}

export function recordExperimentalFailure(failure: ExperimentalFailure, dir: string = experimentalFailuresDir()): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(dir, `${process.pid}.jsonl`), `${JSON.stringify(failure)}\n`)
}

function isFailure(value: unknown): value is ExperimentalFailure {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.flag === 'string' && typeof v.test === 'string' && typeof v.error === 'string'
}

/** Every record in the folder, oldest file first; a line that is not a record is skipped. */
export function readExperimentalFailures(dir: string = experimentalFailuresDir()): ExperimentalFailure[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl')).sort()
  } catch {
    return []
  }
  return names.flatMap(name => fs.readFileSync(path.join(dir, name), 'utf8').split('\n').flatMap(line => {
    if (!line.trim()) return []
    try {
      const parsed: unknown = JSON.parse(line)
      return isFailure(parsed) ? [parsed] : []
    } catch {
      return []
    }
  }))
}

export function clearExperimentalFailures(dir: string = experimentalFailuresDir()): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

/** The summary's lines: `Experimental failures: <flag>, N tests` for each flag, then each test and its error. */
export function formatExperimentalFailures(failures: readonly ExperimentalFailure[]): string[] {
  const byFlag = new Map<string, ExperimentalFailure[]>()
  for (const f of failures) byFlag.set(f.flag, [...(byFlag.get(f.flag) ?? []), f])
  return [...byFlag.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).flatMap(([flag, list]) => [
    `Experimental failures: ${flag}, ${list.length} ${list.length === 1 ? 'test' : 'tests'}`,
    ...list.map(f => `  ${f.test}: ${f.error.split('\n')[0]}`),
  ])
}

/**
 * A run's start and end, for a suite's global setup: clears the last run's records, and returns what prints this
 * run's summary when it ends. Vitest's `globalSetup` file can export it as its default.
 */
export function experimentalFailuresGlobalSetup(dir: string = experimentalFailuresDir()): () => void {
  clearExperimentalFailures(dir)
  return () => {
    const lines = formatExperimentalFailures(readExperimentalFailures(dir))
    if (lines.length) console.log(`\n${lines.join('\n')}\n`)
  }
}
