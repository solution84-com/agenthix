#!/usr/bin/env node
// Which of GitHub's security alerts (Dependabot alerts) need a decision, and by when (docs/architecture/dependencies.md,
// Security alerts). Every open alert is fixed, dismissed in GitHub with a reason, or deferred to a named month in
// scripts/deps/deferred.json, which leaves it out until that month. A critical or high alert in shipped code (a runtime
// dependency of a module an image installs) is decided within 7 days of GitHub opening it; any other waits for the
// next monthly dependency updates.
//   node scripts/deps/security.mjs --line              one line when something needs attention; silent when the
//                                                      alerts can't be read (no login, no network); always exits 0
//   node scripts/deps/security.mjs --release --version <version> [--dry-run]
//                                                      Release's stage 0: fails past the 7 days, or unread
//   node scripts/deps/security.mjs --triage            every open alert, by package and module, in Markdown
// The alerts are read with `gh api`: the person's own login on the dev machine, the token given (GH_TOKEN) in CI. A
// major or minor is checked wherever it is cut; only a patch version on a release branch (GITHUB_REF) is not
// (adr-0194), nor a dry run. For tests: DEPS_NOW, DEPS_ALERTS_FILE (the API's answer, as JSON) and DEPS_DEFERRED_FILE.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dueState, nextUpdatesName, patchOnReleaseBranch, sydneyMonth, takenMonth, versionArg } from './due.mjs'

const DAY = 24 * 60 * 60 * 1000
const DECIDE_WITHIN_DAYS = 7
const URGENT = new Set(['critical', 'high'])
const RANK = { critical: 0, high: 1, medium: 2, low: 3 }
// Lockfiles no image installs: the root's tools and the cross-app suite.
const NOT_SHIPPED = new Set(['root', 'tests/cross-app'])

export function moduleOf(manifest) {
  const dir = path.posix.dirname(manifest)
  return dir === '.' ? 'root' : dir
}

function sydneyDay(time) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time)
}

function plural(n, one, many) { return n === 1 ? one : many }

/** The open alerts that need a decision now, each with its deadline, and those deferred until a later month. */
export function assess(raw, deferred, now) {
  const month = sydneyMonth(now).month
  const open = [], held = []
  for (const r of raw) {
    const module = moduleOf(r.dependency.manifest_path)
    const severity = r.security_advisory.severity
    const shipped = r.dependency.scope === 'runtime' && !NOT_SHIPPED.has(module)
    const a = {
      number: r.number, package: r.dependency.package.name, module, severity, shipped,
      patched: r.security_vulnerability?.first_patched_version?.identifier ?? null,
      urgent: shipped && URGENT.has(severity),
    }
    const entry = deferred.find(d => d.alerts.includes(a.number))
    if (entry && month < entry.lookAgain) { held.push({ ...a, lookAgain: entry.lookAgain, reason: entry.reason }); continue }
    if (a.urgent) {
      const deadline = new Date(Date.parse(r.created_at) + DECIDE_WITHIN_DAYS * DAY)
      const left = deadline.getTime() - now.getTime()
      Object.assign(a, { deadline: sydneyDay(deadline), past: left < 0, daysLeft: Math.ceil(left / DAY), daysPast: Math.ceil(-left / DAY) })
    } else {
      Object.assign(a, { deadline: null, past: false })
    }
    open.push(a)
  }
  return { open, deferred: held }
}

/** Alerts grouped by package and module, the soonest deadline (then the worst severity) first. */
function groups(alerts) {
  const by = new Map()
  for (const a of alerts) {
    const key = `${a.package}\u0000${a.module}`
    if (!by.has(key)) by.set(key, [])
    by.get(key).push(a)
  }
  return [...by.values()].map(list => {
    const urgent = list.filter(a => a.urgent).sort((x, y) => x.deadline.localeCompare(y.deadline) || x.daysLeft - y.daysLeft)
    const worst = [...list].sort((x, y) => RANK[x.severity] - RANK[y.severity])[0]
    return { package: worst.package, module: worst.module, severity: worst.severity, shipped: list.some(a => a.shipped), alerts: list, first: urgent[0] ?? null }
  }).sort((x, y) => {
    if (x.first && y.first) return x.first.daysLeft - y.first.daysLeft || RANK[x.severity] - RANK[y.severity]
    if (x.first || y.first) return x.first ? -1 : 1
    return RANK[x.severity] - RANK[y.severity] || x.package.localeCompare(y.package)
  })
}

function when(a) {
  return a.past ? `${a.daysPast} ${plural(a.daysPast, 'day', 'days')} past` : `${a.daysLeft} ${plural(a.daysLeft, 'day', 'days')} left`
}

/** The highest of these versions (the one that fixes every alert of a group), by their numeric parts. */
function highest(versions) {
  const parts = v => v.split(/[.-]/).map(n => (/^\d+$/.test(n) ? Number(n) : -1))
  return versions.reduce((best, v) => {
    if (!best) return v
    const [a, b] = [parts(v), parts(best)]
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0) ? v : best
    return best
  }, null)
}

function numbers(list) { return list.map(a => a.number).sort((x, y) => x - y).join(', ') }

export function lineFor({ open }, updatesName, { updatesDue = false } = {}) {
  const urgent = open.filter(a => a.urgent)
  if (urgent.length) {
    const named = groups(urgent).map(g => `${g.severity}: ${g.package} in ${g.module}, ${when(g.first)}`)
    const shown = named.length > 3 ? [...named.slice(0, 3), `${named.length - 3} more`] : named
    return `${urgent.length} security ${plural(urgent.length, 'alert needs', 'alerts need')} a decision (${shown.join('; ')}).`
  }
  if (open.length && updatesDue) {
    return `${open.length} security ${plural(open.length, 'alert waits', 'alerts wait')} for a decision in the ${updatesName} dependency updates.`
  }
  return ''
}

export function releaseProblem({ open }, { dryRun, exempt: isExempt }) {
  if (dryRun || isExempt) return null
  const late = open.filter(a => a.urgent && a.past)
  if (!late.length) return null
  const named = groups(late).map(g => `${g.severity}: ${g.package} in ${g.module}`).join('; ')
  return `${late.length} security ${plural(late.length, 'alert in shipped code is past its', 'alerts in shipped code are past their')} 7 days with no decision (${named}): fix, dismiss with a reason, or defer each first.`
}

export function triage({ open, deferred }, updatesName) {
  const lines = []
  if (!open.length) lines.push('No open security alert needs a decision.', '')
  else {
    lines.push(`${open.length} open security ${plural(open.length, 'alert needs', 'alerts need')} a decision: fixed, dismissed in GitHub with a reason, or deferred in scripts/deps/deferred.json.`, '',
      '| Package | Module | Severity | Code | Alerts | Fixed in (all of them) | Decide by |', '|---|---|---|---|---|---|---|')
    for (const g of groups(open)) {
      const fixed = highest(g.alerts.map(a => a.patched).filter(Boolean)) ?? 'no fix yet'
      const by = g.first ? `${g.first.deadline} (${when(g.first)})` : `the ${updatesName} updates`
      lines.push(`| ${g.package} | ${g.module} | ${g.severity} | ${g.shipped ? 'shipped' : 'development'} | ${numbers(g.alerts)} | ${fixed} | ${by} |`)
    }
    lines.push('')
  }
  if (deferred.length) {
    lines.push('Deferred, until the month named:', '', '| Package | Module | Alerts | Look again | Reason |', '|---|---|---|---|---|')
    for (const g of groups(deferred)) lines.push(`| ${g.package} | ${g.module} | ${numbers(g.alerts)} | ${g.alerts[0].lookAgain} | ${g.alerts[0].reason} |`)
    lines.push('')
  }
  return `${lines.join('\n')}`
}

export function readDeferred(file) {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(list)) throw new Error(`${file}: a list of entries is expected`)
  for (const [i, d] of list.entries()) {
    const where = `${file}: entry ${i + 1}`
    for (const field of ['package', 'module', 'reason']) if (typeof d[field] !== 'string' || !d[field]) throw new Error(`${where}: ${field} is missing`)
    if (!Array.isArray(d.alerts) || !d.alerts.length || !d.alerts.every(Number.isInteger)) throw new Error(`${where}: alerts must list the alert numbers`)
    if (typeof d.lookAgain !== 'string' || !/^\d{4}-\d{2}$/.test(d.lookAgain)) throw new Error(`${where}: lookAgain must be a month, as 2026-12`)
  }
  return list
}

/** The open alerts, or why they couldn't be read. */
function readAlerts(env, root) {
  if (env.DEPS_ALERTS_FILE) {
    try { return { alerts: JSON.parse(fs.readFileSync(env.DEPS_ALERTS_FILE, 'utf8')) } } catch (e) { return { error: e.message } }
  }
  const repo = env.GITHUB_REPOSITORY || '{owner}/{repo}'
  try {
    const out = execFileSync('gh', ['api', '--paginate', `repos/${repo}/dependabot/alerts?state=open&per_page=100`, '--jq', '.[] | tojson'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 })
    return { alerts: out.split('\n').filter(Boolean).map(l => JSON.parse(l)) }
  } catch (e) {
    const said = (e.stderr?.toString() ?? '').trim().split('\n')[0]
    return { error: said || e.message }
  }
}

function main() {
  const args = process.argv.slice(2)
  const env = process.env
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const now = env.DEPS_NOW ? new Date(env.DEPS_NOW) : new Date()
  const actions = env.GITHUB_ACTIONS === 'true'
  const mode = ['--line', '--release', '--triage'].find(m => args.includes(m))
  if (!mode) { console.error('Usage: node scripts/deps/security.mjs --line | --release --version <version> [--dry-run] | --triage'); return 2 }
  const version = versionArg(args)
  if (mode === '--release' && !version) {
    console.error('--release needs --version <version>: only a patch version on a release branch skips the check.')
    return 2
  }
  const exempt = mode === '--release' && patchOnReleaseBranch(version, env.GITHUB_REF)

  const due = dueState(takenMonth(path.join(root, 'scripts/deps/taken.json')), now)
  const next = nextUpdatesName(due)
  if (mode === '--release' && (args.includes('--dry-run') || exempt)) {
    console.log(`Security alerts are not checked: a dry run, or ${version}, a patch on a release branch.`)
    return 0
  }
  let assessment
  try {
    const { alerts, error } = readAlerts(env, root)
    if (error) throw new Error(`Security alerts weren't read (${error})`)
    assessment = assess(alerts, readDeferred(env.DEPS_DEFERRED_FILE || path.join(root, 'scripts/deps/deferred.json')), now)
  } catch (e) {
    if (mode === '--line') return 0
    console.error(actions ? `::error::${e.message}.` : `${e.message}.`)
    return 1
  }

  if (mode === '--line') {
    const line = lineFor(assessment, next, { updatesDue: due.state !== 'done' })
    if (line) console.log(line)
    return 0
  }
  if (mode === '--triage') { process.stdout.write(triage(assessment, next)); return 0 }
  const problem = releaseProblem(assessment, { dryRun: args.includes('--dry-run'), exempt })
  if (problem) { console.error(actions ? `::error::${problem}` : problem); return 1 }
  console.log('No security alert in shipped code is past its 7 days.')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main())
