/**
 * The turn model as the runtime sees it (semantics spec, §2): keeps the last 8 s of the person's audio, and when the
 * pause timer asks (`semantics.ask`), scores the speech with the silence after it and publishes `semantics.score`,
 * or `semantics.failed`. The queue is one: while a score is out, a newer ask replaces any ask waiting, and an answer
 * to a pause the person has since spoken through is dropped.
 */
import type { Adapter } from '../runtime/types'
import type { TurnModel } from '../ports'
import { TURN_WINDOW } from '../models/smartTurn'

export type TurnAdapterDeps = { model: () => TurnModel }

/** The last `TURN_WINDOW` samples, kept as the chunks they arrived in. */
function audioWindow() {
  let chunks: Int16Array[] = []
  let length = 0
  return {
    add(pcm: Int16Array) {
      chunks.push(pcm)
      length += pcm.length
      while (chunks.length > 1 && length - chunks[0]!.length >= TURN_WINDOW) length -= chunks.shift()!.length
    },
    floats(): Float32Array {
      const out = new Float32Array(Math.min(length, TURN_WINDOW))
      let at = out.length
      for (let i = chunks.length - 1; i >= 0 && at > 0; i--) {
        const chunk = chunks[i]!
        const take = Math.min(chunk.length, at)
        at -= take
        for (let j = 0; j < take; j++) out[at + j] = chunk[chunk.length - take + j]! / 32768
      }
      return out
    },
  }
}

export function turnAdapter(deps: TurnAdapterDeps): Adapter {
  return {
    name: 'turnAdapter',
    start(runtime) {
      const audio = audioWindow()
      // Bumped when the person speaks again: whatever was asked before is stale.
      let generation = 0
      let busy = false
      let waiting: { silenceMs: number; audio: Float32Array } | null = null

      const run = (silenceMs: number, samples: Float32Array) => {
        busy = true
        const mine = generation
        deps.model().score(samples).then(
          score => {
            if (mine === generation) runtime.publish({ kind: 'semantics.score', score, silenceMs, t: runtime.now() })
          },
          (err: unknown) => {
            if (mine === generation) runtime.publish({ kind: 'semantics.failed', reason: err instanceof Error ? err.message : String(err), t: runtime.now() })
          },
        ).finally(() => {
          busy = false
          const next = waiting
          waiting = null
          if (next) run(next.silenceMs, next.audio)
        })
      }

      const offs = [
        runtime.subscribe(['audio.frame'], e => { if (e.kind === 'audio.frame') audio.add(e.pcm) }),
        runtime.subscribe(['acoustic.silence'], e => {
          if (e.kind === 'acoustic.silence' && !e.silent) { generation++; waiting = null }
        }),
        runtime.subscribe(['semantics.ask'], e => {
          if (e.kind !== 'semantics.ask') return
          const samples = audio.floats()
          if (busy) waiting = { silenceMs: e.silenceMs, audio: samples }
          else run(e.silenceMs, samples)
        }),
      ]
      return () => { generation++; waiting = null; offs.forEach(off => off()) }
    },
  }
}
