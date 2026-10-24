import { useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { inConversationWords, levelWords, whenWords } from '../pages/workflowWords'
import type { VersionRow, WorkflowPlace } from '../pages/workflowTypes'
import { useWorkflowNames } from './useWorkflowNames'

const STATE_WORDS: Record<string, string> = { APPROVED: 'Approved', PROPOSED: 'Waiting', DECLINED: 'Declined', SUPERSEDED: 'Replaced' }

/** Every version: proposed by, the reviewer's level, approved or declined by and when; any two can be compared. */
export function VersionsTab({ place, versions, onOpen, onCompare }: {
  place: WorkflowPlace
  versions: VersionRow[]
  onOpen: (number: number) => void
  onCompare: (number: number, against: number) => void
}) {
  const names = useWorkflowNames(place)
  const [picked, setPicked] = useState<number[]>([])
  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n].slice(-2)))
  const proposer = (v: VersionRow) => v.origin === 'STARTER' ? 'a starter workflow' : v.origin === 'IMAGE_UPGRADE' ? 'hq, for a newer image' : `${names.agent(v.proposedByAgentId)}${inConversationWords(v.proposedIn)}`
  const decision = (v: VersionRow) => {
    const a = v.approvals[0]
    if (a) return `${a.automatic ? 'kept by hq' : `approved by ${names.person(a.approvedById)}`} ${whenWords(a.approvedAt)}`
    if (v.declinedAt) return `declined by ${names.person(v.declinedById)} ${whenWords(v.declinedAt)}`
    return ''
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-small text-text-secondary">Tick two versions to compare them.</p>
        <Button size="sm" variant="secondary" disabled={picked.length !== 2} onClick={() => onCompare(Math.max(...picked), Math.min(...picked))}>Compare</Button>
      </div>
      <ul className="divide-y divide-border-subtle rounded-xl border border-border bg-card" aria-label="Versions">
        {versions.map((v) => (
          <li key={v.number} className="flex items-center gap-3 px-3 py-2.5" data-testid="version-row">
            <input type="checkbox" aria-label={`Compare version ${v.number}`} checked={picked.includes(v.number)} onChange={() => toggle(v.number)} className="size-4 accent-accent" />
            <button type="button" onClick={() => onOpen(v.number)} className="min-w-0 flex-1 text-left">
              <span className="block text-body font-medium text-text-primary">Version {v.number} · {STATE_WORDS[v.state] ?? v.state}</span>
              <span className="block break-words text-small text-text-secondary">
                Proposed by {proposer(v)}, {whenWords(v.createdAt)} · Reviewer: {levelWords(v.reviewLevel)}{decision(v) ? ` · ${decision(v)}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
