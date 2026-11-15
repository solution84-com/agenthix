// The runner end to end on tiny fixture steps, with the machine's readings injected: no real load, no suite run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../regression/run.mjs'

const folder = () => mkdtempSync(join(tmpdir(), 'regression-run-'))
const step = (id, script) => ({ id, group: 'units', cwd: '.', cmd: ['node', '-e', script], kind: 'plain' })
const writes = (file, after = '') => `require('fs').writeFileSync(${JSON.stringify(file)}, String(process.pid)); ${after}`
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
const quiet = { processes: () => [], cpuRead: () => [], testDatabase: null, swap: () => null, load: () => 0, light: () => 0, everyMs: 20, reminders: () => [] }

test('close-out mode refuses to start beside another vitest run, and starts nothing', async () => {
  const dir = folder()
  try {
    const marker = join(dir, 'ran')
    const ok = await main(['--logs', join(dir, 'logs')], {
      ...quiet, lockPath: join(dir, 'heavy.lock'), durationsPath: join(dir, 'd.json'), read: () => 80, steps: [step('one', writes(marker))],
      processes: () => [{ pid: 999_999, ppid: 1, command: 'node /elsewhere/node_modules/.bin/vitest run' }], foreignWaitMs: 60, foreignEveryMs: 20,
    })
    assert.equal(ok, false)
    assert.equal(existsSync(marker), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('close-out mode waits for another heavy run that is ending, then starts', async () => {
  const dir = folder()
  try {
    const marker = join(dir, 'ran')
    let reads = 0
    const ok = await main(['--logs', join(dir, 'logs')], {
      ...quiet, lockPath: join(dir, 'heavy.lock'), durationsPath: join(dir, 'd.json'), read: () => 80, steps: [step('one', writes(marker))],
      processes: () => (reads++ < 2 ? [{ pid: 999_999, ppid: 1, command: 'node /elsewhere/node_modules/.bin/playwright test' }] : []),
      foreignWaitMs: 1000, foreignEveryMs: 20,
    })
    assert.equal(ok, true)
    assert.equal(existsSync(marker), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('close-out mode claims the heavy lock for the whole run, waiting while another process holds it, and releases it', async () => {
  const dir = folder()
  const lock = join(dir, 'heavy.lock')
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'])
  try {
    mkdirSync(lock)
    writeFileSync(join(lock, 'pid'), String(holder.pid))
    setTimeout(() => holder.kill(), 300)
    const seen = join(dir, 'seen')
    const copy = `require('fs').writeFileSync(${JSON.stringify(seen)}, require('fs').readFileSync(${JSON.stringify(join(lock, 'pid'))}, 'utf8') + ' ' + process.env.HEAVY_LOCK_HELD + ' ' + require('fs').existsSync(${JSON.stringify(join(lock, 'whole'))}) + ' ' + require('fs').readFileSync(${JSON.stringify(join(lock, 'light-allowed'))}, 'utf8').trim())`
    const ok = await main(['--logs', join(dir, 'logs')], {
      ...quiet, lockPath: lock, read: () => 80, steps: [step('one', copy), step('two', copy)], durationsPath: join(dir, 'durations.json'), cores: 10,
    })
    assert.equal(ok, true)
    assert.equal(readFileSync(seen, 'utf8'), `${process.pid}\n ${lock} true 4`)
    assert.equal(existsSync(lock), false)
  } finally {
    holder.kill()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a step waits while free memory is under a quarter, then runs', async () => {
  const dir = folder()
  try {
    const marker = join(dir, 'ran')
    const readings = [20, 20, 20]
    const ok = await main(['--logs', join(dir, 'logs')], { ...quiet, lockPath: join(dir, 'heavy.lock'), durationsPath: join(dir, 'd.json'), read: () => readings.shift() ?? 60, steps: [step('one', writes(marker))] })
    assert.equal(ok, true)
    assert.ok(existsSync(marker))
    assert.deepEqual(readings, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('under a tenth free mid-run, the run stops its steps, says which did not run, and fails', async () => {
  const dir = folder()
  try {
    const pidFile = join(dir, 'pid')
    const started = Date.now()
    const ok = await main(['--logs', join(dir, 'logs')], {
      ...quiet, lockPath: join(dir, 'heavy.lock'), cores: 1, durationsPath: join(dir, 'd.json'),
      read: () => (existsSync(pidFile) && Date.now() - started > 300 ? 5 : 60),
      steps: [step('long', writes(pidFile, 'setTimeout(() => {}, 30000)')), step('after', writes(join(dir, 'after')))],
    })
    assert.equal(ok, false)
    const pid = Number(readFileSync(pidFile, 'utf8'))
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(alive(pid), false)
    assert.equal(existsSync(join(dir, 'after')), false)
    const summary = JSON.parse(readFileSync(join(dir, 'logs', 'summary.json'), 'utf8'))
    assert.match(summary.stopped, /free memory fell to 5%/)
    assert.deepEqual(summary.notRun, ['after'])
    assert.equal(existsSync(join(dir, 'heavy.lock')), false)
    assert.match(readFileSync(join(dir, 'logs', 'summary.txt'), 'utf8'), /STOPPED .*did not run: after/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('close-out starts the longest steps first, sizes them from the free slots, keeps their durations, and holds on the load', async () => {
  const dir = folder()
  try {
    const order = join(dir, 'order')
    const appends = (id) => `require('fs').appendFileSync(${JSON.stringify(order)}, ${JSON.stringify(id)} + ':' + process.env.VITEST_MAX_WORKERS + ' ')`
    const durationsPath = join(dir, 'durations.json')
    writeFileSync(durationsPath, JSON.stringify({ short: 1, long: 50 }))
    let load = 20
    const t0 = Date.now()
    setTimeout(() => { load = 1 }, 150)
    const steps = [
      { ...step('short', appends('short')), slots: 1 },
      { ...step('long', `${appends('long')}; setTimeout(() => {}, 200)`), workers: [1, 3] },
    ]
    const ok = await main(['--logs', join(dir, 'logs')], { ...quiet, load: () => load, cores: 4, lockPath: join(dir, 'heavy.lock'), read: () => 80, steps, durationsPath })
    assert.equal(ok, true)
    assert.equal(readFileSync(order, 'utf8'), 'long:3 short:1 ')
    const summary = JSON.parse(readFileSync(join(dir, 'logs', 'summary.json'), 'utf8'))
    assert.deepEqual(summary.steps.map((s) => [s.id, s.slots, s.workers]).sort(), [['long', 3, 3], ['short', 1, undefined]])
    assert.ok(summary.steps.every((s) => s.startedAt >= t0 + 140), 'nothing starts while the load is above the processors')
    const kept = JSON.parse(readFileSync(durationsPath, 'utf8'))
    assert.ok(kept.long >= 0 && kept.short >= 0)
    assert.ok(existsSync(join(dir, 'logs', '.metadata_never_index')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a step that ends with no test report runs again whole, alone, at the end, and says how it went', async () => {
  const dir = folder()
  try {
    const first = join(dir, 'first-done')
    // Crashes the first time (exit 1, no report); the second time writes a passing report where it was told to.
    const script = `const fs = require('fs'); const out = process.argv.find((a) => a.startsWith('--outputFile.json='))?.split('=')[1];
      if (!fs.existsSync(${JSON.stringify(first)})) { fs.writeFileSync(${JSON.stringify(first)}, ''); process.exit(1) }
      fs.writeFileSync(out, JSON.stringify({ numPassedTests: 3, numFailedTests: 0, testResults: [] }))`
    const crashy = { id: 'crashy', group: 'integration', cwd: '.', cmd: ['node', '-e', script, '--'], kind: 'vitest' }
    const logs = join(dir, 'logs')
    const ok = await main(['--logs', logs], { ...quiet, lockPath: join(dir, 'heavy.lock'), durationsPath: join(dir, 'd.json'), read: () => 80, steps: [crashy, step('other', '')] })
    assert.equal(ok, false)
    const summary = readFileSync(join(logs, 'summary.txt'), 'utf8')
    assert.match(summary, /RERUN crashy {2}ended with exit 1 and no test report; run again whole, alone: passes alone/)
    const record = JSON.parse(readFileSync(join(logs, 'summary.json'), 'utf8')).steps.find((s) => s.id === 'crashy')
    assert.equal(record.wholeRerun.verdict, 'passes alone')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the repository's reminders are the first lines of the run's output", async () => {
  const dir = folder()
  const said = []
  const log = console.log
  console.log = (line) => said.push(String(line))
  try {
    const ok = await main(['--logs', join(dir, 'logs'), '--dry-run'], { ...quiet, reminders: () => ['The monthly dependency updates are due.'], steps: [step('one', '')] })
    assert.equal(ok, true)
    assert.equal(said[0], 'The monthly dependency updates are due.')
    assert.match(said[1], /^regression: /)
  } finally {
    console.log = log
    rmSync(dir, { recursive: true, force: true })
  }
})
