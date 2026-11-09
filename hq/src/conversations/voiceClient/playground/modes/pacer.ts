/**
 * Hands recorded audio to the voice client at the speed it was spoken: whatever is due by the clock goes out each
 * tick, so the pauses in the recording are pauses here too. After the audio, silence follows for `tailMs`, as a
 * real microphone would keep sending it, so the client can reach the end of the last turn.
 */
export type PacerClock = {
  now: () => number
  /** Calls `fn` every `ms` until the returned function is called. */
  every: (fn: () => void, ms: number) => () => void
}

export const realClock: PacerClock = {
  now: () => performance.now(),
  every: (fn, ms) => {
    const id = setInterval(fn, ms)
    return () => clearInterval(id)
  },
}

export type PacerOptions = {
  clock: PacerClock
  pcm: Int16Array
  rate: number
  tailMs?: number
  tickMs?: number
  onChunk: (pcm: Int16Array<ArrayBuffer>) => void
  /** The audio and its tail have all been handed on. Not called after `stop`. */
  onEnd?: () => void
}

export type Pacer = {
  start: () => void
  stop: () => void
  /** Where in the audio (the tail excluded) the pacer is, and how long the audio is, in ms. */
  position: () => { ms: number; totalMs: number }
  finished: () => boolean
}

export const DEFAULT_TAIL_MS = 2500
export const DEFAULT_TICK_MS = 20

export function createPacer(opts: PacerOptions): Pacer {
  const { clock, pcm, rate, onChunk } = opts
  const tickMs = opts.tickMs ?? DEFAULT_TICK_MS
  const total = pcm.length + Math.round(((opts.tailMs ?? DEFAULT_TAIL_MS) * rate) / 1000)
  const audioMs = (pcm.length / rate) * 1000
  let sent = 0
  let startedAt = 0
  let cancel: (() => void) | null = null
  let done = false

  const tick = () => {
    const due = Math.min(total, Math.floor(((clock.now() - startedAt) * rate) / 1000))
    if (due > sent) {
      const chunk = new Int16Array(due - sent)
      if (sent < pcm.length) chunk.set(pcm.subarray(sent, Math.min(due, pcm.length)))
      sent = due
      onChunk(chunk)
    }
    if (sent >= total && !done) {
      done = true
      cancel?.()
      cancel = null
      opts.onEnd?.()
    }
  }

  return {
    start() {
      if (cancel || done) return
      startedAt = clock.now()
      cancel = clock.every(tick, tickMs)
    },
    stop() {
      cancel?.()
      cancel = null
      done = true
    },
    position: () => ({ ms: Math.min(audioMs, (sent / rate) * 1000), totalMs: audioMs }),
    finished: () => done,
  }
}
