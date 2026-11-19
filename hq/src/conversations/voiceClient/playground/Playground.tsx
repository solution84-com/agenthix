/**
 * The voice playground (voice that stays in the conversation, plan tasks 4b.3 and 4c): hq's own voice client and the
 * lead's own voice logic, tied to no agent and no conversation record. Live only. On the left, the conversation and its
 * box, with a slim header holding the title and Start over; on the right two tabs, Log (first, open by default, filling
 * the tab's height) and Settings (Models, Tuning, Lab). On a narrow window the right column goes under the conversation.
 * The scripted sets that were Scenarios here are model checks (`__modelchecks__/voice/`).
 *
 * Adaptive voice is the light model, as in the product (adaptive voice listening): on, Live's voice runs with the light
 * model listening and Tuning holds every one of its caps and first values; off, plain voice. The Log shows one card
 * per turn: who did what, and when (`logTurns.ts`).
 *
 * Nothing here reaches Wasp: the page (VoicePlaygroundPage.tsx) hands in the socket, the person, the speech token and
 * the models offered.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ModelChoices } from '../../../shared/conversations/protocol'
import { PLAYGROUND_CONVERSATION_ID, VOICE_PLAYGROUND_SOCKET } from '../../../shared/voicePlayground'
import { randomId } from '../../../shared/randomId'
import { Button } from '@agenthix/ui'
import type { SttToken } from '../stt'
import type { VoiceSession } from '../voiceSession'
import { decisionRows } from './decisions'
import { LivePane } from './LivePane'
import { BADGE, LogPanel } from './LogPanel'
import { BadgeKey } from './BadgeKey'
import { FAKE_MODEL } from './ModelsSection'
import { PlaygroundTabs } from './PlaygroundTabs'
import { makePlaygroundSession, sendToPlayground, type AckSocket } from './playgroundSession'
import { SettingsTab } from './SettingsTab'
import { createPlaygroundSettings, type PlaygroundSettings } from './settings'
import { useStalePicks } from './staleModels'
import { createTraceReader } from './trace'
import { usePlaygroundFeed, type PlaygroundFeed } from './usePlaygroundFeed'
import { useLightFeed, type LightFeed } from './useLightFeed'
import { useLogView } from './useLogView'

const AGENT = { name: 'Playground agent', avatarUrl: null }

export interface PlaygroundProps {
  socket: AckSocket
  userId: string
  getToken: () => Promise<SttToken>
  /** What the standard model picker offers this person in their own space; undefined while it loads. */
  choices: ModelChoices | undefined
}

export function Playground({ socket, userId, getToken, choices }: PlaygroundProps) {
  const settings = useMemo(() => createPlaygroundSettings(), [])
  const labelOf = useCallback((v: string) => (v === FAKE_MODEL ? 'Fake model' : choices?.models.find(m => m.value === v)?.label ?? v), [choices])
  const feed = usePlaygroundFeed(socket, labelOf)
  const light = useLightFeed(socket, settings, choices)
  const [session, setSession] = useState<VoiceSession | null>(null)

  useEffect(() => {
    const made = makePlaygroundSession({ socket, userId, settings, getToken })
    setSession(made)
    return () => { made.end(); made.dispose() }
  }, [socket, userId, settings, getToken])

  if (!session) return null
  return <Body session={session} socket={socket} settings={settings} choices={choices} feed={feed} light={light} labelOf={labelOf} />
}

type BodyProps = {
  session: VoiceSession; socket: AckSocket; settings: PlaygroundSettings; choices: ModelChoices | undefined
  feed: PlaygroundFeed; light: LightFeed; labelOf: (v: string) => string
}

function Body({ session, socket, settings, choices, feed, light, labelOf }: BodyProps) {
  const snapshot = useSyncExternalStore(session.subscribe, session.snapshot)
  // A new runtime is made each time voice starts; the phase changing is when to ask again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runtime = useMemo(() => session.runtime(), [session, snapshot.phase])
  const { note } = feed
  const stale = useStalePicks(settings, choices)

  useEffect(() => {
    if (!runtime) return
    const trace = createTraceReader()
    return runtime.subscribe('*', event => {
      const line = trace(event)
      if (line) socket.emit(VOICE_PLAYGROUND_SOCKET.trace, line)
    })
  }, [runtime, socket])

  useEffect(() => { if (snapshot.notice) note('notice', snapshot.notice) }, [snapshot.notice, note])

  const rows = useMemo(() => decisionRows(feed.entries, feed.decisions), [feed.entries, feed.decisions])
  const view = useLogView(feed, light, runtime, socket, labelOf)

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
      <div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <main className="flex min-h-[28rem] min-w-0 flex-col lg:min-h-0">
          <header aria-label="Voice playground" className="flex items-center gap-2 border-b border-border-subtle px-4 py-2 lg:px-6">
            <h1 className="flex-1 text-body font-medium text-text-primary">Voice playground</h1>
            <Button variant="secondary" size="sm" onClick={() => socket.emit(VOICE_PLAYGROUND_SOCKET.reset)}>Start over</Button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col p-4 lg:px-6">
            <LivePane
              session={session} snapshot={snapshot} entries={feed.entries} decisions={rows} log={feed.log}
              startVoice={() => session.start(PLAYGROUND_CONVERSATION_ID, AGENT, '/dev/voice-playground')}
              sendText={text => sendToPlayground(socket, settings, { conversationId: PLAYGROUND_CONVERSATION_ID, clientMessageId: randomId(), text })}
            />
          </div>
        </main>
        <aside aria-label="Log and settings" className="flex min-h-[24rem] min-w-0 flex-col border-border-subtle bg-surface-1 max-lg:border-t lg:min-h-0 lg:border-l">
          <PlaygroundTabs
            log={<LogPanel view={view} />}
            logTools={<BadgeKey tone={BADGE} />}
            settings={<SettingsTab settings={settings} choices={choices} runtime={runtime} stale={stale.notes} onPicked={stale.clear} socket={socket} />}
          />
        </aside>
      </div>
    </div>
  )
}
