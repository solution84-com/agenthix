/**
 * The worker's side: answers the page's messages from the two models, loaded together on the first message. A
 * failed load is answered as an error and tried again on the next message. Messages are applied in the order they
 * arrive, so Silero's frames keep their order and a reset falls between the frames it was sent between.
 */
import type { TurnModel, VoiceActivityModel } from '../ports'
import type { FromModels, ToModels } from './workerProtocol'

export type LoadedModels = { vad: VoiceActivityModel; turn: TurnModel }

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createModelHost(load: () => Promise<LoadedModels>, reply: (message: FromModels) => void) {
  let models: Promise<LoadedModels> | null = null
  const answer = (id: number, score: Promise<number>) =>
    score.then(
      (value) => reply({ id, ok: true, score: value }),
      (error: unknown) => reply({ id, ok: false, error: messageOf(error) }),
    )

  return (message: ToModels): void => {
    const loaded = (models ??= load().catch((error: unknown) => {
      models = null
      throw error
    }))
    switch (message.kind) {
      case 'vad.score':
        void answer(message.id, loaded.then((m) => m.vad.score(message.frame)))
        break
      case 'vad.reset':
        loaded.then((m) => m.vad.reset(), () => undefined)
        break
      case 'turn.score':
        void answer(message.id, loaded.then((m) => m.turn.score(message.audio)))
        break
    }
  }
}
