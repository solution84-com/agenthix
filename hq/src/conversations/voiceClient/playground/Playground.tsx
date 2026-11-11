/**
 * The voice playground (voice that stays in the conversation, plan tasks 4b.3 and 4c): hq's own voice client and the
 * lead's own voice logic, tied to no agent and no conversation record. A top bar with the two modes, Live and
 * Scenarios; under it the mode's own row; on the left the mode's content (Live: the conversation and its box;
 * Scenarios: the fixed library and its result); on the right a column of Tuning, Lab and the Log (in Scenarios, the four
 * sliders that apply and no Lab, since text scenarios make no sounds). On a narrow window the panes stack, the left first.
 *
 * Nothing here reaches Wasp: the page (VoicePlaygroundPage.tsx) hands in the socket, the person, the speech token and
 * the models offered.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ModelChoices } from '../../../shared/conversations/protocol'
import { PLAYGROUND_CONVERSATION_ID, VOICE_PLAYGROUND_SOCKET, type PlaygroundScenario, type ScenarioGroup } from '../../../shared/voicePlayground'
import { randomId } from '../../../shared/randomId'
import type { SttToken } from '../stt'
import type { VoiceSession } from '../voiceSession'
import { SegmentedControl } from '@agenthix/ui/primitives'
import { decisionRows } from './decisions'
import { LabPanel } from './LabPanel'
import { ListeningSliders, resetListening } from './ListeningSliders'
import { LivePane } from './LivePane'
import { LogPanel } from './LogPanel'
import { FAKE_MODEL, LiveRow, ScenariosRow } from './ModeRows'
import { BarButton, PaneBar, useFolded } from './PaneBar'
import { makePlaygroundSession, sendToPlayground, type AckSocket } from './playgroundSession'
import { createSoundReader, messageEntries } from './playgroundLog'
import { GroupDialog, LineDialog } from './ScenarioDialogs'
import { runLogEntries } from './scenarioRun'
import { ScenariosPane } from './ScenariosPane'
import { createPlaygroundSettings, type PlaygroundMode, type PlaygroundSettings } from './settings'
import { createTraceReader } from './trace'
import { usePlaygroundFeed, type PlaygroundFeed } from './usePlaygroundFeed'
import { useScenarioRun, type ScenarioRunFeed } from './useScenarioRun'

const AGENT = { name: 'Playground agent', avatarUrl: null }

const MODES: { id: PlaygroundMode; label: string }[] = [{ id: 'live', label: 'Live' }, { id: 'scenarios', label: 'Scenarios' }]

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
  const scenarios = useScenarioRun(socket)
  const [session, setSession] = useState<VoiceSession | null>(null)

  useEffect(() => {
    const made = makePlaygroundSession({ socket, userId, settings, getToken })
    setSession(made)
    return () => { made.end(); made.dispose() }
  }, [socket, userId, settings, getToken])

  if (!session) return null
  return <Body session={session} socket={socket} settings={settings} choices={choices} feed={feed} scenarios={scenarios} labelOf={labelOf} />
}

type BodyProps = {
  session: VoiceSession; socket: AckSocket; settings: PlaygroundSettings; choices: ModelChoices | undefined
  feed: PlaygroundFeed; scenarios: ScenarioRunFeed; labelOf: (v: string) => string
}

function Body({ session, socket, settings, choices, feed, scenarios, labelOf }: BodyProps) {
  const { mode, compare, adaptiveVoice } = useSyncExternalStore(settings.subscribe, settings.get)
  const snapshot = useSyncExternalStore(session.subscribe, session.snapshot)
  // A new runtime is made each time voice starts; the phase changing is when to ask again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runtime = useMemo(() => session.runtime(), [session, snapshot.phase])
  const [group, setGroup] = useState<ScenarioGroup | null>(null)
  const [line, setLine] = useState<PlaygroundScenario | null>(null)
  const { add, note } = feed
  const [tuningFolded, toggleTuning] = useFolded('tuning')

  useEffect(() => {
    if (!runtime) return
    const read = createSoundReader(Date.now, played => socket.emit(VOICE_PLAYGROUND_SOCKET.phrasePlayed, { conversationId: PLAYGROUND_CONVERSATION_ID, ...played }))
    const trace = createTraceReader()
    return runtime.subscribe('*', event => {
      const sound = read(event)
      if (sound) add(sound)
      const line = trace(event)
      if (line) socket.emit(VOICE_PLAYGROUND_SOCKET.trace, line)
    })
  }, [runtime, add, socket])

  useEffect(() => { if (snapshot.notice) note('NOTICE', snapshot.notice) }, [snapshot.notice, note])

  const rows = useMemo(() => decisionRows(feed.entries, feed.decisions), [feed.entries, feed.decisions])
  const lists = useMemo(
    () => [messageEntries(feed.entries, rows, feed.calls, labelOf), feed.notes, runLogEntries(scenarios.library, scenarios.run, labelOf)],
    [feed.entries, feed.calls, rows, feed.notes, scenarios.library, scenarios.run, labelOf],
  )

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2 lg:px-6">
        <h1 className="mr-2 text-body font-medium text-text-primary">Voice playground</h1>
        <SegmentedControl label="Mode" value={mode} onChange={id => settings.patch({ mode: id })} options={MODES.map(m => ({ value: m.id, label: m.label }))} />
      </div>
      {mode === 'live'
        ? <LiveRow settings={settings} choices={choices} onStartOver={() => socket.emit(VOICE_PLAYGROUND_SOCKET.reset)} />
        : <ScenariosRow settings={settings} choices={choices} running={scenarios.run.running} hasRun={scenarios.run.runId !== null} onClear={scenarios.clear} />}
      <div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <main className="flex min-h-[28rem] min-w-0 flex-col p-4 lg:min-h-0 lg:overflow-y-auto lg:px-6">
          {mode === 'live' ? (
            <LivePane
              session={session} snapshot={snapshot} entries={feed.entries} decisions={rows} log={feed.log}
              startVoice={() => session.start(PLAYGROUND_CONVERSATION_ID, AGENT, '/dev/voice-playground')}
              sendText={text => sendToPlayground(socket, settings, { conversationId: PLAYGROUND_CONVERSATION_ID, clientMessageId: randomId(), text })}
            />
          ) : (
            <ScenariosPane
              library={scenarios.library} problem={scenarios.problem} run={scenarios.run} models={compare} labelOf={labelOf}
              onRun={() => void scenarios.start(compare, adaptiveVoice)} onSeeGroup={setGroup} onOpenLine={setLine}
            />
          )}
        </main>
        <aside aria-label="Tuning, lab and log" className="flex min-w-0 flex-col border-border-subtle bg-surface-1 max-lg:border-t lg:min-h-0 lg:border-l">
          <PaneBar title="Tuning" folded={tuningFolded} onToggle={toggleTuning}><BarButton onClick={() => resetListening(settings)}>Reset</BarButton></PaneBar>
          {!tuningFolded && <div className="border-b border-border-subtle px-3 py-2"><ListeningSliders settings={settings} mode={mode} /></div>}
          {mode === 'live' && <LabPanel runtime={runtime} />}
          <LogPanel lists={lists} sounds={mode === 'live'} />
        </aside>
      </div>
      <GroupDialog group={group} onClose={() => setGroup(null)} />
      {scenarios.library && (
        <LineDialog
          library={scenarios.library} run={scenarios.run} scenario={line} labelOf={labelOf}
          onMove={setLine} onClose={() => setLine(null)} sent={scenarios.sent}
        />
      )}
    </div>
  )
}
