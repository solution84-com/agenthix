#!/usr/bin/env node
// The regression, committed: the full regression, or the regression for what a change reaches, with a log per step,
// a summary line per step (result, counts, duration) and every failed test rerun alone once.
//
//   node scripts/regression/run.mjs                        what the change from main reaches (scripts/affected.mjs)
//   node scripts/regression/run.mjs --affected <base>      what the change from <base> reaches
//   node scripts/regression/run.mjs --full                 everything, the e2e and cross-app suites with every flag on too
//
// Options:
//   --mode close-out   (default) nothing else is running: one claim on the heavy lock for the whole run, its steps
//                      at the same time inside it, longest first, as many as the machine has room for (schedule.mjs)
//   --mode shared      other work shares the machine: the groups one after another, every step through the machine's
//                      heavy lock (HEAVY_LOCK, else /tmp/machine-heavy.lock), one Vitest worker, one Playwright worker
//   --only <names>     only these groups or steps, comma-separated (prepare, units, integration, docker, stacks); prepare runs
//                      whenever a later group needs it unless --no-prepare
//   --logs <folder>    where the logs go (a new folder under the system's temporary folder)
//   --min-free-memory <percent>   a group or step waits while free memory is under this, or swap grows (25)
//   --max-groups <n>   close-out: at most this many groups with steps running at once (no ceiling unless given)
//   --max-stacks <n>   close-out: at most this many cross-app and e2e runs at once (no ceiling unless given)
//   --slots <n>        close-out: the budget's slots (the processor count unless given; the load must stay under the
//                      processor count whatever this says)
//   --light-max <n>    close-out: at most this many light commands (`heavy --light`) beside the run (4). It keeps one
//                      slot free for them, and gives them more only of what its own steps cannot use; 0 keeps none
//   --durations <file> close-out: order the steps by the durations in this file (a run's summary.json, or the kept
//                      durations); by default those this checkout's last close-out run kept, else a committed table
//
// Protecting the machine, in either mode (guard.mjs): every step waits while free memory is under 25% or swap grew
// since the last reading; the run stops itself, its steps with it, when free memory falls under 10%, and says which
// steps did not run. The machine's one heavy lock (HEAVY_LOCK, else /tmp/machine-heavy.lock) is claimed per step in
// shared mode, and once for the whole run in close-out mode (not at all when started under a holder that exported
// HEAVY_LOCK_HELD; its steps get HEAVY_LOCK_HELD in turn), which then refuses to start while another vitest,
// playwright or wasp process runs. Close-out mode marks its claim `whole`, so a lane's light command (`heavy --light`)
// may run beside it in a shared slot, which its budget counts. In close-out mode a step starts only while the load is
// under the processor count (a one-slot step up to one and a half times it) and its slots, weighed by the processors
// it was measured using (cpu.mjs), fit beside those running; a Vitest step's workers (hq's integration databases too,
// and an e2e run's Playwright workers) are the slots free when it starts, up to its most. Run uncapped beside other
// work on 13 Nov, an earlier version took a 24 GB machine into swap.
//
// After the builds, the run starts a throwaway database server of its own (testdb.mjs) and every step's test
// databases go to it (TEST_DB_SERVER_URL); it is removed when the run ends. A step that ends with no test report runs
// once more whole, alone, at the end.
//   --dry-run          list the steps and stop
//   --help             this text
//
// <logs>/summary.txt has one line per step as it finishes; <logs>/summary.json the whole record; <logs>/<step>.log
// each step's output.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism, loadavg, totalmem } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exactPattern, fromVitest, rerunVerdict, summaryLine } from './results.mjs'
import { HEAVY_LOCK, defaultLogs, freeMemoryPercent, heldByParent, lightSlotsInUse, markNeverIndexed, releaseLock, swapUsedMb, takeLock, waitForMemory, writeLightAllowed } from './machine.mjs'
import { MemoryWatch, otherHeavyRun, readProcesses } from './guard.mjs'
import { GROUPS, baseEnv, fullSelection, planSteps, selectionFromAffected } from './steps.mjs'
import { LIGHT_MAX, estimates, lightAllowance, longestFirst, readCores, readDurations, schedule, slotRange, weights, writeCores, writeDurations } from './schedule.mjs'
import { CpuMeter } from './cpu.mjs'
import { startTestDatabase } from './testdb.mjs'
import { ROOT } from './stack.mjs'

const MAX_RERUNS = 25
const CORES = availableParallelism()
// The durations this checkout's last close-out run kept, for ordering the next one longest first.
const KEPT_DURATIONS = join(ROOT, 'node_modules/.cache/regression/durations.json')
// The processors each step was measured using, for weighing it in the next run's budget.
const KEPT_CORES = join(ROOT, 'node_modules/.cache/regression/cores.json')

function parseArgs(argv) {
  const o = { mode: 'close-out', base: 'main', full: false, only: null, logs: null, minFree: 25, dryRun: false, prepare: true,
    maxGroups: Infinity, maxStacks: Infinity, durations: null, slots: null, lightMax: LIGHT_MAX }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--full') o.full = true
    else if (a === '--affected') o.base = argv[i + 1] && !argv[i + 1].startsWith('--') ? next() : 'main'
    else if (a === '--mode') o.mode = next()
    else if (a === '--only') o.only = new Set(next().split(','))
    else if (a === '--logs') o.logs = resolve(next())
    else if (a === '--min-free-memory') o.minFree = Number(next())
    else if (a === '--max-groups') o.maxGroups = Number(next())
    else if (a === '--max-stacks') o.maxStacks = Number(next())
    else if (a === '--slots') o.slots = Number(next())
    else if (a === '--light-max') o.lightMax = Number(next())
    else if (a === '--durations') o.durations = resolve(next())
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--no-prepare') o.prepare = false
    else if (a === '--help') {
      // The options are this file's opening comment.
      const text = readFileSync(fileURLToPath(import.meta.url), 'utf8')
      console.log(text.slice(0, text.indexOf('\nimport')).replace(/^\/\/ ?/gm, ''))
      process.exit(0)
    } else throw new Error(`unknown option ${a} (--help lists them)`)
  }
  if (!['close-out', 'shared'].includes(o.mode)) throw new Error('--mode is close-out or shared')
  return o
}

/** The image parts whose kept image (imgtest/<part>:dev) is missing or was built from other content. */
function staleImageParts() {
  const keys = JSON.parse(execFileSync('node', ['scripts/images/keys.mjs', '--worktree', '--json'], { cwd: ROOT, encoding: 'utf8' }))
  const label = (part) => {
    try {
      return execFileSync('docker', ['image', 'inspect', '-f', '{{index .Config.Labels "content-key"}}', `imgtest/${part}:dev`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return ''
    }
  }
  return Object.keys(keys).filter((part) => label(part) !== keys[part])
}

function selection(o) {
  if (o.full) return fullSelection()
  const result = JSON.parse(execFileSync('node', ['scripts/affected.mjs', o.base, '--json'], { cwd: ROOT, encoding: 'utf8' }))
  return selectionFromAffected(result, { staleImageParts: staleImageParts() })
}

// The steps running now. Stopped with the runner, so that a stopped run leaves no suite, stack or server behind: each
// step stops what it started (the cross-app suite's teardown, e2e-stack.mjs's own handler) when it is told to.
const running = new Set()
let stopping = null

/** Stops the run: no step starts after this, and every running one is told to stop. */
function stopRun(reason) {
  if (stopping) return
  stopping = reason
  console.log(`stopping (${reason}): ${running.size} running step(s)`)
  for (const child of running) child.kill('SIGTERM')
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopRun(`stopped by ${signal}`)
    // The steps' own teardowns get a minute; main() writes the summary when they are done.
    setTimeout(() => process.exit(130), 60_000).unref()
  })
}

function exec(cmd, { cwd, env, log, info = {} }) {
  return new Promise((done) => {
    appendFileSync(log, `$ ${cmd.join(' ')}   (in ${relative(ROOT, cwd) || '.'})\n`)
    const child = spawn(cmd[0], cmd.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    if (child.pid) info.onSpawn?.(child.pid)
    running.add(child)
    child.on('close', () => running.delete(child))
    const write = (chunk) => appendFileSync(log, chunk)
    child.stdout.on('data', write)
    child.stderr.on('data', write)
    child.on('error', (err) => write(`${err.message}\n`))
    child.on('close', (code, signal) => {
      info.signal = signal
      done(code ?? 1)
    })
  })
}

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const vitestReport = (json) => ['--reporter=default', '--reporter=json', `--outputFile.json=${json}`]

async function rerunVitest(step, failure, i, ctx, env) {
  const json = join(ctx.logs, `${step.id}.rerun-${i}.json`)
  const file = relative(join(ROOT, step.cwd), failure.file)
  const cmd = ['npm', 'run', step.script, '--', file, ...(failure.name ? ['-t', exactPattern(failure.name)] : []), ...vitestReport(json)]
  const code = await exec(cmd, { cwd: join(ROOT, step.cwd), env: { ...env, TEST_DB_WORKERS: '1' }, log: join(ctx.logs, `${step.id}.reruns.log`) })
  const report = readJson(json)
  return { failure, verdict: rerunVerdict(report && fromVitest(report), code) }
}

/** A step that crashed runs again whole, with nothing else running; its verdict is added to its record and summary. */
async function rerunCrashed({ step, env, record }, ctx) {
  console.log(`--- rerun ${step.id} whole, alone (${record.crash})`)
  const json = join(ctx.logs, `${step.id}.whole-rerun.json`)
  const info = {}
  const code = await exec([...step.cmd, ...vitestReport(json)], { cwd: join(ROOT, step.cwd), env, log: join(ctx.logs, `${step.id}.whole-rerun.log`), info })
  const report = readJson(json)
  const verdict = rerunVerdict(report && fromVitest(report), code)
  record.wholeRerun = { verdict, exitCode: code, ...(info.signal && { signal: info.signal }) }
  record.note = `${record.crash}; run again whole, alone: ${verdict}`
  const line = `RERUN ${step.id}  ${record.note}`
  console.log(line)
  appendFileSync(join(ctx.logs, 'summary.txt'), `${line}\n`)
}

/** Runs one step. In close-out mode the scheduler has checked the machine and sized it: `sized` is { workers, slots }. */
async function runStep(step, ctx, sized = null) {
  if (stopping) return { id: step.id, group: step.group, ok: false, notRun: true, reruns: [] }
  if (!sized && (await waitForMemory(ctx.minFree, { ...ctx.readings, say: (m) => console.log(`[${step.id}] ${m}`) })) === 'abort') {
    stopRun('free memory under 10%')
    return { id: step.id, group: step.group, ok: false, notRun: true, reruns: [] }
  }
  const log = join(ctx.logs, `${step.id}.log`)
  writeFileSync(log, '')
  const env = { ...ctx.base, ...step.env }
  if (step.secretsKey) env.SECRETS_MASTER_KEY = randomBytes(32).toString('base64')
  if (ctx.mode === 'shared') {
    env.VITEST_MAX_WORKERS = '1'
    env.E2E_WORKERS = '1'
    env.NODE_OPTIONS = `--max-old-space-size=3072 ${env.NODE_OPTIONS ?? ''}`.trim()
  } else {
    const workers = String(sized?.workers ?? 1)
    env.VITEST_MAX_WORKERS = workers
    env.E2E_WORKERS = workers
    if (step.dbWorkers) env.TEST_DB_WORKERS = workers
  }
  // A record of its own: two suites of one app at once would clear each other's (e2e-stack.mjs keeps its own).
  if (step.kind !== 'stack') env.EXPERIMENTAL_FAILURES_DIR = join(ctx.logs, `${step.id}.experimental-failures`)
  const json = join(ctx.logs, `${step.id}.json`)
  const cmd = step.kind === 'vitest' || step.kind === 'chain' ? [...step.cmd, ...vitestReport(json)] : step.cmd
  const cwd = join(ROOT, step.cwd)
  const started = Date.now()
  const claimStep = ctx.mode === 'shared' && !heldByParent(ctx.lockPath)
  if (claimStep) await takeLock(ctx.lockPath, process.pid, 3000, { what: `regression step ${step.id}`, repo: basename(ROOT), say: (m) => console.log(`[${step.id}] ${m}`) })
  // Inside a claim (this run's, or the one it was started under), a step that takes the lock itself passes through.
  if (claimStep || ctx.wholeClaim) env.HEAVY_LOCK_HELD = ctx.lockPath
  let exitCode
  const info = {}
  if (ctx.cpu && sized) info.onSpawn = (pid) => ctx.cpu.track(step.id, pid, { docker: step.lane === 'docker' })
  try {
    exitCode = await exec(cmd, { cwd, env, log, info })
  } finally {
    if (claimStep) releaseLock(ctx.lockPath)
    ctx.cpu?.untrack(step.id)
  }
  const cpu = ctx.cpu?.result(step.id)
  const record = { id: step.id, group: step.group, exitCode, log, reruns: [], startedAt: started,
    ...(sized && { slots: sized.slots, declaredSlots: sized.declared ?? sized.slots, ...(sized.workers != null && { workers: sized.workers }) }),
    ...(cpu && { cpu }) }
  if (step.kind === 'vitest' || step.kind === 'chain') {
    const report = readJson(json)
    const read = report && fromVitest(report)
    if (read) record.counts = { passed: read.passed, failed: read.failed, skipped: read.skipped }
    const failures = read?.failures ?? []
    if (exitCode !== 0 && !read && !stopping) {
      // It ended without a test report: a crash, not a failing test. Nothing names a test to rerun, so the whole step
      // runs once more at the end of the run, alone, to tell a crash under load from one of its own.
      record.crash = `ended with ${info.signal ? `signal ${info.signal}` : `exit ${exitCode}`} and no test report`
      record.note = `${record.crash}; it runs again whole, alone, at the end`
      ctx.crashed.push({ step, env, record })
    } else if (step.kind === 'vitest') {
      for (const [i, failure] of failures.slice(0, MAX_RERUNS).entries()) record.reruns.push(await rerunVitest(step, failure, i + 1, ctx, env))
    } else if (failures.length) {
      // The suite's files build on each other, so a test cannot run alone: the whole suite runs once more.
      const again = join(ctx.logs, `${step.id}.rerun.json`)
      const code = await exec([...step.cmd, ...vitestReport(again)], { cwd, env, log: join(ctx.logs, `${step.id}.reruns.log`) })
      const rerun = readJson(again)
      const verdict = rerunVerdict(rerun && fromVitest(rerun), code).replace('alone', 'in a second run')
      record.reruns = failures.map((failure) => ({ failure, verdict }))
      record.note = `its files build on each other, so the whole suite ran again: ${verdict}`
    }
  } else if (step.kind === 'stack') {
    const result = readJson(join(step.out, 'result.json'))
    if (result?.counts) record.counts = result.counts
    record.reruns = result?.reruns ?? []
    if (result?.error) record.note = result.error
  }
  record.ok = exitCode === 0 && (record.counts?.failed ?? 0) === 0
  record.durationMs = Date.now() - started
  const line = summaryLine(record)
  console.log(line)
  appendFileSync(join(ctx.logs, 'summary.txt'), `${line}\n`)
  ctx.records.push(record)
  return record
}

/** A group's steps one after another (prepare in either mode, every group in shared mode). */
async function runGroup(group, steps, ctx) {
  const mine = steps.filter((s) => s.group === group)
  if (mine.length === 0 || stopping) return mine.length === 0
  const started = Date.now()
  console.log(`--- ${group}: ${mine.map((s) => s.id).join(', ')}`)
  let ok = true
  for (const s of mine) {
    if (stopping) return false
    const r = await runStep(s, ctx)
    ok &&= r.ok
    if (!r.ok && group === 'prepare') return false
  }
  ctx.groups[group] = { ok, durationMs: Date.now() - started }
  console.log(`--- ${group} done in ${Math.round((Date.now() - started) / 1000)} s`)
  return ok
}

/**
 * `deps` replaces what the run reads from the machine, for its tests: `steps` (instead of the plan), `read` and `swap`
 * (free memory and swap), `load` (the 1-minute load), `cores`, `light` (light commands beside the run), `processes`
 * (for close-out's check), `lockPath`, `durationsPath` (the kept durations), `everyMs` (how often the machine is read).
 */
const releasedOnExit = new Set()

export async function main(argv, deps = {}) {
  stopping = null
  const o = parseArgs(argv)
  const logs = o.logs ?? defaultLogs()
  mkdirSync(logs, { recursive: true })
  let steps = deps.steps ?? planSteps(selection(o), { logs })
  if (o.only) steps = steps.filter((s) => o.only.has(s.group) || o.only.has(s.id) || (o.prepare && s.group === 'prepare'))
  if (!o.prepare) steps = steps.filter((s) => s.group !== 'prepare')
  console.log(`regression: ${o.full ? 'full' : `what the change from ${o.base} reaches`}, ${o.mode} mode; logs in ${logs}`)
  const durationsPath = deps.durationsPath ?? KEPT_DURATIONS
  const est = estimates(steps, readDurations(o.durations ?? durationsPath))
  const coresPath = deps.coresPath ?? (deps.durationsPath ? join(dirname(deps.durationsPath), 'cores.json') : KEPT_CORES)
  const weight = deps.weight ?? weights(steps, readCores(coresPath))
  printPlan(o, steps, est, o.slots ?? deps.cores ?? CORES, deps.cores ?? CORES, weight)
  if (o.dryRun) return true
  const lockPath = deps.lockPath ?? HEAVY_LOCK
  const claimWhole = o.mode === 'close-out' && !heldByParent(lockPath)
  if (o.mode === 'close-out') {
    // The whole run is one claim on the machine-wide lock: its steps run in parallel inside it, and other heavy work
    // waits. Released on every way out, the 10%-memory stop and Ctrl-C included. Started under a holder's claim
    // (heavy.sh --whole), it runs inside that one.
    if (claimWhole) await takeLock(lockPath, process.pid, 3000, { what: `regression, close-out mode (${o.full ? 'full' : `from ${o.base}`})`, repo: basename(ROOT), say: console.log, whole: true })
    // During the builds, one step at a time: light commands get the floor and the rest of the budget.
    writeLightAllowed(lockPath, lightAllowance({ free: (deps.read ?? freeMemoryPercent)(), memoryHold: false, live: 0, spare: (o.slots ?? deps.cores ?? CORES) - 2, max: o.lightMax }))
    if (!releasedOnExit.has(lockPath)) process.on('exit', () => releaseLock(lockPath))
    releasedOnExit.add(lockPath)
    // The lock's last holder may leave a test run still ending, and a run that skipped the lock may be finishing:
    // wait for it, holding the lock so nothing new starts, before refusing.
    const readBusy = () => otherHeavyRun({ processes: (deps.processes ?? readProcesses)(), self: process.pid })
    let busy = readBusy()
    for (let waited = 0, every = deps.foreignEveryMs ?? 10_000; busy && waited < (deps.foreignWaitMs ?? 300_000); waited += every) {
      if (waited === 0) console.log(`regression: waiting for another heavy run to end — ${busy}`)
      await new Promise((r) => setTimeout(r, every))
      busy = readBusy()
    }
    if (busy) {
      releaseLock(lockPath)
      console.log(`Close-out mode needs the machine to itself, and after five minutes ${busy}. Nothing was started. Run again when it is done, or use --mode shared.`)
      return false
    }
  }
  try {
    return await runAll(o, steps, logs, { ...deps, est, durationsPath, coresPath, weight }, lockPath, o.mode === 'close-out')
  } finally {
    if (claimWhole) releaseLock(lockPath)
  }
}

function printPlan(o, steps, est, slots, cores, weight) {
  if (o.mode === 'shared') {
    for (const g of GROUPS) {
      const ids = steps.filter((s) => s.group === g).map((s) => s.id)
      if (ids.length) console.log(`  ${g}: ${ids.join(', ')}`)
    }
    return
  }
  const prepare = steps.filter((s) => s.group === 'prepare')
  if (prepare.length) console.log(`  first, one after another: ${prepare.map((s) => s.id).join(', ')}`)
  console.log(`  then longest first, within ${slots} slots (a step's slots times its measured weight) while the load is under ${cores}`)
  console.log(`  (a one-slot step up to ${cores * 1.5}) and memory above ${o.minFree}% free,`)
  console.log(`  keeping one slot free for a light command beside it, and giving light commands the slots it cannot use (1 to ${o.lightMax}; none under 30% free memory):`)
  for (const [i, s] of longestFirst(steps.filter((x) => x.group !== 'prepare'), est).entries()) {
    const { min, max } = slotRange(s)
    const slots = min === max ? `${min} slot${min > 1 ? 's' : ''}` : `${min}–${max} slots`
    const sized = s.workers ? ` (${s.stackSlots ? `${s.stackSlots} for its stack, ` : ''}${s.workers[0]}–${s.workers[1]} workers${s.dbWorkers ? ', a test database each' : ''})` : ''
    const w = weight.get(s.id) ?? 1
    console.log(`  ${String(i + 1).padStart(3)}. ${s.id.padEnd(22)} ${s.group.padEnd(12)} ~${String(est.get(s.id)).padStart(4)} s  ${slots}${w > 1 ? ` x${w}` : ''}${sized}${s.lane ? `  after the ${s.lane} steps before it` : ''}`)
  }
}

async function runAll(o, steps, logs, deps, lockPath, wholeClaim) {
  markNeverIndexed(logs)
  const ctx = { mode: o.mode, logs, minFree: o.minFree, base: baseEnv(process.env), records: [], groups: {}, lockPath, wholeClaim, crashed: [],
    readings: { ...(deps.read && { read: deps.read }), ...(deps.swap && { swap: deps.swap }), ...(deps.everyMs && { everyMs: deps.everyMs }) } }
  const watch = new MemoryWatch({ ...(deps.read && { read: deps.read }), ...(deps.everyMs && { everyMs: deps.everyMs }),
    onAbort: (free) => stopRun(`free memory fell to ${free}%`) })
  watch.start()
  writeFileSync(join(logs, 'summary.txt'), '')
  const started = Date.now()
  let ok = await runGroup('prepare', steps, ctx)
  // The run's own database server, for every step after the builds (testdb.mjs); removed on every way out.
  const startDb = deps.testDatabase === undefined ? startTestDatabase : deps.testDatabase
  let testDb = null
  if (ok && startDb && !stopping && steps.some((s) => s.group !== 'prepare')) {
    try {
      testDb = await startDb({ root: ROOT, say: (m) => console.log(m) })
      ctx.base.TEST_DB_SERVER_URL = testDb.url
      process.on('exit', testDb.stop)
    } catch (err) {
      console.log(`the test database server did not start: ${err.message}`)
      ok = false
      stopping = 'no test database server'
    }
  }
  if (ok && o.mode === 'shared') {
    for (const group of GROUPS.filter((g) => g !== 'prepare')) if (!stopping) ok = (await runGroup(group, steps, ctx)) && ok
  } else if (ok) {
    const rest = steps.filter((s) => s.group !== 'prepare')
    ctx.cpu = new CpuMeter({ ...(deps.cpuRead && { read: deps.cpuRead }), ...(deps.everyMs && { everyMs: deps.everyMs }) })
    ctx.cpu.start()
    await schedule(rest, {
      cores: deps.cores ?? CORES, slots: o.slots ?? deps.cores ?? CORES, est: deps.est, lightMax: o.lightMax,
      publishLight: (n) => writeLightAllowed(lockPath, n), holdUnder: o.minFree, maxStacks: o.maxStacks, maxGroups: o.maxGroups,
      read: deps.read ?? freeMemoryPercent, swap: deps.swap ?? swapUsedMb, load: deps.load ?? (() => loadavg()[0]),
      light: deps.light ?? (() => lightSlotsInUse(lockPath)), totalMemMb: totalmem() / 1024 / 1024, everyMs: deps.everyMs ?? 5000,
      isStopped: () => stopping !== null, onAbort: (free) => stopRun(`free memory fell to ${free}%`), say: (m) => console.log(m),
      weight: deps.weight,
      start: (step, workers, slots, declared) => {
        const weighed = declared !== slots ? ` (${declared} declared, weighed ${deps.weight.get(step.id)}x)` : ''
        console.log(`--- start ${step.id}: ${slots} slot(s)${weighed}${workers != null ? `, ${workers} worker(s)` : ''}`)
        return runStep(step, ctx, { workers, slots, declared })
      },
    })
    for (const g of GROUPS.filter((x) => x !== 'prepare')) {
      const mine = ctx.records.filter((r) => r.group === g && !r.notRun)
      if (mine.length) ctx.groups[g] = { ok: mine.every((r) => r.ok), durationMs: Math.max(...mine.map((r) => r.startedAt + r.durationMs)) - Math.min(...mine.map((r) => r.startedAt)) }
    }
    ok = ctx.records.every((r) => r.ok || r.notRun)
    ctx.cpu.stop()
    if (!stopping) {
      writeDurations(deps.durationsPath, ctx.records)
      writeCores(deps.coresPath, ctx.records)
    }
  }
  for (const c of ctx.crashed) if (!stopping) await rerunCrashed(c, ctx)
  watch.stop()
  if (testDb) {
    testDb.stop()
    process.off('exit', testDb.stop)
  }
  const ran = new Set(ctx.records.filter((r) => !r.notRun).map((r) => r.id))
  const notRun = steps.filter((s) => !ran.has(s.id)).map((s) => s.id)
  if (stopping) ok = false
  const lines = [`${ok ? 'PASS' : 'FAIL'}  regression  ${ctx.records.filter((r) => !r.ok && !r.notRun).length} of ${ran.size} steps failed  ${Math.round((Date.now() - started) / 1000)} s`]
  if (stopping) lines.push(`STOPPED  ${stopping}; did not run: ${notRun.join(', ') || 'none'}`)
  for (const line of lines) {
    console.log(line)
    appendFileSync(join(logs, 'summary.txt'), `${line}\n`)
  }
  writeFileSync(join(logs, 'summary.json'), `${JSON.stringify({ ok, mode: o.mode, full: o.full, base: o.base, durationMs: Date.now() - started, stopped: stopping, notRun, groups: ctx.groups, steps: ctx.records.filter((r) => !r.notRun) }, null, 2)}\n`)
  return ok
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit((await main(process.argv.slice(2))) ? 0 : 1)
}
