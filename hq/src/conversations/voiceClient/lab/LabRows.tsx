import type { ReactNode } from 'react'
import { StatePill } from '@agenthix/ui'
import type { SavedOverflow } from './log'
import { Trace } from './Trace'
import { isBuilt, TRACE_POINTS, type LabState } from './rows'

const ms = (n: number | null) => (n === null ? 'none' : `${Math.round(n)} ms`)
const last = <T,>(list: readonly T[], n: number) => list.slice(-n).reverse()

function Row({ title, built, children }: { title: string; built: boolean; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-1 p-4">
      <h2 className="mb-3 text-h3 font-semibold text-text-primary">{title}</h2>
      {built ? children : <p className="text-body text-text-muted">no events yet</p>}
    </section>
  )
}

const Label = ({ children }: { children: ReactNode }) => (
  <span className="text-micro font-medium uppercase tracking-wide text-text-muted">{children}</span>
)

export function LabRows({ state, overflows, settingsVersion }: { state: LabState; overflows: readonly SavedOverflow[]; settingsVersion: number | null }) {
  const { silence, acoustic, stt, semantics, floor } = state
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Row title="Silence detection" built={isBuilt(state, 'silence')}>
        <Trace points={silence.trace} on={silence.detector?.onThreshold ?? null} off={silence.detector?.offThreshold ?? null} max={TRACE_POINTS} />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-body text-text-secondary">
          <StatePill tone={silence.silent === null ? 'neutral' : silence.silent ? 'warning' : 'healthy'}>
            {silence.silent === null ? 'No flag yet' : silence.silent ? 'Silent' : 'Voice'}
          </StatePill>
          {silence.detector && <span>on {silence.detector.onThreshold}, off {silence.detector.offThreshold}</span>}
        </div>
      </Row>

      <Row title="Echo and room" built={isBuilt(state, 'acoustic')}>
        <div className="flex flex-wrap items-center gap-3 text-body text-text-secondary">
          <span><Label>Echo level</Label> {acoustic.echoLevel === null ? 'none' : acoustic.echoLevel.toFixed(2)}</span>
          <span><Label>Room</Label> {acoustic.room ?? 'none'}</span>
        </div>
      </Row>

      <Row title="Speech to text" built={isBuilt(state, 'stt')}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-body text-text-secondary">
          <StatePill tone={stt.status === 'failed' ? 'danger' : stt.status === 'open' ? 'healthy' : 'neutral'}>{stt.status ?? 'no status'}</StatePill>
          <span><Label>Lag</Label> {ms(stt.lagMs)}</span>
          <span><Label>Queued</Label> {ms(stt.queuedMs)}</span>
        </div>
        <ul className="space-y-1 text-body">
          {stt.provisional && <li className="italic text-text-muted">{stt.provisional} <span className="text-micro">(provisional)</span></li>}
          {last(stt.committed, 6).map(w => <li key={`${w.t}-${w.text}`} className="text-text-primary">{w.text} <span className="text-micro text-text-muted">(committed)</span></li>)}
        </ul>
      </Row>

      <Row title="Semantics" built={isBuilt(state, 'semantics')}>
        <ul className="space-y-1 text-body text-text-secondary">
          {last(semantics.decisions, 4).map(d => (
            <li key={`d${d.t}`}>
              <StatePill tone={d.answer === 'READY' ? 'healthy' : d.answer === 'KEEP_LISTENING' ? 'neutral' : 'warning'}>{d.answer}</StatePill>{' '}
              after {ms(d.silenceMs)}, by {d.by}{d.confidence !== null && `, confidence ${d.confidence.toFixed(2)}`}
            </li>
          ))}
          {last(semantics.scores, 6).map(s => <li key={`s${s.t}`}>score {s.score.toFixed(2)} at {ms(s.silenceMs)} of silence</li>)}
        </ul>
      </Row>

      <Row title="The floor" built={isBuilt(state, 'floor')}>
        <div className="mb-2 text-body text-text-secondary"><Label>State</Label> {floor.state ?? 'none'}</div>
        <ul className="space-y-1 text-body text-text-secondary">
          {last(floor.playback, 8).map(p => <li key={`${p.t}-${p.action}`}>{p.action} reply {p.replyId} at {Math.round(p.t)} ms</li>)}
        </ul>
      </Row>

      <section className="rounded-2xl border border-border-subtle bg-surface-1 p-4">
        <h2 className="mb-3 text-h3 font-semibold text-text-primary">Queues and settings</h2>
        <div className="text-body text-text-secondary"><Label>Settings version</Label> {settingsVersion ?? 'unknown'}</div>
        <div className="mt-1 text-body text-text-secondary">
          <Label>Overflows</Label> {overflows.length === 0 ? 'none' : overflows.length}
        </div>
        <ul className="mt-1 space-y-1 text-body text-text-secondary">
          {last(overflows, 5).map((o, i) => (
            <li key={i}>{o.loop} queue dropped {o.droppedKind} at {Math.round(o.at)} ms</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
