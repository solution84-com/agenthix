import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { assess, lineFor, moduleOf, readDeferred, releaseProblem, triage } from '../security.mjs'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'security.mjs')

// As `gh api …/dependabot/alerts` gives them, trimmed to the fields read.
function alert(number, { pkg = 'undici', manifest = 'hq/package-lock.json', scope = 'runtime', severity = 'high', created = '2026-11-15T03:00:00Z', patched = '6.24.0' } = {}) {
  return {
    number,
    created_at: created,
    dependency: { package: { ecosystem: 'npm', name: pkg }, manifest_path: manifest, scope },
    security_advisory: { severity, ghsa_id: `GHSA-${number}` },
    security_vulnerability: { first_patched_version: patched ? { identifier: patched } : null },
  }
}

const NOW = new Date('2026-11-19T00:00:00Z') // 11:00 on 19 November in Sydney; alerts above opened on the 15th

test('the module is the folder of the lockfile; the root lockfile is the root @SC-2167', () => {
  assert.equal(moduleOf('hq/package-lock.json'), 'hq')
  assert.equal(moduleOf('site/opencode-plugin/package-lock.json'), 'site/opencode-plugin')
  assert.equal(moduleOf('package-lock.json'), 'root')
})

test('a critical or high alert in shipped code is decided within 7 days of its opening @SC-2167', () => {
  const [a] = assess([alert(80)], [], NOW).open
  assert.equal(a.urgent, true)
  assert.equal(a.shipped, true)
  assert.equal(a.deadline, '2026-11-22')
  assert.equal(a.daysLeft, 4)
  assert.equal(a.past, false)
  const [late] = assess([alert(80)], [], new Date('2026-11-23T00:00:00Z')).open
  assert.equal(late.past, true)
})

test('development-only, medium and low alerts wait for the next monthly dependency updates @SC-2167', () => {
  const open = assess([
    alert(1, { scope: 'development', severity: 'critical', pkg: 'tinypool', manifest: 'site/package-lock.json' }),
    alert(2, { severity: 'medium' }),
    alert(3, { severity: 'low' }),
    alert(4, { scope: 'runtime', manifest: 'tests/cross-app/package-lock.json' }),
    alert(5, { scope: 'runtime', manifest: 'package-lock.json' }),
  ], [], new Date('2027-01-30T00:00:00Z')).open
  assert.deepEqual(open.map(a => a.urgent), [false, false, false, false, false])
  assert.deepEqual(open.map(a => a.past), [false, false, false, false, false])
  assert.equal(open[3].shipped, false, 'the cross-app suite ships in no image')
  assert.equal(open[4].shipped, false, 'the root package ships in no image')
})

test('a deferred alert is left out until its month, and comes back in it @SC-2167', () => {
  const deferred = [{ package: 'toml', module: 'site/opencode-plugin', alerts: [188], reason: 'needs the next OpenCode', lookAgain: '2026-12' }]
  const alerts = [alert(188, { pkg: 'toml', manifest: 'site/opencode-plugin/package-lock.json' }), alert(80)]
  const before = assess(alerts, deferred, NOW)
  assert.deepEqual(before.open.map(a => a.number), [80])
  assert.deepEqual(before.deferred.map(a => a.number), [188])
  // 1 December in Sydney is still 30 November in UTC.
  const back = assess(alerts, deferred, new Date('2026-11-30T14:00:00Z'))
  assert.deepEqual(back.open.map(a => a.number), [188, 80])
})

test('the dev-start line counts what needs a decision, with the soonest deadline first @SC-2167', () => {
  const a = assess([alert(80), alert(81), alert(90, { pkg: 'tar', manifest: 'site/package-lock.json', severity: 'critical', created: '2026-11-13T03:00:00Z' })], [], NOW)
  assert.equal(lineFor(a, 'December'), '3 security alerts need a decision (critical: tar in site, 2 days left; high: undici in hq, 4 days left).')
  const late = assess([alert(80)], [], new Date('2026-11-25T00:00:00Z'))
  assert.equal(lineFor(late, 'December'), '1 security alert needs a decision (high: undici in hq, 3 days past).')
})

test('with nothing urgent, the line names the monthly updates only while they are due, and is empty otherwise @SC-2167', () => {
  const a = assess([alert(1, { severity: 'medium' }), alert(2, { scope: 'development' })], [], NOW)
  assert.equal(lineFor(a, 'December', { updatesDue: true }), '2 security alerts wait for a decision in the December dependency updates.')
  assert.equal(lineFor(a, 'December', { updatesDue: false }), '')
  assert.equal(lineFor(assess([], [], NOW), 'December', { updatesDue: true }), '')
})

test('Release stops while a shipped critical or high alert is past its 7 days, unless a dry run or a patch version on a release branch @SC-2167', () => {
  const late = assess([alert(80)], [], new Date('2026-11-23T00:00:00Z'))
  assert.match(releaseProblem(late, { dryRun: false, exempt: false }), /1 security alert in shipped code is past its 7 days with no decision \(high: undici in hq\)/)
  assert.equal(releaseProblem(late, { dryRun: true, exempt: false }), null)
  assert.equal(releaseProblem(late, { dryRun: false, exempt: true }), null)
  const deferred = [{ package: 'undici', module: 'hq', alerts: [80], reason: 'r', lookAgain: '2027-01' }]
  assert.equal(releaseProblem(assess([alert(80)], deferred, new Date('2026-11-23T00:00:00Z')), { dryRun: false, exempt: false }), null)
  assert.equal(releaseProblem(assess([alert(80)], [], NOW), { dryRun: false, exempt: false }), null)
})

test('the triage lists every open alert by package and module, the deferred ones apart @SC-2167', () => {
  const deferred = [{ package: 'toml', module: 'site/opencode-plugin', alerts: [188], reason: 'needs the next OpenCode', lookAgain: '2026-12' }]
  const text = triage(assess([alert(80), alert(81, { severity: 'medium', patched: '6.21.1' }), alert(188, { pkg: 'toml', manifest: 'site/opencode-plugin/package-lock.json' })], deferred, NOW), 'December')
  assert.match(text, /\| undici \| hq \| high \| shipped \| 80, 81 \| 6\.24\.0 \| 2026-11-22 \(4 days left\) \|/)
  assert.match(text, /Deferred[\s\S]*\| toml \| site\/opencode-plugin \| 188 \| 2026-12 \| needs the next OpenCode \|/)
})

test('deferred.json is a list of entries, each with its alerts and a month to look again @SC-2167', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deferred-'))
  const file = path.join(dir, 'deferred.json')
  fs.writeFileSync(file, '[]\n')
  assert.deepEqual(readDeferred(file), [])
  fs.writeFileSync(file, JSON.stringify([{ package: 'toml', module: 'site', alerts: [1], reason: 'r', lookAgain: 'December' }]))
  assert.throws(() => readDeferred(file), /lookAgain/)
  fs.writeFileSync(file, JSON.stringify([{ package: 'toml', module: 'site', alerts: [], reason: 'r', lookAgain: '2026-12' }]))
  assert.throws(() => readDeferred(file), /alerts/)
  const committed = path.join(path.dirname(script), 'deferred.json')
  assert.ok(Array.isArray(readDeferred(committed)))
})

function run(args, { alerts, env = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-cli-'))
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GITHUB_')))
  const extra = { DEPS_NOW: '2026-11-23T00:00:00Z', DEPS_DEFERRED_FILE: path.join(dir, 'deferred.json'), ...env }
  fs.writeFileSync(extra.DEPS_DEFERRED_FILE, '[]\n')
  if (alerts) {
    extra.DEPS_ALERTS_FILE = path.join(dir, 'alerts.json')
    fs.writeFileSync(extra.DEPS_ALERTS_FILE, JSON.stringify(alerts))
  } else {
    extra.DEPS_ALERTS_FILE = path.join(dir, 'missing.json')
  }
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...clean, ...extra } })
}

test('--line prints one line, or nothing when the alerts cannot be read, and always exits 0 @SC-2167', () => {
  const late = run(['--line'], { alerts: [alert(80)] })
  assert.equal(late.status, 0)
  assert.equal(late.stdout, '1 security alert needs a decision (high: undici in hq, 1 day past).\n')
  const unread = run(['--line'], {})
  assert.equal(unread.status, 0)
  assert.equal(unread.stdout, '')
  assert.equal(unread.stderr, '')
})

test('--release stops past the 7 days, and stops when the alerts cannot be read @SC-2167', () => {
  const main = { GITHUB_REF: 'refs/heads/main' }
  assert.equal(run(['--release', '--version', '0.2.0'], { alerts: [alert(80)], env: main }).status, 1)
  assert.equal(run(['--release', '--version', '0.2.0', '--dry-run'], { alerts: [alert(80)], env: main }).status, 0)
  assert.equal(run(['--release', '--version', '0.2.0'], { alerts: [], env: main }).status, 0)
  assert.equal(run(['--release', '--version', '0.2.0'], { env: main }).status, 1)
})

test('--release skips the alerts for a patch version on a release branch, and checks a major or minor there @SC-2167', () => {
  const at = (version, ref) => run(['--release', '--version', version], { alerts: [alert(80)], env: { GITHUB_REF: ref } })
  const patch = at('0.1.1', 'refs/heads/release/v0.1.1')
  assert.equal(patch.status, 0)
  assert.match(patch.stdout, /not checked: .*patch/)
  assert.equal(at('0.1.0', 'refs/heads/release/v0.1.0').status, 1)
  assert.equal(at('1.0.0', 'refs/heads/release/v1.0.0').status, 1)
  assert.equal(at('0.1.1', 'refs/heads/main').status, 1)
  // Unread alerts are no reason to skip: a minor on a release branch whose alerts can't be read still stops.
  assert.equal(run(['--release', '--version', '0.2.0'], { env: { GITHUB_REF: 'refs/heads/release/v0.2.0' } }).status, 1)
})

test('--release without the version is refused: the gate cannot tell a patch from a minor @SC-2167', () => {
  const r = run(['--release'], { alerts: [], env: { GITHUB_REF: 'refs/heads/release/v0.1.1' } })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /--version/)
})

test('--triage prints the listing @SC-2167', () => {
  const r = run(['--triage'], { alerts: [alert(80)] })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /\| undici \| hq \| high \| shipped \| 80 \|/)
})
