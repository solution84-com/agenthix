import { useState, type ReactNode } from 'react'
import { Button, COPY_FAILED_WORDS, copyText, StatePill, type PillTone } from '@agenthix/ui/primitives'
import { KeyValueRow, Notice } from '../../components'
import type { JoinStep, StepState } from './joinWords'

const Label = ({ children }: { children: ReactNode }) => (
  <p className="mb-1.5 text-micro font-semibold uppercase tracking-[.06em] text-text-muted">{children}</p>
)

/** The one-time code, how long it works, and the command the machine admin runs with it. */
export function CodePanel({ code, lifetime, command }: { code: string; lifetime: string; command: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyCommand = () => { void copyText(command).then(ok => setCopy(ok ? 'copied' : 'failed')) }
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>One-time code</Label>
        <p className="font-mono text-h1 font-bold tracking-[.08em] text-text-primary" aria-label="One-time code">{code}</p>
        <p className="text-small text-text-secondary">{lifetime}</p>
      </div>
      <div>
        <Label>The machine admin runs, on the new machine</Label>
        <code className="block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-small text-text-primary">$ {command}</code>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" type="button" onClick={copyCommand}>Copy the command</Button>
        {copy === 'copied' && <span className="text-small text-text-secondary">Copied.</span>}
        {copy === 'failed' && <Notice kind="alert" title="Not copied">{COPY_FAILED_WORDS}</Notice>}
      </div>
    </div>
  )
}

export function WaitingRow({ left }: { left: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-small text-text-primary">
      <span className="flex-1">Waiting for the machine to connect… <span className="text-text-muted">{left}</span></span>
      <StatePill>Waiting</StatePill>
    </div>
  )
}

/** The machine that used the code, for the fleet admin to compare with what the machine printed. */
export function MachineCheck({ machine, warnings, confirmLabel, busy, onConfirm, onRefuse }: {
  machine: { name: string; fingerprintShort: string }
  warnings: string[]
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onRefuse: () => void
}) {
  return (
    <section aria-label="The machine that used the code" className="flex flex-col gap-2">
      <div className="rounded-xl border border-border bg-card px-4 py-2">
        <KeyValueRow label="Name">{machine.name}</KeyValueRow>
        <KeyValueRow label="Fingerprint"><span className="font-mono">{machine.fingerprintShort}</span></KeyValueRow>
      </div>
      {warnings.map(w => (
        <p key={w} className="rounded-lg border border-warning/35 bg-warning/7 px-3 py-2 text-small text-text-primary">{w}</p>
      ))}
      <p className="text-small text-text-secondary">
        The machine admin sees the same fingerprint on the machine. Compare them before you confirm; if they differ, refuse.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" type="button" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
        <Button variant="secondary" type="button" disabled={busy} onClick={onRefuse}>Refuse</Button>
      </div>
    </section>
  )
}

const STEP_PILL: Record<StepState, { tone: PillTone; words: string }> = {
  done: { tone: 'healthy', words: 'Done' },
  current: { tone: 'neutral', words: 'Under way' },
  todo: { tone: 'neutral', words: 'Not yet' },
  failed: { tone: 'danger', words: 'Did not complete' },
}

/** Steps in order, each with its state in words. */
export function Steps({ steps }: { steps: (JoinStep & { detail?: string | null })[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map(s => (
        <li key={s.label} className={`flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 ${s.state === 'todo' ? 'opacity-70' : ''}`}>
          <div className="min-w-0 flex-1">
            <p className={`text-body text-text-primary ${s.state === 'current' ? 'font-semibold' : ''}`}>{s.label}</p>
            {s.detail && <p className="text-small text-text-secondary">{s.detail}</p>}
          </div>
          <StatePill tone={STEP_PILL[s.state].tone}>{STEP_PILL[s.state].words}</StatePill>
        </li>
      ))}
    </ol>
  )
}
