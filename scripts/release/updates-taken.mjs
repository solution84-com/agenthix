#!/usr/bin/env node
// Release's first stage refuses to start when the month's updates haven't been taken (the spec of the dependency
// updates; the releasing skill): scripts/deps/taken.json, which Take the updates (take-updates.yml) writes at every run,
// must be dated within the last month. The step runs once a month, not before every release.
//   node scripts/release/updates-taken.mjs [--dry-run]
// GITHUB_REF names the branch. A dry run, and a patch on a release branch (fixes only), are never stopped.
// Exit 0: go on; 1: stop.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TAKEN_FILE = 'scripts/deps/taken.json'

/** The day one calendar month after `day` (YYYY-MM-DD), held to the month's last day: 31 Jan → 28 Feb. */
function oneMonthAfter(day) {
  const [y, m, d] = day.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d, lastDay))).toISOString().slice(0, 10)
}

/** Why the release must stop, as a sentence, or null when it may go on. */
export function updatesTakenProblem({ dryRun, ref, taken, today }) {
  if (dryRun || ref.startsWith('refs/heads/release/')) return null
  if (!taken) return `No record of the updates being taken (${TAKEN_FILE}): run Take the updates first.`
  if (today <= oneMonthAfter(taken)) return null
  return `The updates were last taken on ${taken}, more than a month ago: run Take the updates first.`
}

/** The date of the last run of Take the updates, or null. */
export function takenDate(root) {
  try {
    const { date } = JSON.parse(fs.readFileSync(path.join(root, TAKEN_FILE), 'utf8'))
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
  } catch {
    return null
  }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const dryRun = process.argv.includes('--dry-run')
  const ref = process.env.GITHUB_REF ?? `refs/heads/${execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim()}`
  const taken = takenDate(root)
  const problem = updatesTakenProblem({ dryRun, ref, taken, today: new Date().toISOString().slice(0, 10) })
  if (problem) {
    console.error(process.env.GITHUB_ACTIONS === 'true' ? `::error::${problem}` : problem)
    process.exit(1)
  }
  if (dryRun || ref.startsWith('refs/heads/release/')) console.log('The updates check is skipped: a dry run, or a patch on a release branch.')
  else console.log(`The updates were taken on ${taken}, within the last month.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
