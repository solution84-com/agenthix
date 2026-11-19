/**
 * The voice playground's socket events (plan task 4b.2): one playground conversation per socket, made when its page
 * first asks and ended when the socket goes. Refused outside a development build and for a socket of nobody signed in:
 * a message is answered with the refusal, voice with an error, and nothing else is acted on.
 */
import { isDevelopmentBuild, type FlagEnvironment } from '@agenthix/core'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import { CONVERSATION_VOICE_SOCKET as V, type VoiceErrorEvent } from '../../../shared/conversations/voice'
import {
  PLAYGROUND_CONVERSATION_ID, PLAYGROUND_REFUSED, VOICE_PLAYGROUND_SOCKET as P, playgroundEvent,
  type PlaygroundSendAck, type PlaygroundSendArgs,
} from '../../../shared/voicePlayground'
import { PlaygroundConversation, type PlaygroundDeps } from './conversation'
import { LIGHT_SOCKET as L } from '../../../shared/voicePlaygroundLight'

export interface PlaygroundSocket {
  id: string
  data?: { user?: { id: string } }
  emit(event: string, payload: unknown): unknown
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

interface Log { info(message: string): void; error(message: string, err: unknown): void }

/** What a conversation is made with, for this socket's person. */
export type MakeDeps = (userId: string, socket: PlaygroundSocket) => Omit<PlaygroundDeps, 'out'>

/** hq's voice events the page sends, under the playground's prefix. */
const FROM_PAGE = [V.start, V.end, V.interrupt, V.activity, V.continue, V.listen, V.linePlayed, VP.backchannel, VP.backchannelSpeak, VP.voiceTone] as const

export function registerVoicePlayground(socket: PlaygroundSocket, log: Log, make: MakeDeps, env: FlagEnvironment = process.env): void {
  let conversation: PlaygroundConversation | null = null
  let made: ReturnType<MakeDeps> | null = null
  const allowed = () => isDevelopmentBuild(env) && !!socket.data?.user?.id
  const out = (event: string, payload: unknown) => { socket.emit(event, payload) }
  const deps = () => (made ??= make(socket.data!.user!.id, socket))

  function ours(): PlaygroundConversation {
    conversation ??= new PlaygroundConversation({ ...deps(), out })
    return conversation
  }

  function guarded(event: string, act: () => void): void {
    try {
      act()
    } catch (err) {
      log.error(`${event} failed for ${socket.id}`, err)
    }
  }

  for (const event of FROM_PAGE) {
    socket.on(playgroundEvent(event), (payload: unknown) => {
      if (!allowed()) {
        if (event === V.start) socket.emit(playgroundEvent(V.error), { conversationId: PLAYGROUND_CONVERSATION_ID, message: PLAYGROUND_REFUSED } satisfies VoiceErrorEvent)
        return
      }
      guarded(event, () => ours().voiceEvent(event, payload))
    })
  }

  socket.on(P.send, (payload: unknown, answer?: unknown) => {
    const reply = typeof answer === 'function' ? (answer as (ack: PlaygroundSendAck) => void) : () => undefined
    if (!allowed()) { reply({ ok: false, error: PLAYGROUND_REFUSED }); return }
    try {
      reply(ours().send(payload as PlaygroundSendArgs))
    } catch (err) {
      log.error(`${P.send} failed for ${socket.id}`, err)
      reply({ ok: false, error: 'The playground could not take that message.' })
    }
  })

  socket.on(P.phrasePlayed, (payload: unknown) => { if (allowed()) guarded(P.phrasePlayed, () => ours().recordSound(payload)) })

  // What the page's voice client saw or played, so the server's log shows the whole turn; capped, development only.
  socket.on(P.trace, (line: unknown) => {
    if (allowed() && typeof line === 'string') log.info(`voice playground: page ${line.slice(0, 300)}`)
  })

  socket.on(P.reset, () => { if (allowed()) guarded(P.reset, () => ours().reset()) })

  // The light model (light/): its settings from the page.
  socket.on(L.config, (payload: unknown) => { if (allowed()) guarded(L.config, () => ours().light.configure(payload)) })

  socket.on('disconnect', () => {
    conversation?.close()
    conversation = null
  })
}
