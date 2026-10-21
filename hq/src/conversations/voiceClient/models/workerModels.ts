/**
 * The page's side of the models' worker: `VoiceActivityModel` and `TurnModel` as messages to it. Audio is copied
 * before it is sent, so the caller's buffer stays its own. When the worker fails or is closed, every pending score
 * is rejected, which Semantics treats as the turn model's failure.
 */
import type { TurnModel, VoiceActivityModel } from '../ports'
import type { FromModels, ToModels } from './workerProtocol'

export type ModelWorker = {
  postMessage: (message: ToModels, transfer: Transferable[]) => void
  addEventListener: {
    (type: 'message', listener: (event: MessageEvent<FromModels>) => void): void
    (type: 'error', listener: (event: Event) => void): void
  }
  terminate: () => void
}

export type WorkerModels = { vad: VoiceActivityModel; turn: TurnModel; close: () => void }

export function startModelWorker(): ModelWorker {
  return new Worker(new URL('./models.worker.ts', import.meta.url), { type: 'module' }) as ModelWorker
}

export function createWorkerModels(worker: ModelWorker = startModelWorker()): WorkerModels {
  let nextId = 0
  let closed: string | null = null
  const pending = new Map<number, { resolve: (score: number) => void; reject: (error: Error) => void }>()

  const failAll = (reason: string) => {
    for (const { reject } of pending.values()) reject(new Error(reason))
    pending.clear()
  }
  worker.addEventListener('message', ({ data }) => {
    const waiting = pending.get(data.id)
    if (!waiting) return
    pending.delete(data.id)
    if (data.ok) waiting.resolve(data.score)
    else waiting.reject(new Error(data.error))
  })
  worker.addEventListener('error', () => {
    closed = 'The voice models stopped'
    failAll(closed)
  })

  const ask = (kind: 'vad.score' | 'turn.score', audio: Float32Array) =>
    new Promise<number>((resolve, reject) => {
      if (closed) return reject(new Error(closed))
      const id = nextId++
      const copy = audio.slice()
      pending.set(id, { resolve, reject })
      const message: ToModels = kind === 'vad.score' ? { id, kind, frame: copy } : { id, kind, audio: copy }
      worker.postMessage(message, [copy.buffer])
    })

  return {
    vad: {
      score: (frame) => ask('vad.score', frame),
      reset: () => { if (!closed) worker.postMessage({ kind: 'vad.reset' }, []) },
    },
    turn: { score: (audio) => ask('turn.score', audio) },
    close() {
      if (closed) return
      closed = 'The voice models were closed'
      worker.terminate()
      failAll(closed)
    },
  }
}
