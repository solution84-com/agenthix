import { describe, expect, it } from 'vitest'
import { fakeTurnModel, fakeVoiceActivityModel } from '../fakes'
import { sharedWorkerModels } from '../sharedModels'
import type { WorkerModels } from '../workerModels'

function counting() {
  const made: Array<WorkerModels & { closed: boolean }> = []
  const create = () => {
    const models = { vad: fakeVoiceActivityModel([0.1]), turn: fakeTurnModel([0.9]), closed: false, close() { models.closed = true } }
    made.push(models)
    return models
  }
  return { made, create }
}

describe('the shared models’ worker', () => {
  it('gives every user the same worker, and closes it when the last one releases it', () => {
    const { made, create } = counting()
    const acoustic = sharedWorkerModels(create)
    const semantics = sharedWorkerModels(create)
    expect(made).toHaveLength(1)
    expect(acoustic.vad).toBe(semantics.vad)
    acoustic.release()
    acoustic.release()
    expect(made[0]!.closed).toBe(false)
    semantics.release()
    expect(made[0]!.closed).toBe(true)
  })

  it('starts a fresh worker for a user after the last one closed it', () => {
    const { made, create } = counting()
    sharedWorkerModels(create).release()
    const again = sharedWorkerModels(create)
    expect(made).toHaveLength(2)
    expect(made[1]!.closed).toBe(false)
    again.release()
  })
})
