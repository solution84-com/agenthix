import { useState } from 'react'
import { useAction, makeDefaultBillingProfile } from 'wasp/client/operations'
import { Button, StatePill } from '@agenthix/ui/primitives'
import { OverflowMenu, type OverflowItem } from '@agenthix/ui/tasks'
import type { BillingProfileListItem } from '../reads'
import { BASIS_ORDER, BASIS_WORDS, moneyOf } from './costWords'
import { ShowAttention } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

/** This month as `$41.20 actual · $6.10 estimated`; a basis with no amount (included, unpriced) is left out. */
export function thisMonthWords(p: BillingProfileListItem): string {
  const parts = BASIS_ORDER.flatMap(basis => p.thisMonth
    .filter(t => t.basis === basis && t.amountMicros !== null)
    .map(t => `${moneyOf(t.amountMicros as number, t.currency)} ${BASIS_WORDS[basis].label.toLowerCase()}`))
  return parts.length ? parts.join(' · ') : 'Nothing yet'
}

export function projectsWords(p: BillingProfileListItem): string {
  if (p.projects.length === 0) return p.isDefault ? "No projects yet, everyone's own places, HQ's own calls" : 'No projects'
  const names = p.projects.map(x => x.name).join(', ')
  const n = p.projects.length
  return `${n} ${n === 1 ? 'project' : 'projects'}: ${names}${p.isDefault ? ", everyone's own places, HQ's own calls" : ''}`
}

export function ProfileLine({ profile: p, onRename, onArchive }: { profile: BillingProfileListItem; onRename: () => void; onArchive: () => void }) {
  const makeDefault = useAction(makeDefaultBillingProfile)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const choose = async () => {
    setBusy(true)
    setError('')
    try { await makeDefault({ id: p.id }) } catch (err) { setError(pressFailureWords(err, 'Could not change the default')) } finally { setBusy(false) }
  }
  const items: OverflowItem[] = [
    { label: 'Rename', onSelect: onRename },
    ...(p.isDefault ? [] : [{ label: 'Archive', onSelect: onArchive, danger: true }]),
  ]
  return (
    <li className="rounded-2xl border border-border-subtle bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body font-medium text-text-primary">{p.name}</h3>
            {p.isDefault && <StatePill tone="healthy">Default</StatePill>}
          </div>
          <p className="mt-0.5 text-small text-text-secondary">{projectsWords(p)}</p>
          <p className="mt-1 text-small text-text-secondary">This month: {thisMonthWords(p)}</p>
          <ShowAttention kind="alert" text={error} title="The default was not changed" onClose={() => setError('')} />
        </div>
        <div className="flex items-center gap-2">
          {!p.isDefault && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void choose()}>Make default</Button>}
          <OverflowMenu items={items} label={`More about ${p.name}`} />
        </div>
      </div>
    </li>
  )
}
