#!/usr/bin/env node
// Whether the monthly dependency updates are done (docs/architecture/dependencies.md). scripts/deps/update.sh --record
// writes the month it ran into scripts/deps/taken.json; a month is done when that is the current month, due from the
// 1st of a month that is not, and overdue from the 8th. One clock: the current month in Australia/Sydney, wherever
// this runs, so the dev machine and GitHub's runners (UTC) agree on when the 1st is.
//   node scripts/deps/due.mjs --line                 one line when due or overdue, nothing when done; always exits 0
//   node scripts/deps/due.mjs --release [--dry-run]  Release's stage 0: fails while the month is not done
// A release branch (a patch), and a pull request into one, are never failed, and a dry run of Release is not stopped.
// For tests: DEPS_NOW (an ISO time) and DEPS_TAKEN_FILE.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ZONE = 'Australia/Sydney'
const OVERDUE_FROM_DAY = 8

export function sydneyMonth(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map(p => [p.type, p.value]))
  return { month: `${parts.year}-${parts.month}`, day: Number(parts.day) }
}

function monthName(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-AU', { month: 'long', timeZone: 'UTC' })
}

/** `{ state: 'done' | 'due' | 'overdue', month, name }` for the month recorded (yyyy-mm, or null) at `now`. */
export function dueState(recorded, now) {
  const { month, day } = sydneyMonth(now)
  const name = monthName(month)
  if (recorded && recorded >= month) return { state: 'done', month, name }
  return { state: day >= OVERDUE_FROM_DAY ? 'overdue' : 'due', month, name }
}

/** The month of the next monthly dependency updates: this month's while they aren't done, otherwise next month's. */
export function nextUpdatesName(due) {
  if (due.state !== 'done') return due.name
  const [y, m] = due.month.split('-').map(Number)
  return monthName(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`)
}

export function lineFor({ state, name }) {
  if (state === 'due') return `Dependency updates for ${name} aren't done: run the monthly dependency updates.`
  if (state === 'overdue') return `Dependency updates for ${name} are overdue: run the monthly dependency updates.`
  return ''
}

/** A patch on a release branch, or a pull request into one, is never held up by the month. */
export function exempt(env) {
  return (env.GITHUB_REF ?? '').startsWith('refs/heads/release/') || (env.GITHUB_BASE_REF ?? '').startsWith('release/')
}

export function releaseProblem(due, { dryRun, exempt: isExempt }) {
  if (dryRun || isExempt || due.state === 'done') return null
  return `Dependency updates for ${due.name} aren't done: run the monthly dependency updates first.`
}

export function takenMonth(file) {
  try {
    const { month } = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : null
  } catch {
    return null
  }
}

function main() {
  const args = process.argv.slice(2)
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const file = process.env.DEPS_TAKEN_FILE || path.join(root, 'scripts/deps/taken.json')
  const now = process.env.DEPS_NOW ? new Date(process.env.DEPS_NOW) : new Date()
  const due = dueState(takenMonth(file), now)
  const actions = process.env.GITHUB_ACTIONS === 'true'

  if (args.includes('--line')) {
    const line = lineFor(due)
    if (line) console.log(line)
    return 0
  }
  if (args.includes('--release')) {
    const dryRun = args.includes('--dry-run')
    const problem = releaseProblem(due, { dryRun, exempt: exempt(process.env) })
    if (problem) {
      console.error(actions ? `::error::${problem}` : problem)
      return 1
    }
    if (due.state !== 'done') console.log('The monthly dependency updates are not checked: a dry run, or a patch on a release branch.')
    else console.log(`Dependency updates for ${due.name} are done.`)
    return 0
  }
  console.error('Usage: node scripts/deps/due.mjs --line | --release [--dry-run]')
  return 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main())
