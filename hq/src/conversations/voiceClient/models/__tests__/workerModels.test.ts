import { describe, expect, it } from 'vitest'
import type { TurnModel, VoiceActivityModel } from '../../ports'
import { fakeTurnModel, fakeVoiceActivityModel } from '../fakes'
import { createModelHost, type LoadedModels } from '../modelHost'
import { createWorkerModels, type ModelWorker } from '../workerModels'
import type { FromModels, ToModels } from '../workerProtocol'

/** The page's client and the worker's host joined by a message channel, as the browser joins them. */
function joined(load: () => Promise<LoadedModels>) {
  const listeners = { message: [] as ((e: MessageEvent<FromModels>) => void)[], error: [] as ((e: Event) => void)[] }
  const sent: ToModels[] = []
  let terminated = false
  const host = createModelHost(load, (message) => {
    for (const listener of listeners.message) listener({ data: message } as MessageEvent<FromModels>)
  })
  const worker: ModelWorker = {
    postMessage(message, transfer) {
      sent.push(message)
      // Transferring detaches the sender's buffer, as the browser does.
      const copy = structuredClone(message, { transfer: transfer as Transferable[] })
      queueMicrotask(() => host(copy))
    },
    addEventListener(type: 'message' | 'error', listener: (e: never) => void) {
      listeners[type].push(listener as never)
    },
    terminate() { terminated = true },
  }
  return { models: createWorkerModels(worker), sent, crash: () => listeners.error.forEach((l) => l(new Event('error'))), terminated: () => terminated }
}

const frame = (value: number) => new Float32Array(512).fill(value)

describe("the models' worker, page and worker sides together", () => {
  it('answers each score with its own model, in the order asked', async () => {
    const vad = fakeVoiceActivityModel([0.1, 0.2, 0.3])
    const turn = fakeTurnModel([0.9])
    const { models } = joined(async () => ({ vad, turn }))
    const scores = await Promise.all([models.vad.score(frame(1)), models.turn.score(new Float32Array(16000)), models.vad.score(frame(2)), models.vad.score(frame(3))])
    expect(scores).toEqual([0.1, 0.9, 0.2, 0.3])
    expect(vad.frames.map((f) => f[0])).toEqual([1, 2, 3])
  })

  it("keeps a reset between the frames it was sent between, and leaves the caller's audio its own", async () => {
    const order: string[] = []
    const vad: VoiceActivityModel = {
      score: async (f) => { order.push(`score ${f[0]}`); return 0 },
      reset: () => { order.push('reset') },
    }
    const { models } = joined(async () => ({ vad, turn: fakeTurnModel([0]) }))
    const mine = frame(1)
    const first = models.vad.score(mine)
    models.vad.reset()
    await Promise.all([first, models.vad.score(frame(2))])
    expect(order).toEqual(['score 1', 'reset', 'score 2'])
    expect(mine).toHaveLength(512)
    expect(mine[0]).toBe(1)
  })

  it("passes a model's failure back as a rejected score", async () => {
    const { models } = joined(async () => ({ vad: fakeVoiceActivityModel([0]), turn: fakeTurnModel([new Error('turn model failed')]) }))
    await expect(models.turn.score(new Float32Array(10))).rejects.toThrow('turn model failed')
  })

  it('answers a failed load as an error, and loads again on the next message', async () => {
    let attempts = 0
    const turn: TurnModel = { score: async () => 0.7 }
    const { models } = joined(async () => {
      if (++attempts === 1) throw new Error('could not be fetched (404)')
      return { vad: fakeVoiceActivityModel([0]), turn }
    })
    await expect(models.turn.score(new Float32Array(10))).rejects.toThrow('could not be fetched (404)')
    expect(await models.turn.score(new Float32Array(10))).toBe(0.7)
    expect(attempts).toBe(2)
  })

  it('rejects what is pending when the worker fails, and every score after', async () => {
    const { models, crash } = joined(() => new Promise<LoadedModels>(() => {}))
    const pending = models.turn.score(new Float32Array(10))
    crash()
    await expect(pending).rejects.toThrow('The voice models stopped')
    await expect(models.vad.score(frame(0))).rejects.toThrow('The voice models stopped')
  })

  it('stops the worker on close, rejecting what is pending', async () => {
    const { models, terminated, sent } = joined(() => new Promise<LoadedModels>(() => {}))
    const pending = models.vad.score(frame(0))
    models.close()
    await expect(pending).rejects.toThrow('closed')
    expect(terminated()).toBe(true)
    models.vad.reset()
    expect(sent).toHaveLength(1)
  })
})
