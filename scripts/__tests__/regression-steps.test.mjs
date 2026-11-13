import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GROUPS, baseEnv, fullSelection, planSteps, selectionFromAffected } from '../regression/steps.mjs'
import { heldByParent, lightSlotsInUse, limiter, markNeverIndexed, writeLightAllowed, parseFreeMemory, parseSwapUsedMb, readLockHolder, releaseLock, takeLock, waitForMemory } from '../regression/machine.mjs'
import { seededVariables } from '../regression/e2e-stack.mjs'
import { dropStatement, stackDatabaseNames, withDatabase } from '../regression/stack.mjs'

const ids = (steps, group) => steps.filter((s) => (group ? s.group === group : true)).map((s) => s.id)
const affected = (selected) => ({ selected })

test('the full regression runs every suite, the end-to-end and cross-app suites twice, once with every flag on', () => {
  const steps = planSteps(fullSelection(), { logs: '/logs' })
  for (const id of ['core-test', 'hq-typecheck', 'hq-test', 'ui-typecheck', 'site-integration', 'hq-integration', 'images',
    'install-test', 'site-container', 'host-container', 'cross-app', 'cross-app-all-flags', 'e2e', 'e2e-all-flags']) {
    assert.ok(ids(steps).includes(id), id)
  }
  assert.equal(steps.find((s) => s.id === 'cross-app-all-flags').env.TEST_ALL_FEATURES, '1')
  assert.deepEqual(steps.find((s) => s.id === 'e2e-all-flags').cmd.slice(2, 4), ['--flags', 'all'])
  assert.ok(steps.every((s) => GROUPS.includes(s.group)))
})

test('every step declares its slots: Vitest and e2e steps sized by workers, the Docker steps one lane', () => {
  const steps = planSteps(fullSelection(), { logs: '/logs' })
  const by = (id) => steps.find((s) => s.id === id)
  assert.deepEqual(by('hq-integration').workers, [2, 8])
  assert.equal(by('hq-integration').dbWorkers, true)
  assert.deepEqual(by('e2e').workers, [2, 3])
  assert.equal(by('e2e').stackSlots, 1)
  assert.equal(by('cross-app').slots, 2)
  assert.deepEqual(by('core-test').workers, [1, 4])
  assert.deepEqual(steps.filter((s) => s.lane === 'docker').map((s) => s.id), ['images', 'install-test', 'host-container', 'site-container'])
  assert.equal(by('site-container').workers, undefined)
  for (const s of steps) assert.ok(s.workers ? s.workers[0] >= 1 && s.workers[1] >= s.workers[0] : (s.slots ?? 1) >= 1, s.id)
})

test('only hq integration is given a secrets key, and the cross-app runs use the builds prepare made', () => {
  const steps = planSteps(fullSelection(), { logs: '/logs' })
  assert.deepEqual(steps.filter((s) => s.secretsKey).map((s) => s.id), ['hq-integration'])
  for (const s of steps.filter((s) => s.kind === 'chain')) {
    assert.equal(s.env.CROSSAPP_PREBUILT, '1')
    assert.equal(s.env.CROSSAPP_DB_CONNECTION_LIMIT, '5')
  }
  assert.ok(ids(steps, 'prepare').indexOf('core-build') < ids(steps, 'prepare').indexOf('hq-build'))
})

test('a change to site alone runs site and its dependents, its integration and the cross-app suite, not the browser tests', () => {
  const sel = selectionFromAffected(affected(['secure-page', 'site', 'site-integration']))
  const steps = planSteps(sel, { logs: '/logs' })
  assert.deepEqual(ids(steps, 'integration'), ['site-integration'])
  assert.ok(ids(steps).includes('cross-app'))
  assert.ok(!ids(steps).includes('e2e'))
  assert.ok(!ids(steps).includes('cross-app-all-flags'))
  assert.ok(!ids(steps).includes('hq-test'))
  assert.deepEqual(ids(steps, 'docker'), [])
})

test('a change to ui runs the browser tests once, as shipped, and no cross-app suite', () => {
  const steps = planSteps(selectionFromAffected(affected(['secure-page', 'ui', 'hq', 'hq-integration', 'console-web'])), { logs: '/l' })
  assert.deepEqual(ids(steps, 'stacks'), ['cross-app', 'e2e'])
  const ui = planSteps(selectionFromAffected(affected(['ui'])), { logs: '/l' })
  assert.deepEqual(ids(ui, 'stacks'), ['e2e'])
})

test('changed image parts are start-tested, then the install test runs', () => {
  const steps = planSteps(selectionFromAffected(affected(['relay']), { staleImageParts: ['relay'] }), { logs: '/l' })
  assert.deepEqual(ids(steps, 'docker'), ['images', 'install-test'])
  assert.deepEqual(steps.find((s) => s.id === 'images').cmd, ['scripts/images/start-test-all.sh', 'relay'])
})

test("no step inherits the caller's secrets key, flag switch or run state", () => {
  const env = baseEnv({ PATH: '/bin', SECRETS_MASTER_KEY: 'k', TEST_ALL_FEATURES: '1', CROSSAPP_PORTS: '1,2', E2E_TASK_KEY: 'x', VITEST_MAX_WORKERS: '1', DATABASE_URL: 'u' })
  assert.deepEqual(env, { PATH: '/bin', DATABASE_URL: 'u' })
})

test('reads free memory on macOS and Linux', () => {
  assert.equal(parseFreeMemory('System-wide memory free percentage: 69%'), 69)
  assert.equal(parseFreeMemory('MemTotal:  1000 kB\nMemFree: 1 kB\nMemAvailable:   250 kB\n'), 25)
  assert.equal(parseFreeMemory('nothing'), null)
})

test('a group waits while free memory is low or swap is growing, and starts once neither holds', async () => {
  const readings = [10, 15, 40, 40]
  const swaps = [1000, 1000, 1000, 1500, 1500]
  const said = []
  assert.equal(await waitForMemory(25, { read: () => readings.shift(), swap: () => swaps.shift(), say: (m) => said.push(m), everyMs: 1 }), 'go')
  assert.deepEqual(readings, [])
  assert.match(said[0], /under 25%/)
  assert.equal(await waitForMemory(25, { read: () => null, swap: () => null, say: () => {}, everyMs: 1 }), 'go')
  assert.equal(await waitForMemory(25, { read: () => 5, swap: () => null, say: () => {}, everyMs: 1 }), 'abort')
})

test('reads swap in use on macOS and Linux', () => {
  assert.equal(parseSwapUsedMb('vm.swapusage: total = 9216.00M  used = 7417.56M  free = 1798.44M  (encrypted)'), 7417.56)
  assert.equal(parseSwapUsedMb('SwapTotal: 2097152 kB\nSwapFree: 1048576 kB\n'), 1024)
})

test('a limiter runs at most its limit at once', async () => {
  const limit = limiter(2)
  let active = 0
  let most = 0
  await Promise.all([1, 2, 3, 4, 5].map(() => limit(async () => {
    active++
    most = Math.max(most, active)
    await new Promise((r) => setTimeout(r, 5))
    active--
  })))
  assert.equal(most, 2)
})

test('the heavy lock says who holds it in the files heavy.sh reads, and a waiter says so', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'regression-lock-'))
  const lock = join(dir, 'heavy.lock')
  try {
    await takeLock(lock, process.pid, 5, { what: 'regression, close-out mode (full)', repo: 'agenthix' })
    const holder = readLockHolder(lock)
    assert.equal(holder.pid, process.pid)
    assert.equal(holder.repo, 'agenthix')
    assert.equal(holder.what, 'regression, close-out mode (full)')
    assert.match(holder.since, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    const said = []
    const waiting = takeLock(lock, process.pid, 5, { say: (m) => said.push(m) })
    await new Promise((r) => setTimeout(r, 30))
    assert.match(said[0], /^waiting — the machine's heavy lock is held by pid \d+ — agenthix: regression, close-out mode \(full\), since /)
    releaseLock(lock, process.pid)
    await waiting
    releaseLock(lock, process.pid)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a whole run marks its claim, and counts the light commands beside it whose process lives', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'regression-lock-'))
  const lock = join(dir, 'heavy.lock')
  try {
    await takeLock(lock, process.pid, 5, { what: 'regression', whole: true })
    assert.ok(existsSync(join(lock, 'whole')))
    assert.equal(lightSlotsInUse(lock), 0)
    mkdirSync(join(lock, 'light', '1'), { recursive: true })
    writeFileSync(join(lock, 'light', '1', 'pid'), `${process.pid}\n`)
    mkdirSync(join(lock, 'light', '2'))
    writeFileSync(join(lock, 'light', '2', 'pid'), '2147483646')
    assert.equal(lightSlotsInUse(lock), 1)
    writeLightAllowed(lock, 3)
    writeLightAllowed(lock, 2)
    assert.equal(readFileSync(join(lock, 'light-allowed'), 'utf8'), '2\n')
    assert.deepEqual(readdirSync(lock).filter((n) => n.includes('light-allowed')), ['light-allowed'])
    releaseLock(lock, process.pid)
    assert.equal(lightSlotsInUse(lock), 0)
    await takeLock(lock, process.pid, 5, { what: 'one step' })
    assert.equal(existsSync(join(lock, 'whole')), false)
    releaseLock(lock, process.pid)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the run's folders are kept out of Spotlight's index", () => {
  const dir = mkdtempSync(join(tmpdir(), 'regression-index-'))
  try {
    markNeverIndexed(join(dir, 'logs'))
    assert.ok(existsSync(join(dir, 'logs', '.metadata_never_index')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a run started under a holder of the same lock is inside its claim', () => {
  assert.equal(heldByParent('/tmp/l', { HEAVY_LOCK_HELD: '/tmp/l' }), true)
  assert.equal(heldByParent('/tmp/l', { HEAVY_LOCK_HELD: '/tmp/other' }), false)
  assert.equal(heldByParent('/tmp/l', {}), false)
})

test('the heavy lock is taken, waited for, taken over from a holder that is gone, and released', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'regression-lock-'))
  const lock = join(dir, 'heavy.lock')
  try {
    await takeLock(lock, process.pid)
    let second = false
    const waiting = takeLock(lock, process.pid + 0, 5).then(() => { second = true })
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(second, false)
    releaseLock(lock, process.pid)
    await waiting
    releaseLock(lock, process.pid)
    mkdirSync(lock)
    writeFileSync(join(lock, 'pid'), '2147483646')
    await takeLock(lock, process.pid, 5)
    releaseLock(lock, process.pid)
    assert.equal(existsSync(lock), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a seed's printed variables are read, with or without export", () => {
  assert.deepEqual(seededVariables('org: created\nE2E_CONVERSATION_ID=c1\nexport E2E_FILES_FOLDER=e2e-files\n# E2E_WORKSPACE_ID left unset\nOTHER=x'),
    { E2E_CONVERSATION_ID: 'c1', E2E_FILES_FOLDER: 'e2e-files' })
})

test("an e2e run's databases are its own, and nothing else is ever dropped", () => {
  const names = stackDatabaseNames('abc123')
  assert.deepEqual(names, { hq: 'agenthix_eabc123_test', site: 'agenthix_site_eabc123_test' })
  assert.throws(() => stackDatabaseNames('A"; x'), /refusing/)
  assert.match(dropStatement(names.site), /^DROP DATABASE IF EXISTS "agenthix_site_eabc123_test" WITH \(FORCE\)$/)
  for (const name of ['agenthix', 'agenthix_test', 'agenthix_site', 'agenthix_xabc123_test']) assert.throws(() => dropStatement(name), /refusing/)
  assert.equal(withDatabase('postgresql://u:p@localhost:5/agenthix', names.hq), 'postgresql://u:p@127.0.0.1:5/agenthix_eabc123_test')
  assert.equal(withDatabase('postgresql://u:p@localhost:5/agenthix', names.hq, 5), 'postgresql://u:p@127.0.0.1:5/agenthix_eabc123_test?connection_limit=5')
})
