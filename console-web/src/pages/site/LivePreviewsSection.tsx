import { useState, type FormEvent } from 'react'
import {
  LIVE_PREVIEW_IDLE_MINUTES_MAX, LIVE_PREVIEW_IDLE_MINUTES_MIN, LIVE_PREVIEW_LIMIT_MAX, type FleetLivePreview,
} from '@agenthix/core'
import { ReadFailure, useBackgroundRead } from '@agenthix/ui/attention'
import { Button, FormField, Input, StatePill, ConfirmDialog } from '@agenthix/ui/primitives'
import { FactCard, FactGroup, KeyValueRow, Notice, Say } from '../../components'
import { backgroundQuery, becauseOf } from '../../api/quietRead'
import { REFRESH_MS } from '../dashboard/useFleet'
import type { FleetHost } from '../dashboard/types'
import { MEMORY_GB, whenIs } from '../dashboard/words'
import {
  idleWords, isBusy, limitWords, memoryUseWords, openWords, processorUseWords, stateWords, turnOffWords,
} from './livePreviewsWords'
import { setLivePreviews, stopLivePreview, useSiteLivePreviews, type LivePreviewsSetting } from './useSiteLivePreviews'

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** What is wrong with what the fleet admin typed, by field: a limit (empty for none) and minutes. */
export function settingFieldErrors(limit: string, idle: string): { limit?: string; idle?: string } {
  const l = limit.trim() === '' ? null : Number(limit)
  const m = Number(idle)
  return {
    limit: l !== null && (!Number.isInteger(l) || l < 1 || l > LIVE_PREVIEW_LIMIT_MAX)
      ? `The limit is a whole number from 1 to ${LIVE_PREVIEW_LIMIT_MAX}, or empty for none. Nothing was changed.` : undefined,
    idle: !Number.isInteger(m) || m < LIVE_PREVIEW_IDLE_MINUTES_MIN || m > LIVE_PREVIEW_IDLE_MINUTES_MAX
      ? `Stop when unused for is a whole number of minutes from ${LIVE_PREVIEW_IDLE_MINUTES_MIN} to ${LIVE_PREVIEW_IDLE_MINUTES_MAX}. Nothing was changed.` : undefined,
  }
}

/** What the fleet admin typed, read; a sentence when either is out of range. */
export function readSettingForm(limit: string, idle: string): { limit: number | null; idleMinutes: number } | string {
  const wrong = settingFieldErrors(limit, idle)
  if (wrong.limit || wrong.idle) return (wrong.limit ?? wrong.idle) as string
  return { limit: limit.trim() === '' ? null : Number(limit), idleMinutes: Number(idle) }
}

/**
 * A site's live previews (live preview spec section 5): whether they run on this site, an optional limit, when an
 * unused one stops, what they use against the machine, and the live previews open now. A fleet admin sets and stops
 * them here, and never sees inside one. HQ decides and checks the role.
 */
export function LivePreviewsSection({ host, now }: { host: FleetHost; now: Date }) {
  const { view, problem, error, readAt, reload } = useSiteLivePreviews(host.fingerprint)
  const read = useBackgroundRead(backgroundQuery({ data: view, error, readAt, refetch: reload }), { what: 'The live previews', pollMs: REFRESH_MS, because: becauseOf })
  const [turningOff, setTurningOff] = useState(false)
  const [stopping, setStopping] = useState<FleetLivePreview | null>(null)
  const [editing, setEditing] = useState<{ limit: string; idle: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ limit?: string; idle?: string }>({})

  const run = (work: Promise<unknown>, done: () => void = () => undefined) => {
    setBusy(true)
    setRefusal(null)
    work.then(() => { done(); reload() }).catch((err: unknown) => { setRefusal(message(err)); reload() }).finally(() => setBusy(false))
  }

  if (!view) {
    // HQ older than this Fleet Console keeps no live previews: a final answer, said in its own words without Try again.
    if (!problem) return null
    return (
      <FactGroup tag="Live previews" aside="apps running from a branch, on this site">
        {problem.includes('older than this') ? <ReadFailure what="The live previews" final={problem} /> : read.nudge}
      </FactGroup>
    )
  }

  const setting: LivePreviewsSetting = { allowed: view.allowed, limit: view.limit, idleMinutes: view.idleMinutes }
  const total = host.figures ? String(Math.round((host.figures.resources.memory.totalBytes / MEMORY_GB) * 10) / 10) : null
  const busyNow = isBusy(view.capacity)
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const read = readSettingForm(editing.limit, editing.idle)
    setFieldErrors(settingFieldErrors(editing.limit, editing.idle))
    if (typeof read === 'string') return
    setRefusal(null)
    run(setLivePreviews(host.fingerprint, { ...setting, ...read }), () => setEditing(null))
  }

  return (
    <FactGroup tag="Live previews" aside="apps running from a branch, on this site" meta={read.nudge}>
      {refusal && <Notice kind="alert" title="Nothing was changed">{refusal}</Notice>}
      <FactCard title="Live previews on this site" aside={<StatePill tone={view.allowed ? 'healthy' : 'neutral'}>{view.allowed ? 'On' : 'Off'}</StatePill>}>
        <KeyValueRow label="Live previews at once">{limitWords(view.limit)}</KeyValueRow>
        <KeyValueRow label="Stop when unused for">{idleWords(view.idleMinutes)}</KeyValueRow>
        {view.problems.map(p => <Say key={p} warn>{p}</Say>)}
        {editing === null ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {view.allowed
              ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => (view.livePreviews.length > 0 ? setTurningOff(true) : run(setLivePreviews(host.fingerprint, { ...setting, allowed: false })))}>Turn live previews off…</Button>
              : <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(setLivePreviews(host.fingerprint, { ...setting, allowed: true }))}>Turn live previews on</Button>}
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setFieldErrors({}); setEditing({ limit: view.limit === null ? '' : String(view.limit), idle: String(view.idleMinutes) }) }}>Change limits…</Button>
          </div>
        ) : (
          <form onSubmit={save} className="mt-1 flex flex-wrap items-end gap-2">
            <FormField label="Live previews at once" htmlFor="live-previews-limit" error={fieldErrors.limit}>
              <Input id="live-previews-limit" inputMode="numeric" autoComplete="off" placeholder="No limit" value={editing.limit}
                onChange={e => setEditing({ ...editing, limit: e.target.value })} />
            </FormField>
            <FormField label="Stop when unused for (minutes)" htmlFor="live-previews-idle" error={fieldErrors.idle}>
              <Input id="live-previews-idle" inputMode="numeric" autoComplete="off" value={editing.idle}
                onChange={e => setEditing({ ...editing, idle: e.target.value })} />
            </FormField>
            <Button type="submit" size="sm" disabled={busy}>Save</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setEditing(null); setFieldErrors({}) }}>Cancel</Button>
          </form>
        )}
        <p className="text-micro text-text-muted">Lowering the limit stops none: new ones wait for room.</p>
      </FactCard>

      <FactCard title="Capacity" aside={busyNow ? <StatePill tone="warning">Busy</StatePill> : undefined}>
        <KeyValueRow label="Live previews">{openWords(view.capacity, view.livePreviews.length)}</KeyValueRow>
        <KeyValueRow label="Memory">{memoryUseWords(view.capacity, total)}</KeyValueRow>
        <KeyValueRow label="Processors">{processorUseWords(view.capacity)}</KeyValueRow>
        {busyNow && <Say warn lead="This site is busy.">Live previews still start, but each one slows the others. Stop some, or give the machine more memory. Fleet admins are told when it recovers.</Say>}
      </FactCard>

      <FactCard title="Live previews open" wide>
        {view.livePreviews.length === 0 ? <p className="text-small text-text-secondary">No live preview is open on this site.</p> : (
          <ul aria-label="Live previews open">
            {view.livePreviews.map(p => {
              const s = stateWords(p)
              return (
                <li key={p.livePreviewId} aria-label={`${p.person.name}, ${p.workspaceName} · ${p.branch}`} className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle py-2.5 first:border-t-0">
                  <div className="min-w-0 flex-1 text-small">
                    <b className="font-semibold">{p.person.name}</b>
                    <span className="text-text-secondary"> · {p.projectName} › {p.workspaceName} · <span className="font-mono">{p.branch}</span> · last used {whenIs(p.lastUsedAt, now)}</span>
                  </div>
                  <StatePill tone={s.tone}>{s.label}</StatePill>
                  <Button variant="danger" size="sm" disabled={busy} onClick={() => setStopping(p)}>Stop</Button>
                </li>
              )
            })}
          </ul>
        )}
      </FactCard>

      <ConfirmDialog
        open={turningOff} title="Turn live previews off on this site?" confirmLabel="Turn off and stop them" destructive busy={busy}
        onCancel={() => setTurningOff(false)}
        onConfirm={() => run(setLivePreviews(host.fingerprint, { ...setting, allowed: false }, true), () => setTurningOff(false))}
      >
        <p className="text-small">{turnOffWords(view.livePreviews)}</p>
        <ul aria-label="Live previews this stops" className="mt-2 space-y-1 text-small text-text-secondary">
          {view.livePreviews.map(p => <li key={p.livePreviewId}>{p.person.name} · {p.projectName} › {p.workspaceName} · {p.branch}</li>)}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={stopping !== null} title={stopping ? `Stop ${stopping.person.name}’s live preview?` : ''} confirmLabel="Stop the live preview" destructive busy={busy}
        onCancel={() => setStopping(null)}
        onConfirm={() => stopping && run(stopLivePreview(host.fingerprint, stopping.livePreviewId), () => setStopping(null))}
      >
        {stopping && <p className="text-small">{stopping.person.name} is told. The live preview of {stopping.branch} stops; the branch and its work in {stopping.workspaceName} are untouched.</p>}
      </ConfirmDialog>
    </FactGroup>
  )
}
