/**
 * The voice playground on hq's socket server (server/socket.ts), with its real parts: hq's model adapter, writing no
 * ledger row, on a model the person may use, for Live; and the organisation's text to speech.
 */
import { createModelAdapter } from '../../model'
import { playgroundHumAccess, playgroundListenerAccess, playgroundModelAccess, playgroundSpeech } from './access'
import { registerVoicePlayground, type PlaygroundSocket } from './handlers'
import { leadFor } from './leads'

interface Log { info(message: string): void; error(message: string, err: unknown): void }

export function registerVoicePlaygroundEvents(socket: PlaygroundSocket, log: Log): void {
  registerVoicePlayground(socket, log, (userId, s) => {
    // A development call is in no usage report: its usage goes to the page instead (turn.ts).
    const model = createModelAdapter({ record: () => undefined })
    const cacheKey = `voice-playground:${s.id}`
    return {
      lead: args => leadFor(args.lead, userId, { model, access: playgroundModelAccess, cacheKey }),
      speech: () => playgroundSpeech(userId),
      light: {
        model,
        access: value => playgroundListenerAccess(userId, value),
        heavyAccess: value => playgroundModelAccess(userId, value),
      },
      hums: { model, access: value => playgroundHumAccess(userId, value) },
      log: line => log.info(line),
    }
  })
}
