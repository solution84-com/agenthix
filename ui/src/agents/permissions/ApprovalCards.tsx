import { BRANDING } from '@agenthix/core'
import { APPROVAL_WORDS } from '../projectAgentTypes'
import { offeredApprovals } from './permissionsModel'
import type { ApprovalId } from './permissionsTypes'
import { CARD_CHOSEN } from '../../primitives/controlStyles'

const CARDS: Record<ApprovalId, { title: string; text: string }> = {
  bypassed: {
    title: '⚠ Bypassed',
    text: `Every tool runs, including tools set to Never. No one is asked. In ${BRANDING.displayName} it can only do what the person it works for may do.`,
  },
  deferred: { title: 'Deferred', text: 'Carries on, and lists every Ask for a person to approve at the end.' },
  immediate: { title: 'Immediate', text: 'Stops at the first Ask and asks a person at once.' },
}

const BASE = 'rounded-xl border px-3 py-2 text-left text-small transition-colors disabled:cursor-default'

function tone(id: ApprovalId, selected: boolean): string {
  if (id === 'bypassed') return selected ? 'border-danger bg-danger/10 text-text-primary' : 'border-danger/40 bg-surface-1 text-text-secondary hover:bg-danger/5'
  return selected ? `border-border bg-card text-text-primary ${CARD_CHOSEN}` : 'border-border bg-card text-text-secondary not-disabled:hover:bg-card-hover not-disabled:hover:border-border-strong'
}

/**
 * Approval as three cards (Bypassed, Deferred, Immediate), Bypassed marked as a warning. Below the organisation
 * only its approval and stricter ones are drawn, with the organisation's setting beneath.
 */
export function ApprovalCards({ value, limit, organisation, narrowed, readOnly, onChange }: {
  value: ApprovalId
  limit: ApprovalId
  /** The organisation's approval, shown under the cards, at the levels below it. */
  organisation: ApprovalId | null
  narrowed: boolean
  readOnly: boolean
  onChange: (next: ApprovalId) => void
}) {
  return (
    <div>
      <p className="text-micro font-medium uppercase tracking-wide text-text-muted">Approval — when a person is asked about a tool set to Ask</p>
      <div role="group" aria-label="Approval" className="mt-2 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        {offeredApprovals(limit).map(id => (
          <button key={id} type="button" aria-pressed={value === id} disabled={readOnly} onClick={() => onChange(id)} className={`${BASE} ${tone(id, value === id)}`}>
            <b className={`block text-body ${id === 'bypassed' ? 'text-danger' : 'text-text-primary'}`}>{CARDS[id].title}</b>
            {CARDS[id].text}
          </button>
        ))}
      </div>
      {organisation && (
        <p className="mt-1.5 text-small text-text-muted">
          Organisation: {APPROVAL_WORDS[organisation]}
          {narrowed && <> · <b className="font-medium text-text-primary">narrowed</b></>}
        </p>
      )}
    </div>
  )
}
