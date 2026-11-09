/**
 * The voice playground on hq's socket server (server/socket.ts), with its real parts: hq's model adapter, writing no
 * ledger row, on a model the person may use, for Live and the scenario runner; and the organisation's text to speech.
 */
import { createModelAdapter } from '../../model'
import { playgroundModelAccess, playgroundSpeech } from './access'
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
      scenarios: { model, access: playgroundModelAccess, cacheKey },
      speech: () => playgroundSpeech(userId),
      log: line => log.info(line),
    }
  })
}
