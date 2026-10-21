/**
 * Time for voice's runtime and adapters, behind an interface so tests run on a clock they advance. Components never
 * read time themselves: they get `t` on each event and the runtime's `clock.tick`.
 */

export type TimerHandle = { cancel: () => void }

export type Clock = {
  now: () => number
  /** Runs `fn` once, `ms` from now. */
  after: (ms: number, fn: () => void) => TimerHandle
  /** Runs `fn` every `ms`. */
  every: (ms: number, fn: () => void) => TimerHandle
}

export function realClock(): Clock {
  return {
    now: () => performance.now(),
    after: (ms, fn) => { const id = setTimeout(fn, ms); return { cancel: () => clearTimeout(id) } },
    every: (ms, fn) => { const id = setInterval(fn, ms); return { cancel: () => clearInterval(id) } },
  }
}

export type FakeClock = Clock & {
  /** Moves time forward, running every timer due on the way, in order. */
  advance: (ms: number) => void
}

export function fakeClock(start = 0): FakeClock {
  let at = start
  let nextId = 0
  const timers = new Map<number, { due: number; every: number | null; fn: () => void }>()
  const add = (ms: number, fn: () => void, repeat: boolean): TimerHandle => {
    const id = nextId++
    timers.set(id, { due: at + ms, every: repeat ? Math.max(ms, 1) : null, fn })
    return { cancel: () => { timers.delete(id) } }
  }
  return {
    now: () => at,
    after: (ms, fn) => add(ms, fn, false),
    every: (ms, fn) => add(ms, fn, true),
    advance(ms) {
      const end = at + ms
      for (;;) {
        let nextKey: number | null = null
        for (const [id, timer] of timers) {
          if (timer.due > end) continue
          const current = nextKey === null ? null : timers.get(nextKey)!
          if (!current || timer.due < current.due || (timer.due === current.due && id < nextKey!)) nextKey = id
        }
        if (nextKey === null) break
        const timer = timers.get(nextKey)!
        at = timer.due
        if (timer.every === null) timers.delete(nextKey)
        else timer.due += timer.every
        timer.fn()
      }
      at = end
    },
  }
}
