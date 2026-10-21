/**
 * The runtime (adaptive voice spec, The real-time runtime): delivers events between components through one bounded
 * queue per loop, keeps the log, ticks the clock, and starts and stops the adapters. It is the only part of voice
 * that knows about order and concurrency; the components it connects are pure.
 *
 * Delivery is synchronous and deterministic: a publish drains the queues before it returns, taking one event from
 * each loop in turn, so a slow loop never holds the others back and the same events always give the same result.
 */
import { loopOf, type VoiceEvent, type VoiceEventInput, type VoiceEventKind, type VoiceLoop } from '../events'
import type { AnyComponent, Overflow, QueueLimits, VoiceRuntime, VoiceRuntimeOptions } from './types'

const LOOPS: readonly VoiceLoop[] = ['inbound', 'decision', 'outbound']

const DEFAULT_LIMITS: QueueLimits = { inbound: 400, decision: 200, outbound: 200 }

/**
 * When a queue is full, the oldest of these is dropped first: readings that a newer one replaces. What the person
 * said (their audio and words) and every decision are never dropped; a queue holding only those grows past its
 * limit, and the overflow is recorded.
 */
const REPLACEABLE: ReadonlySet<VoiceEventKind> = new Set<VoiceEventKind>([
  'clock.tick', 'acoustic.vadScore', 'acoustic.echoLevel', 'stt.lag', 'playback.at', 'playback.frame',
])

const MAX_OVERFLOWS = 100

const replyIdOf = (event: VoiceEvent): string | null =>
  'replyId' in event && typeof event.replyId === 'string' ? event.replyId : null

export function createVoiceRuntime(options: VoiceRuntimeOptions): VoiceRuntime {
  const { components, adapters, settings, clock } = options
  const limits: QueueLimits = { ...DEFAULT_LIMITS, ...options.queueLimits }
  const tickMs = options.tickMs ?? 50
  const logSize = options.logSize ?? 5_000

  const queues: Record<VoiceLoop, VoiceEvent[]> = { inbound: [], decision: [], outbound: [] }
  const states = new Map<AnyComponent, unknown>(components.map(c => [c, c.init(settings)]))
  const listeners = new Set<{ kinds: ReadonlySet<VoiceEventKind> | null; listener: (event: VoiceEvent) => void }>()
  const log: VoiceEvent[] = []
  const overflows: Overflow[] = []
  let seq = 0
  let draining = false
  let stops: Array<() => void> = []
  let ticking: { cancel: () => void } | null = null

  const enqueue = (input: VoiceEventInput) => {
    const event = { ...input, seq: seq++ } as VoiceEvent
    const loop = loopOf(event.kind)
    const queue = queues[loop]
    queue.push(event)
    if (queue.length <= limits[loop]) return
    const oldest = queue.findIndex(e => REPLACEABLE.has(e.kind))
    if (oldest >= 0) {
      const [dropped] = queue.splice(oldest, 1)
      overflows.push({ loop, dropped: dropped!, at: clock.now() })
    } else {
      overflows.push({ loop, dropped: event, at: clock.now() })
      // Nothing replaceable: the event is kept, and the overflow says the limit was passed.
    }
    if (overflows.length > MAX_OVERFLOWS) overflows.shift()
  }

  const deliver = (event: VoiceEvent) => {
    const emitted: VoiceEventInput[] = []
    for (const component of components) {
      if (!component.accepts.includes(event.kind)) continue
      const result = component.step(states.get(component), event, settings)
      states.set(component, result.state)
      emitted.push(...result.emit)
    }
    log.push(event)
    if (log.length > logSize) log.shift()
    for (const { kinds, listener } of listeners) if (!kinds || kinds.has(event.kind)) listener(event)
    for (const next of emitted) enqueue(next)
  }

  const drain = () => {
    if (draining) return
    draining = true
    try {
      for (;;) {
        let delivered = false
        for (const loop of LOOPS) {
          const event = queues[loop].shift()
          if (!event) continue
          delivered = true
          deliver(event)
        }
        if (!delivered) break
      }
    } finally {
      draining = false
    }
  }

  const runtime: VoiceRuntime = {
    publish(input) { enqueue(input); drain() },
    subscribe(kinds, listener) {
      // Only events of `kinds` reach the listener, so it may be typed by them.
      const entry = { kinds: kinds === '*' ? null : new Set<VoiceEventKind>(kinds), listener: listener as (event: VoiceEvent) => void }
      listeners.add(entry)
      return () => { listeners.delete(entry) }
    },
    settings: () => settings,
    now: () => clock.now(),
    start() {
      if (ticking) return
      ticking = clock.every(tickMs, () => runtime.publish({ kind: 'clock.tick', t: clock.now() }))
      stops = adapters.map(a => a.start(runtime))
    },
    stop() {
      ticking?.cancel()
      ticking = null
      for (const stop of stops.reverse()) stop()
      stops = []
    },
    cancelReply(replyId) {
      for (const loop of LOOPS) queues[loop] = queues[loop].filter(e => replyIdOf(e) !== replyId)
    },
    log: () => log,
    overflows: () => overflows,
  }
  return runtime
}
