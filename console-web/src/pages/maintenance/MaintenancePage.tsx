import { useState } from 'react'
import type { ScheduledChange } from '@agenthix/core'
import { Button, EmptyState, StatePill } from '@agenthix/ui/primitives'
import { Card, HowThisWorks, ListTitleRow, Notice, SectionHeading } from '../../components'
import { Link } from '../../router'
import { useShellPanel } from '../../shell/useShellPanel'
import { useFleet } from '../dashboard/useFleet'
import { whenIs } from '../dashboard/words'
import { CancelChangeModal, ChangeTimeModal } from './ChangeModals'
import { UpgradeRun } from './UpgradeRun'
import { useScheduleActions } from './useScheduleActions'
import { changeableHere, changeLists, changeTitle, scheduledBy, stateOf, type ChangeEntry } from './words'

type Open = { kind: 'time' | 'cancel'; change: ScheduledChange } | null

/**
 * Maintenance (board *Changes flow*, proposal): the work planned across HQ and the sites, and when members are told —
 * planned, under way, and done in the last 30 days — and *Plan maintenance*, which opens beside the list.
 */
export function MaintenancePage({ pollMs }: { pollMs?: number } = {}) {
  const state = useFleet()
  const fleet = state.phase === 'loading' ? null : state.fleet
  const now = state.phase === 'loading' ? new Date() : state.readAt ?? new Date()
  const [open, setOpen] = useState<Open>(null)
  const actions = useScheduleActions(() => { setOpen(null); state.refresh() }, pollMs)
  const lists = fleet ? changeLists(fleet.hosts, now) : null
  const close = () => { setOpen(null); actions.reset() }
  const { openMaintenance } = useShellPanel()

  return (
    <>
      <ListTitleRow
        title="Maintenance"
        help={<HowThisWorks topic="back-up-and-upgrade" section="plan-maintenance" />}
        lede="Upgrades, moves and other work on HQ and the sites: what is planned, and when members are told"
        add={<Button variant="primary" onClick={() => openMaintenance()}>+ Plan maintenance</Button>}
      />
      {state.phase === 'failed' && (
        <Notice title={fleet ? 'The list below is not current' : 'The list could not be read'} retry={state.refresh}>{state.message}</Notice>
      )}
      {lists && (
        <>
          <SectionHeading>{`Planned · ${lists.planned.length}`}</SectionHeading>
          {lists.planned.length === 0
            ? <EmptyState title="Nothing is planned." hint="Plan maintenance and choose a time: members are told from then." />
            : lists.planned.map(e => <ChangeRow key={`${e.change.machine.fingerprint}:${e.change.id}`} entry={e} now={now} onTime={() => setOpen({ kind: 'time', change: e.change })} onCancel={() => setOpen({ kind: 'cancel', change: e.change })} />)}
          <SectionHeading>Done recently · last 30 days</SectionHeading>
          {lists.done.length === 0
            ? <p className="text-small text-text-muted">Nothing ended in the last 30 days.</p>
            : lists.done.map(e => <ChangeRow key={`${e.change.machine.fingerprint}:${e.change.id}`} entry={e} now={now} />)}
        </>
      )}
      {open?.kind === 'time' && (
        <ChangeTimeModal change={open.change} state={actions.state} onClose={close}
          onSave={at => void actions.changeTime(open.change, at)} onCancelChange={() => { actions.reset(); setOpen({ kind: 'cancel', change: open.change }) }} />
      )}
      {open?.kind === 'cancel' && <CancelChangeModal change={open.change} state={actions.state} onClose={close} onConfirm={() => void actions.cancel(open.change)} />}
    </>
  )
}

function ChangeRow({ entry, now, onTime, onCancel }: { entry: ChangeEntry; now: Date; onTime?: () => void; onCancel?: () => void }) {
  const c = entry.change
  const state = stateOf(entry)
  const planned = onTime !== undefined
  const showRun = c.kind === 'upgrade' && (c.state === 'pausing' || c.state === 'running' || c.state === 'rolledBack')
  const meta = [
    whenIs(c.at, now),
    planned && c.expectedMinutes ? `about ${c.expectedMinutes} minutes` : null,
    planned && c.state === 'scheduled' ? 'members told from now' : null,
    `by ${scheduledBy(c.scheduledBy)}`,
  ].filter(Boolean).join(' · ')
  return (
    <Card className="mb-2">
      <article aria-label={changeTitle(c)}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text-primary">{changeTitle(c)}</p>
            <p className="text-small text-text-secondary">{meta}</p>
            {state.detail && !showRun && <p className="text-small text-text-secondary">{state.detail}</p>}
          </div>
          {(!planned || c.state !== 'scheduled') && <StatePill tone={state.tone}>{state.label}</StatePill>}
          {planned && c.scheduledBy.kind === 'cloud' && <StatePill>Cloud</StatePill>}
          {planned && changeableHere(c) && c.state === 'scheduled' && (
            <>
              <Button variant="secondary" onClick={onTime}>Change time</Button>
              <Button variant="danger" onClick={onCancel}>Cancel</Button>
            </>
          )}
        </div>
        {showRun && <UpgradeRun entry={entry} now={now} />}
        {c.state === 'rolledBack' && c.kind === 'upgrade' && (
          <p className="mt-2 text-small"><Link to={c.target === 'hq' ? '/hq' : `/sites/${c.machine.fingerprint}`} className="underline">Open {c.target === 'hq' ? 'HQ' : c.machine.name}</Link></p>
        )}
      </article>
    </Card>
  )
}
