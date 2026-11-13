// The close-out scheduler with every reading injected: longest first, a live budget of slots, load and memory, and
// steps sized when they start.
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { estimates, lightAllowance, longestFirst, machineVerdict, pickNext, readCores, readDurations, schedule, sizeStep, weights, writeCores, writeDurations } from '../regression/schedule.mjs'
import { fullSelection, planSteps } from '../regression/steps.mjs'

const fixed = (id, slots = 1, extra = {}) => ({ id, group: 'units', slots, ...extra })
const sized = (id, min, max, extra = {}) => ({ id, group: 'units', workers: [min, max], ...extra })
const est = (table) => new Map(Object.entries(table))

test('estimates come from the last run, else the committed table, else a few seconds', () => {
  const steps = [fixed('hq-integration'), fixed('images'), fixed('new-step')]
  const e = estimates(steps, { images: 300 })
  assert.equal(e.get('images'), 300)
  assert.equal(e.get('hq-integration'), 1621)
  assert.equal(e.get('new-step'), 5)
})

test('the durations kept are read from a kept file or a run summary, and only passing steps overwrite them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regression-durations-'))
  try {
    const kept = join(dir, 'cache', 'durations.json')
    assert.deepEqual(readDurations(kept), {})
    writeDurations(kept, [{ id: 'a', ok: true, durationMs: 61_400 }, { id: 'b', ok: false, durationMs: 5000 }])
    writeDurations(kept, [{ id: 'c', ok: true, durationMs: 2000 }])
    assert.deepEqual(readDurations(kept), { a: 61, c: 2 })
    // Slowed beside other steps, a duration rises by a quarter at most; a faster run is kept as it is.
    writeDurations(kept, [{ id: 'a', ok: true, durationMs: 200_000 }, { id: 'c', ok: true, durationMs: 1000 }])
    assert.deepEqual(readDurations(kept), { a: 76, c: 1 })
    const summary = join(dir, 'summary.json')
    writeFileSync(summary, JSON.stringify({ steps: [{ id: 'x', ok: true, durationMs: 9_000 }, { id: 'y', ok: false, durationMs: 1 }] }))
    assert.deepEqual(readDurations(summary), { x: 9 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the full regression starts hq integration first and the image start test second', () => {
  const steps = planSteps(fullSelection(), { logs: '/l' }).filter((s) => s.group !== 'prepare')
  const order = longestFirst(steps, estimates(steps)).map((s) => s.id)
  assert.deepEqual(order.slice(0, 2), ['hq-integration', 'images'])
  // A lane's steps keep the plan's order: the install test after the images it installs.
  assert.ok(order.indexOf('images') < order.indexOf('install-test'))
  assert.ok(order.indexOf('install-test') < order.indexOf('host-container'))
})

test('a step sized with the machine mostly free gets the free slots up to its most; one that does not fit waits', () => {
  assert.deepEqual(sizeStep(sized('hq-integration', 2, 6), 10), { slots: 6, declared: 6, workers: 6 })
  assert.deepEqual(sizeStep(sized('hq-integration', 2, 6), 3), { slots: 3, declared: 3, workers: 3 })
  assert.equal(sizeStep(sized('hq-integration', 2, 6), 1), null)
  assert.deepEqual(sizeStep({ id: 'e2e', workers: [2, 3], stackSlots: 1 }, 10), { slots: 4, declared: 4, workers: 3 })
  assert.deepEqual(sizeStep({ id: 'e2e', workers: [2, 3], stackSlots: 1 }, 3), { slots: 3, declared: 3, workers: 2 })
  assert.deepEqual(sizeStep(fixed('images', 3), 5), { slots: 3, declared: 3, workers: null })
  // Weighed three times, an e2e run of three declared slots takes nine.
  assert.deepEqual(sizeStep({ id: 'e2e', workers: [2, 3], stackSlots: 1 }, 10, 3), { slots: 9, declared: 3, workers: 2 })
  assert.equal(sizeStep({ id: 'e2e', workers: [2, 3], stackSlots: 1 }, 8, 3), null)
})

test('the next step is the longest that fits; a smaller one goes when the longest does not', () => {
  const long = sized('long', 4, 4)
  const short = fixed('short')
  const e = est({ long: 500, short: 10 })
  assert.equal(pickNext({ pending: [short, long], running: [], est: e, free: 10 }).step, long)
  assert.equal(pickNext({ pending: [short, long], running: [], est: e, free: 2 }).step, short)
  assert.equal(pickNext({ pending: [long], running: [], est: e, free: 2 }), null)
})

test('a lane runs one step at a time, in order; the ceilings hold stacks and groups', () => {
  const a = fixed('a', 1, { lane: 'docker' })
  const b = fixed('b', 1, { lane: 'docker' })
  const e = est({ a: 1, b: 100, c: 1 })
  assert.equal(pickNext({ pending: [a, b], running: [], est: e, free: 10 }).step, a)
  assert.equal(pickNext({ pending: [b], running: [a], est: e, free: 10 }), null)
  const stack = { id: 's2', group: 'stacks', kind: 'stack', slots: 1 }
  const running = [{ id: 's1', group: 'stacks', kind: 'chain' }]
  assert.equal(pickNext({ pending: [stack], running, est: est({ s2: 1 }), free: 10, maxStacks: 1 }), null)
  assert.equal(pickNext({ pending: [stack], running, est: est({ s2: 1 }), free: 10, maxStacks: 2 }).step, stack)
  const other = { id: 'c', group: 'docker', slots: 1 }
  assert.equal(pickNext({ pending: [other], running, est: e, free: 10, maxGroups: 1 }), null)
})

test('a start holds while the load is at the processor count, memory is under its floor or swap grows', () => {
  const base = { free: 60, swapNow: 100, swapBefore: 100, load: 3, cores: 10, holdUnder: 25 }
  assert.equal(machineVerdict(base).verdict, 'go')
  assert.match(machineVerdict({ ...base, load: 10.2 }).why, /load 10\.2 on 10/)
  assert.equal(machineVerdict({ ...base, free: 24 }).verdict, 'hold')
  assert.equal(machineVerdict({ ...base, swapNow: 400 }).verdict, 'hold')
  assert.equal(machineVerdict({ ...base, free: 8 }).verdict, 'abort')
  assert.equal(machineVerdict({ ...base, load: null, free: null, swapNow: null }).verdict, 'go')
  // Light commands beside the run count as memory taken: two of 1 GB on a 16 GB machine take 12.5%.
  assert.equal(machineVerdict({ ...base, free: 36, light: 2, totalMemMb: 16384 }).verdict, 'hold')
  assert.equal(machineVerdict({ ...base, free: 40, light: 2, totalMemMb: 16384 }).verdict, 'go')
})

// Every scheduler a test started is stopped after it, so a failed assertion cannot leave its loop running.
const harnesses = []
afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    h.machine.stopped = true
    for (const f of h.finish.values()) f()
    await h.done
  }
})

/** Runs the scheduler on fake steps that finish when the test says; returns what started, in order, with its size. */
function harness({ steps, cores = 10, slots, readings = {}, everyMs = 2, lightMax }) {
  const started = []
  const allowed = []
  const finish = new Map()
  const machine = { free: 60, swap: 0, load: 0, light: 0, ...readings }
  const done = schedule(steps, {
    cores, slots, est: estimates(steps), holdUnder: 25, everyMs, lightMax, isStopped: () => machine.stopped === true, publishLight: (n) => allowed.push(n),
    read: () => machine.free, swap: () => (machine.swapGrows ? (machine.swap += 200) : machine.swap), load: () => machine.load, light: () => machine.light, totalMemMb: 16384,
    start: (step, workers, slotsTaken) => {
      started.push({ id: step.id, workers, slots: slotsTaken })
      return new Promise((r) => finish.set(step.id, r))
    },
  })
  const h = { started, finish, machine, done, allowed }
  harnesses.push(h)
  return h
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const ids = (started) => started.map((s) => s.id)

test('starts longest first within the slots, and starts more as slots free up', async () => {
  // No light commands allowed, so that only the run's own steps share the slots (the reservation is tested below).
  const h = harness({ steps: [fixed('small', 1), sized('hq-integration', 2, 6), fixed('images', 3), sized('e2e', 2, 3, { stackSlots: 1 })], lightMax: 0 })
  await tick()
  // hq integration takes six, the images three, the last slot goes to the small step; the e2e run (three at least) waits.
  assert.deepEqual(h.started, [
    { id: 'hq-integration', workers: 6, slots: 6 }, { id: 'images', workers: null, slots: 3 }, { id: 'small', workers: null, slots: 1 },
  ])
  h.finish.get('images')()
  await tick()
  assert.deepEqual(h.started.at(-1), { id: 'e2e', workers: 2, slots: 3 })
  for (const f of h.finish.values()) f()
  assert.deepEqual(await h.done, [])
})

test('holds every start while the load is over one and a half times the processors, and starts again when it falls', async () => {
  const h = harness({ steps: [fixed('a'), fixed('b')], readings: { load: 16 } })
  await tick()
  assert.deepEqual(h.started, [])
  h.machine.load = 4
  await tick()
  assert.deepEqual(ids(h.started), ['a', 'b'])
  for (const f of h.finish.values()) f()
  await h.done
})

test('over the processor count, only steps of one slot start; a larger one waits for the load to fall', async () => {
  const h = harness({ steps: [fixed('big', 3), fixed('a'), fixed('b')], readings: { load: 12 } })
  await tick()
  assert.deepEqual(ids(h.started), ['a', 'b'])
  h.machine.load = 4
  await tick()
  assert.deepEqual(ids(h.started), ['a', 'b', 'big'])
  for (const f of h.finish.values()) f()
  await h.done
})

test('a weighed step takes its declared slots times its weight from the budget', async () => {
  const steps = [sized('hq-integration', 2, 6), sized('e2e', 2, 3, { stackSlots: 1 }), fixed('small')]
  const started = []
  const finish = new Map()
  const done = schedule(steps, {
    cores: 10, est: estimates(steps), holdUnder: 25, everyMs: 2, lightMax: 0, read: () => 60, swap: () => 0, load: () => 0,
    weight: new Map([['e2e', 3]]),
    start: (step, workers, slots, declared) => { started.push({ id: step.id, workers, slots, declared }); return new Promise((r) => finish.set(step.id, r)) },
  })
  await tick()
  // hq integration takes six; the e2e run's least is 3 slots x3 = 9, which does not fit in four, so the small step goes.
  assert.deepEqual(started.map((s) => s.id), ['hq-integration', 'small'])
  finish.get('hq-integration')()
  await tick()
  assert.deepEqual(started.at(-1), { id: 'e2e', workers: 2, slots: 9, declared: 3 })
  for (const f of finish.values()) f()
  await done
})

test('weights come from the measured processors per declared slot, else the table, between 1 and 3', () => {
  const steps = [fixed('a'), fixed('b'), fixed('e2e'), fixed('c'), fixed('d')]
  const w = weights(steps, { a: { cores: 5, slots: 2 }, b: { cores: 0.4, slots: 2 }, d: { cores: 40, slots: 2 } })
  assert.equal(w.get('a'), 2.5)
  assert.equal(w.get('b'), 1)
  assert.equal(w.get('e2e'), 2)
  assert.equal(w.get('c'), 1)
  assert.equal(w.get('d'), 3)
})

test('the processors kept are a measured step\'s, run for a minute at least', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regression-cores-'))
  try {
    const kept = join(dir, 'cores.json')
    writeCores(kept, [{ id: 'a', cpu: { cores: 4.2, peak: 6 }, declaredSlots: 2, durationMs: 90_000 }, { id: 'b', cpu: { cores: 1, peak: 1 }, declaredSlots: 1, durationMs: 5_000 }, { id: 'c', durationMs: 90_000 }])
    assert.deepEqual(readCores(kept), { a: { cores: 4.2, slots: 2 } })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('holds while free memory is under its floor or swap grows', async () => {
  const h = harness({ steps: [fixed('a')], readings: { free: 20 } })
  await tick()
  assert.deepEqual(h.started, [])
  h.machine.swapGrows = true
  h.machine.free = 50
  await tick()
  assert.deepEqual(h.started, [])
  h.machine.swapGrows = false
  await tick()
  assert.deepEqual(ids(h.started), ['a'])
  h.finish.get('a')()
  await h.done
})

test('a light command beside the run takes a slot of the budget', async () => {
  const h = harness({ steps: [sized('suite', 2, 4)], cores: 4, readings: { light: 2 } })
  await tick()
  assert.deepEqual(h.started, [{ id: 'suite', workers: 2, slots: 2 }])
  h.finish.get('suite')()
  await h.done
  const full = harness({ steps: [fixed('two', 2)], cores: 2, readings: { light: 1 } })
  await tick()
  assert.deepEqual(full.started, [])
  full.machine.light = 0
  await tick()
  assert.deepEqual(ids(full.started), ['two'])
  full.finish.get('two')()
  await full.done
})

test('a budget of more slots than processors still holds on the load', async () => {
  const h = harness({ steps: [fixed('a', 6), fixed('b', 6)], cores: 10, slots: 12, lightMax: 0 })
  await tick()
  assert.deepEqual(ids(h.started), ['a', 'b'])
  for (const f of h.finish.values()) f()
  await h.done
})

test('light commands allowed: those running, the floor and the spare slots, between 1 and the ceiling; 0 under 30% free', () => {
  assert.equal(lightAllowance({ free: 60, memoryHold: false, live: 0, spare: 0 }), 1)
  assert.equal(lightAllowance({ free: 60, memoryHold: false, live: 0, spare: -3 }), 1)
  assert.equal(lightAllowance({ free: 60, memoryHold: false, live: 1, spare: 1 }), 3)
  assert.equal(lightAllowance({ free: 60, memoryHold: false, live: 0, spare: 9 }), 4)
  assert.equal(lightAllowance({ free: 60, memoryHold: false, live: 0, spare: 9, max: 2 }), 2)
  assert.equal(lightAllowance({ free: 60, memoryHold: false, live: 0, spare: 9, max: 0 }), 0)
  assert.equal(lightAllowance({ free: 29, memoryHold: false, live: 0, spare: 9 }), 0)
  assert.equal(lightAllowance({ free: 60, memoryHold: true, live: 0, spare: 9 }), 0)
  assert.equal(lightAllowance({ free: null, memoryHold: false, live: 0, spare: 1 }), 2)
})

test('at a full budget the floor is still allowed, and none under 30% free memory', async () => {
  const h = harness({ steps: [fixed('ten', 10)], cores: 10 })
  await tick()
  // A step may always start when nothing of the run's runs, else one as big as the budget would never start.
  assert.deepEqual(ids(h.started), ['ten'])
  assert.equal(h.allowed.at(-1), 1)
  h.machine.free = 28
  await tick()
  assert.equal(h.allowed.at(-1), 0)
  h.machine.free = 60
  await tick()
  assert.equal(h.allowed.at(-1), 1)
})

test('the floor is kept free: it holds a step that would otherwise fit', async () => {
  const h = harness({ steps: [fixed('six', 6), fixed('four', 4)], cores: 10 })
  await tick()
  assert.deepEqual(ids(h.started), ['six'])
  const off = harness({ steps: [fixed('six', 6), fixed('four', 4)], cores: 10, lightMax: 0 })
  await tick()
  assert.deepEqual(ids(off.started), ['six', 'four'])
  assert.equal(off.allowed.at(-1), 0)
})

test('a ready step starts before the allowance grows; the allowance grows when nothing of the run fits', async () => {
  const fits = harness({ steps: [fixed('six', 6), fixed('three', 3)], cores: 10 })
  await tick()
  assert.deepEqual(ids(fits.started), ['six', 'three'])
  assert.ok(fits.allowed.every((n) => n === 1), `allowed ${fits.allowed}`)
  const waits = harness({ steps: [fixed('six', 6), fixed('five', 5)], cores: 10 })
  await tick()
  // The step of five does not fit in the three slots left beside the floor: those three go to light commands.
  assert.deepEqual(ids(waits.started), ['six'])
  assert.equal(waits.allowed.at(-1), 4)
  waits.machine.light = 2
  await tick()
  assert.equal(waits.allowed.at(-1), 4)
  const capped = harness({ steps: [fixed('six', 6), fixed('five', 5)], cores: 10, lightMax: 2 })
  await tick()
  assert.equal(capped.allowed.at(-1), 2)
})
