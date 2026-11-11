import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getPlaceWorkflows, getWorkflow, approveWorkflowVersion } from 'wasp/client/operations'
import { Button, StatePill, FOCUS_RING } from '@agenthix/ui/primitives'
import { levelWords } from '../../workflows/pages/workflowWords'
import type { ListedWorkflow } from '../../workflows/pages/workflowTypes'
import { ShowAttention } from '@agenthix/ui/attention'

type Place = { type: 'user' | 'project'; id: string }
export type ProposedStarter = { workflow: string; proposed: boolean; version?: number; message?: string }

/**
 * *When it's connected* (G2): the starter workflows waiting for approval. Each still passes the card rule on its own:
 * *Approve all three* approves those the card may approve and says which need the full review.
 */
export function StartersPanel({ place, proposed, problem, repoLabel }: { place: Place; proposed: ProposedStarter[]; problem: string | null; repoLabel: string }) {
  const { data, refetch } = useQuery(getPlaceWorkflows, { place })
  const approve = useAction(approveWorkflowVersion)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [needFull, setNeedFull] = useState<string[]>([])

  const rows = proposed.map((p) => ({ p, w: data?.workflows.find((x) => x.name === p.workflow) }))
  const waiting = rows.filter((r) => r.p.proposed && r.w?.waiting.some((v) => v.number === r.p.version))
  const mayDecide = data?.mayAdminister ?? false

  return (
    <section aria-label="When it's connected" className="space-y-3" data-testid="starters-panel">
      <div className="flex items-center gap-2">
        <p className="text-body font-medium text-text-primary">{repoLabel}</p>
        <StatePill tone="healthy">Connected</StatePill>
      </div>
      <ShowAttention text={problem} title="The starters could not be proposed" />
      {rows.length > 0 && (
        <>
          <p className="text-small text-text-secondary">
            Agents can work on the code now. To push, pull and open pull requests they need these workflows, each approved once:
          </p>
          <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
            {rows.map(({ p, w }) => (
              <StarterRow key={p.workflow} proposal={p} workflow={w} canDecide={mayDecide}
                isNeedingFull={needFull.includes(p.workflow)} onApproved={() => void refetch()} />
            ))}
          </ul>
          {!mayDecide && <p className="text-small text-text-muted">Waiting for an administrator of this place to approve them.</p>}
          {mayDecide && waiting.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy} onClick={async () => {
                setBusy(true); setError(null); setNeedFull([])
                const full: string[] = []
                try {
                  for (const { p, w } of waiting) {
                    const v = w!.waiting.find((x) => x.number === p.version)!
                    const detail = await getWorkflow({ workflowId: w!.id })
                    if (detail.versions.find((x) => x.number === v.number)?.cardMayApprove !== true) { full.push(p.workflow); continue }
                    await approve({ workflowId: w!.id, hash: v.hash, via: 'card' })
                  }
                  setNeedFull(full)
                  await refetch()
                } catch (e) { setError(e) } finally { setBusy(false) }
              }}>{waiting.length === 3 ? 'Approve all three' : `Approve ${waiting.length === 1 ? 'it' : `all ${waiting.length}`}`}</Button>
              <Link className={`rounded text-small text-link hover:underline ${FOCUS_RING}`} to={`/workflows/${waiting[0].w!.id}/versions/${waiting[0].p.version}`}>Review each</Link>
              <span className="text-small text-text-muted">A workflow the checks don't allow to be approved from here needs its full review.</span>
            </div>
          )}
          <ShowAttention text={error} title="The starters were not approved" onClose={() => setError(null)} />
        </>
      )}
    </section>
  )
}

function StarterRow({ proposal, workflow, canDecide, isNeedingFull, onApproved }: {
  proposal: ProposedStarter; workflow: ListedWorkflow | undefined; canDecide: boolean; isNeedingFull: boolean; onApproved: () => void
}) {
  const { data } = useQuery(getWorkflow, workflow ? { workflowId: workflow.id } : undefined, { enabled: !!workflow })
  const version = proposal.version === undefined ? undefined : data?.versions.find((v) => v.number === proposal.version)
  const isApproved = !!workflow?.approved && (!proposal.version || workflow.approved.number >= proposal.version)
  const state = isApproved ? 'Approved' : proposal.proposed ? 'Waiting' : 'Not proposed'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5" data-testid="starter-row">
      <span className="font-mono text-body font-medium text-text-primary">{proposal.workflow}</span>
      <span className="min-w-0 flex-1 text-small text-text-muted">
        {proposal.proposed ? [version?.checkSummary, version ? `Reviewer: ${levelWords(version.reviewLevel)}` : null].filter(Boolean).join(' · ') : proposal.message}
        {isNeedingFull && ' · Needs its full review'}
      </span>
      <StatePill tone={isApproved ? 'healthy' : 'neutral'}>{state}</StatePill>
      {workflow && proposal.proposed && !isApproved && canDecide && (
        <Link className={`rounded text-small text-link hover:underline ${FOCUS_RING}`} to={`/workflows/${workflow.id}/versions/${proposal.version}`} onClick={onApproved}>Review</Link>
      )}
    </li>
  )
}
