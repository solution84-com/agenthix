/**
 * The side column's Lab (plan task 4c.1): the voice lab's state on six small cards, live from the running voice or
 * from a saved log loaded here, and its bar: the full lab's rows in a wide panel over the page, Save log, Load log,
 * and Record (the lab's recording panel, in a dialog).
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, StatePill } from '@agenthix/ui'
import type { VoiceRuntimeHandle } from '../runtime/types'
import { LabRows } from '../lab/LabRows'
import { RecordingPanel } from '../lab/RecordingPanel'
import { Trace } from '../lab/Trace'
import { download, readText } from '../lab/VoiceLab'
import { parseLog, savedOverflows, serializeLog, type LoadedLog, type SavedOverflow } from '../lab/log'
import { isBuilt, reduceAll, TRACE_POINTS, type LabState } from '../lab/rows'
import { useLabFeed } from '../lab/useLabFeed'
import { PaneBar, BarButton, useFolded } from './PaneBar'

const ms = (n: number | null) => (n === null ? 'none' : `${Math.round(n)} ms`)

function Card({ title, built, children }: { title: string; built: boolean; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border-subtle bg-surface-1 p-2 text-micro text-text-secondary">
      <h3 className="mb-1 truncate text-micro font-semibold uppercase tracking-wide text-text-muted" title={title}>{title}</h3>
      {built ? children : <p className="text-text-muted">no events yet</p>}
    </section>
  )
}

const Big = ({ children }: { children: ReactNode }) => <span className="text-small font-semibold text-text-primary">{children}</span>

export function LabCards({ state, overflows, settingsVersion }: { state: LabState; overflows: readonly SavedOverflow[]; settingsVersion: number | null }) {
  const { silence, acoustic, stt, semantics, floor } = state
  const decision = semantics.decisions.at(-1)
  const said = stt.provisional || stt.committed.at(-1)?.text
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="lab-cards">
      <Card title="Silence" built={isBuilt(state, 'silence')}>
        <div className="[&_svg]:h-7"><Trace points={silence.trace} on={silence.detector?.onThreshold ?? null} off={silence.detector?.offThreshold ?? null} max={TRACE_POINTS} /></div>
        <StatePill tone={silence.silent === null ? 'neutral' : silence.silent ? 'warning' : 'healthy'}>
          {silence.silent === null ? 'no flag' : silence.silent ? 'silent' : 'voice'}
        </StatePill>
        {silence.detector && <span> on {silence.detector.onThreshold} · off {silence.detector.offThreshold}</span>}
      </Card>
      <Card title="Echo and room" built={isBuilt(state, 'acoustic')}>
        <Big>{acoustic.echoLevel === null ? 'none' : acoustic.echoLevel.toFixed(2)}</Big>
        <div>echo level · {acoustic.room ?? 'room unknown'}</div>
      </Card>
      <Card title="Speech to text" built={isBuilt(state, 'stt')}>
        <StatePill tone={stt.status === 'failed' ? 'danger' : stt.status === 'open' ? 'healthy' : 'neutral'}>{stt.status ?? 'no status'}</StatePill>
        <div>lag {ms(stt.lagMs)} · queued {ms(stt.queuedMs)}</div>
        {said && <div className="truncate italic" title={said}>{said}</div>}
      </Card>
      <Card title="Finished? (audio)" built={isBuilt(state, 'semantics')}>
        {decision ? (
          <>
            <StatePill tone={decision.answer === 'READY' ? 'healthy' : decision.answer === 'KEEP_LISTENING' ? 'neutral' : 'warning'}>{decision.answer}</StatePill>
            {decision.confidence !== null && <> <Big>{decision.confidence.toFixed(2)}</Big></>}
            <div>after {ms(decision.silenceMs)} · by {decision.by}</div>
          </>
        ) : <div>score {semantics.scores.at(-1)?.score.toFixed(2) ?? 'none'}</div>}
      </Card>
      <Card title="The floor" built={isBuilt(state, 'floor')}>
        <StatePill>{floor.state ?? 'none'}</StatePill>
        {floor.playback.length > 0 && <div>last: {floor.playback.slice(-2).map(p => p.action).join(', ')}</div>}
      </Card>
      <Card title="Queues" built>
        <Big>{overflows.length}</Big>
        <div>dropped events · settings {settingsVersion === null ? 'unknown' : `v${settingsVersion}`}</div>
      </Card>
    </div>
  )
}

export function LabPanel({ runtime }: { runtime: VoiceRuntimeHandle | null }) {
  const live = useLabFeed(runtime)
  const [loaded, setLoaded] = useState<LoadedLog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [recording, setRecording] = useState(false)
  const [folded, toggleFold] = useFolded('lab')
  const input = useRef<HTMLInputElement>(null)
  const loadedState = useMemo(() => (loaded ? reduceAll(loaded.events) : null), [loaded])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try { setLoaded(parseLog(await readText(file))); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'This file could not be read.') }
  }
  const showing = loaded && loadedState ? { state: loadedState, overflows: loaded.overflows, settingsVersion: loaded.settingsVersion }
    : { state: live.state, overflows: savedOverflows(live.overflows), settingsVersion: live.settingsVersion }

  return (
    <>
      <PaneBar title="Lab" folded={folded} onToggle={toggleFold}>
        {loaded && <BarButton onClick={() => setLoaded(null)}>Back to live</BarButton>}
        <BarButton onClick={() => setFull(true)}>Open full lab</BarButton>
        <BarButton disabled={!runtime || live.events.length === 0} onClick={() => download(serializeLog(live.events, live.overflows, live.settingsVersion))}>Save log</BarButton>
        <BarButton onClick={() => input.current?.click()}>Load log</BarButton>
        <BarButton onClick={() => setRecording(true)}>● Record</BarButton>
        <input ref={input} type="file" accept="application/json,.json" aria-label="Saved voice log" className="hidden" onChange={e => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      </PaneBar>
      {!folded && <div className="border-b border-border-subtle px-3 py-2">
        {loaded && <p className="mb-1 text-micro text-warning">A saved log, {loaded.events.length} events</p>}
        {error && <p role="alert" className="mb-1 text-micro text-danger">{error}</p>}
        <LabCards {...showing} />
      </div>}
      <Modal open={full} onClose={() => setFull(false)} title="Voice lab" closeLabel="Close" side="right" maxWidth="max-w-[1100px]">
        <LabRows {...showing} />
      </Modal>
      <Modal open={recording} onClose={() => setRecording(false)} title="Record" closeLabel="Close" maxWidth="max-w-3xl">
        <RecordingPanel />
      </Modal>
    </>
  )
}
