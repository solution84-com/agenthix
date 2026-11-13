// How close-out mode fills the machine while it holds the heavy lock (everything else waits behind it, so it should
// finish as fast as it safely can). Steps start longest first. A live budget decides when the next one starts: only
// while the 1-minute load is under the processor count, free memory is above its floor and swap is not growing, and
// only when the step's slots fit beside the slots of the steps running (and the light commands heavy.sh lets run beside
// the run). A step is sized when it starts: a Vitest step gets as many workers as there are free slots, up to its most.
//
// A step's slots (steps.mjs declares them): `slots` for a step of fixed weight (1 when unsaid); `workers: [min, max]`
// for a step sized at its start, whose slots are its workers plus `stackSlots` (the servers of an e2e run's stack).
// Steps with the same `lane` run one after another, in the plan's order (the Docker steps build on each other's
// images). Every reading is passed in, so the tests need no real load.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { memoryVerdict } from './guard.mjs'

// Seconds each step took in the first close-out run (13 Nov, 10 cores), for ordering when no run on this checkout has
// recorded its own. hq integration ran there with two workers; only the order matters.
export const DEFAULT_SECONDS = {
  'hq-integration': 1621, images: 549, 'e2e-all-flags': 506, e2e: 498, 'hq-test': 426, 'cross-app': 281,
  'cross-app-all-flags': 275, 'site-container': 266, 'hq-typecheck': 111, 'host-container': 95, 'host-test': 94,
  'site-test': 87, 'console-web-test': 73, 'install-test': 40, 'ui-test': 27, 'core-test': 18, 'console-test': 12,
  'site-integration': 7, 'relay-test': 5,
}
const UNKNOWN_SECONDS = 5
// What one light command beside the run (heavy --light) is counted as: a slot of processor, and about this much memory.
export const LIGHT_SLOT_MB = 1024
// Light commands are allowed only while at least this much memory is free (heavy.sh holds them under it too).
export const LIGHT_MIN_FREE = 30
export const LIGHT_MAX = 4

/** Each step's expected seconds: the last recorded run's, else the committed table's, else a few seconds. */
export function estimates(steps, last = {}) {
  return new Map(steps.map((s) => [s.id, last[s.id] ?? DEFAULT_SECONDS[s.id] ?? UNKNOWN_SECONDS]))
}

/** The durations kept from earlier runs, { id: seconds }; {} when there are none. */
export function readDurations(path) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    // A run's summary.json holds its steps; the kept file holds seconds by id.
    if (Array.isArray(data.steps)) return Object.fromEntries(data.steps.filter((s) => s.ok && s.durationMs != null).map((s) => [s.id, Math.round(s.durationMs / 1000)]))
    return Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'number'))
  } catch {
    return {}
  }
}

// A step slowed by the steps beside it is not that much longer: a kept duration rises by at most a quarter a run.
const MAX_RISE = 1.25

/** Keeps this run's passing steps' durations over the earlier ones, rising by at most a quarter on what was kept. */
export function writeDurations(path, records) {
  const kept = { ...readDurations(path) }
  for (const r of records) {
    if (!r.ok || r.durationMs == null) continue
    const now = Math.round(r.durationMs / 1000)
    kept[r.id] = kept[r.id] == null ? now : Math.min(now, Math.round(kept[r.id] * MAX_RISE))
  }
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(kept, null, 2)}\n`)
  } catch { /* the next run orders from the table instead */ }
}

/**
 * What one declared slot of a step really costs, in processors, before a run on this checkout has measured it: an e2e
 * run's browsers and its stack's servers load the machine about twice what its slots say (13 Nov; three times held
 * both runs to the end of closeout-6). Every other step is counted as declared until it is measured.
 */
export const DEFAULT_WEIGHTS = { e2e: 2, 'e2e-all-flags': 2 }
export const MAX_WEIGHT = 3

/**
 * Each step's weight: the processors it was measured using per declared slot in the last run that measured it (kept by
 * writeCores), else the committed table's, else 1; never under 1 (a step may wait on its database, but its slots are
 * still the least it is given) nor over MAX_WEIGHT.
 */
export function weights(steps, kept = {}) {
  return new Map(steps.map((s) => {
    const k = kept[s.id]
    const w = k && k.slots > 0 ? k.cores / k.slots : DEFAULT_WEIGHTS[s.id] ?? 1
    return [s.id, Math.min(MAX_WEIGHT, Math.max(1, Math.round(w * 10) / 10))]
  }))
}

/** The processors each step used, kept from earlier runs: { id: { cores, slots } }; {} when there are none. */
export function readCores(path) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v && typeof v.cores === 'number' && typeof v.slots === 'number'))
  } catch {
    return {}
  }
}

/** Keeps this run's measured steps over the earlier ones. A step measured for under a minute is not kept. */
export function writeCores(path, records) {
  const kept = { ...readCores(path) }
  for (const r of records) if (r.cpu && r.declaredSlots && r.durationMs >= 60_000) kept[r.id] = { cores: r.cpu.cores, slots: r.declaredSlots }
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(kept, null, 2)}\n`)
  } catch { /* the next run weighs from the table instead */ }
}

/** The fewest and most slots a step declares. */
export function slotRange(step) {
  if (!step.workers) return { min: step.slots ?? 1, max: step.slots ?? 1 }
  const extra = step.stackSlots ?? 0
  return { min: extra + step.workers[0], max: extra + step.workers[1] }
}

/**
 * The step sized for `free` slots of the budget, or null when it does not fit: { slots (what it takes from the budget:
 * its declared slots times its weight), declared, workers (null for a fixed step) }.
 */
export function sizeStep(step, free, weight = 1) {
  const { min, max } = slotRange(step)
  const cost = (n) => Math.ceil(n * weight - 1e-9)
  if (cost(min) > free) return null
  if (!step.workers) return { slots: cost(min), declared: min, workers: null }
  const declared = Math.max(min, Math.min(max, Math.floor(free / weight + 1e-9)))
  return { slots: cost(declared), declared, workers: declared - (step.stackSlots ?? 0) }
}

/** A step's priority: its own expected seconds, and for a step in a lane, those of the lane's steps after it too. */
export function priority(step, pending, est) {
  if (!step.lane) return est.get(step.id)
  let total = 0
  let from = false
  for (const s of pending) {
    if (s === step) from = true
    if (from && s.lane === step.lane) total += est.get(s.id)
  }
  return total
}

/** The plan's steps, longest first, as the scheduler takes them when the slots allow. */
export function longestFirst(steps, est) {
  return [...steps].map((s, i) => ({ s, p: priority(s, steps, est), i })).sort((a, b) => b.p - a.p || a.i - b.i).map(({ s }) => s)
}

const isStack = (s) => s.kind === 'stack' || s.kind === 'chain'

/**
 * The next step to start with `free` slots, sized, or null: the first, longest first, that may start (the first
 * waiting step of its lane, with no step of its lane running, within the ceilings) and fits.
 */
export function pickNext({ pending, running, est, free, maxStacks = Infinity, maxGroups = Infinity, weight = new Map() }) {
  const busyLanes = new Set(running.map((s) => s.lane).filter(Boolean))
  const groups = new Set(running.map((s) => s.group))
  const stacks = running.filter(isStack).length
  const seenLanes = new Set()
  const candidates = []
  for (const s of pending) {
    if (s.lane) {
      if (seenLanes.has(s.lane)) continue
      seenLanes.add(s.lane)
      if (busyLanes.has(s.lane)) continue
    }
    if (isStack(s) && stacks >= maxStacks) continue
    if (!groups.has(s.group) && groups.size >= maxGroups) continue
    candidates.push(s)
  }
  const ranked = candidates.map((s, i) => ({ s, p: priority(s, pending, est), i })).sort((a, b) => b.p - a.p || a.i - b.i)
  for (const { s: step } of ranked) {
    const size = sizeStep(step, free, weight.get(step.id) ?? 1)
    if (size) return { step, ...size }
  }
  return null
}

/**
 * Whether a step may start now: 'go', 'hold' (with why) or 'abort'. Memory as guard.mjs judges it, with the light
 * commands beside the run counted as memory taken; then the load, held at or above the processor count.
 */
export function machineVerdict({ free, swapNow, swapBefore, load, cores, light = 0, totalMemMb = null, holdUnder }) {
  const memory = memoryVerdict({ free, swapNow, swapBefore, holdUnder })
  if (memory === 'abort') return { verdict: 'abort', why: `free memory ${free}%`, memory: true }
  if (memory === 'hold') return { verdict: 'hold', memory: true, why: free !== null && free < holdUnder ? `free memory ${free}%, under ${holdUnder}%` : 'swap is growing' }
  if (free !== null && light > 0 && totalMemMb) {
    const left = free - (light * LIGHT_SLOT_MB * 100) / totalMemMb
    if (left < holdUnder) return { verdict: 'hold', memory: true, why: `free memory ${free}% less ${light} light command(s) beside the run, under ${holdUnder}%` }
  }
  if (load !== null && load >= cores) return { verdict: 'hold', load: true, why: `load ${load.toFixed(1)} on ${cores} processors` }
  return { verdict: 'go', why: null }
}

/** The steps that would start one after another in `free` slots, each sized as it would be, longest first. */
export function readyStarts({ pending, running, est, free, maxStacks, maxGroups, weight }) {
  const picks = []
  let left = [...pending]
  const now = [...running]
  for (;;) {
    const pick = pickNext({ pending: left, running: now, est, free, maxStacks, maxGroups, weight })
    if (!pick) return picks
    picks.push(pick)
    left = left.filter((s) => s !== pick.step)
    now.push(pick.step)
    free -= pick.slots
  }
}

/** Whether light commands may run beside the run at all: not under 30% free memory, nor while it holds for memory. */
export const lightsWelcome = ({ free, memoryHold }) => !memoryHold && !(free !== null && free < LIGHT_MIN_FREE)

/**
 * How many light commands may run beside the run now: none when they are not welcome; otherwise those running, one
 * more (the floor, which the run keeps free), and the slots the run cannot use right now (`spare`: after its running
 * steps and the start it is about to make), between 1 and `max`. The run's own steps come first: a light command gets
 * more than the floor only while nothing of the run's fits. One already running is never stopped when this falls.
 */
export function lightAllowance({ free, memoryHold, live = 0, spare = 0, max = LIGHT_MAX }) {
  if (!lightsWelcome({ free, memoryHold })) return 0
  return Math.min(max, Math.max(1, live + 1 + Math.max(0, spare)))
}

export const SMALL_STEP_LOAD = 1.5

const sleepOrWake = (ms, box) => new Promise((done) => {
  const timer = setTimeout(done, ms)
  box.wake = () => { clearTimeout(timer); done() }
})

/**
 * Runs `steps` within the live budget: `slots` (the processor count unless set) shared by the steps running and the
 * light commands beside the run, while the load stays under `cores`. `start(step, workers, slots)` runs one and resolves when it is done. Starts at
 * most one step per reading, `everyMs` apart (sooner when a step finishes), so each start is seen in the next
 * reading. Stops starting once `isStopped()`; `onAbort(free)` when free memory is under a tenth. Its own starts leave
 * free the slots of the light commands running beside it and, while they are welcome, one more (the floor; not when
 * nothing of its own runs, so a step as large as the budget can still start). At every reading it gives
 * `publishLight` the light commands allowed (lightAllowance). Returns the steps it never started.
 */
export async function schedule(steps, {
  cores, slots = cores, est, start, read, swap, load, light = () => 0, totalMemMb = null, holdUnder, everyMs = 5000,
  isStopped = () => false, onAbort = () => {}, say = () => {}, maxStacks, maxGroups, lightMax = LIGHT_MAX, publishLight = () => {},
  weight = new Map(),
}) {
  const pending = [...steps]
  const running = new Map()
  const box = { wake: null }
  let swapBefore = swap()
  let lastHold = ''
  let lastSaid = 0
  while (pending.length || running.size) {
    if (isStopped()) {
      if (!running.size) break
    } else {
      const free = read()
      const swapNow = swap()
      const lightNow = light()
      const loadNow = load()
      const { verdict, why, memory, load: overLoad } = machineVerdict({ free, swapNow, swapBefore, load: loadNow, cores, light: lightNow, totalMemMb, holdUnder })
      swapBefore = swapNow
      const own = [...running.values()].reduce((a, b) => a + b, 0)
      const memoryHold = Boolean(memory) && verdict !== 'go'
      const floor = lightsWelcome({ free, memoryHold }) ? Math.min(1, lightMax) : 0
      const ceilings = { est, maxStacks, maxGroups, weight }
      // What it would start now, and after that as the load allows (the floor kept free once one of its own runs):
      // none of that is spare for light commands.
      const loadOnly = Boolean(overLoad) && loadNow < cores * SMALL_STEP_LOAD
      const free0 = slots - own - lightNow - (running.size ? floor : 0)
      const next = verdict === 'abort' ? null
        : pickNext({ pending, running: [...running.keys()], free: verdict === 'hold' && loadOnly ? Math.min(1, free0) : free0, ...ceilings })
      const ready = next ? [next, ...readyStarts({ pending: pending.filter((s) => s !== next.step), running: [...running.keys(), next.step],
        free: slots - own - lightNow - floor - next.slots, ...ceilings })] : []
      const spare = slots - own - lightNow - floor - ready.reduce((a, r) => a + r.slots, 0)
      if (verdict === 'abort') onAbort(free)
      // A load over the processor count slows the run but does not endanger the machine: a step of one slot still
      // starts while it is under SMALL_STEP_LOAD times the processors, so the small steps are not all left to the end.
      else if (verdict === 'hold' && pending.length && !(loadOnly && next)) {
        if (why !== lastHold || Date.now() - lastSaid > 5 * 60_000) say(`holding the next start: ${why}`)
        lastHold = why
        lastSaid = Date.now()
      } else if (next) {
        lastHold = ''
        pending.splice(pending.indexOf(next.step), 1)
        running.set(next.step, next.slots)
        Promise.resolve(start(next.step, next.workers, next.slots, next.declared ?? next.slots)).finally(() => {
          running.delete(next.step)
          box.wake?.()
        })
      }
      publishLight(lightAllowance({ free, memoryHold, live: lightNow, spare, max: lightMax }))
    }
    await sleepOrWake(everyMs, box)
  }
  return pending
}
