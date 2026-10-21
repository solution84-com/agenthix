/**
 * One models' worker for the page, shared by Acoustic's silence detection and Semantics' turn model, so the two
 * models load once. Each user takes it with `sharedWorkerModels()` and gives it back with `release`; the worker is
 * closed when the last user releases it, and the next user starts a fresh one.
 */
import type { TurnModel, VoiceActivityModel } from '../ports'
import { createWorkerModels, type WorkerModels } from './workerModels'

export type SharedModels = { vad: VoiceActivityModel; turn: TurnModel; release: () => void }

let shared: { models: WorkerModels; users: number } | null = null

export function sharedWorkerModels(create: () => WorkerModels = createWorkerModels): SharedModels {
  if (!shared) shared = { models: create(), users: 0 }
  const held = shared
  held.users++
  let released = false
  return {
    vad: held.models.vad,
    turn: held.models.turn,
    release() {
      if (released) return
      released = true
      held.users--
      if (held.users > 0) return
      held.models.close()
      if (shared === held) shared = null
    },
  }
}
