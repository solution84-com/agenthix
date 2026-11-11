import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  useQuery, useAction, getWorkflow, getWorkflowVersion, approveWorkflowVersion, declineWorkflowVersion,
} from 'wasp/client/operations'
import { Button, PanelHeaderContent, ViewHeaderRow } from '@agenthix/ui/primitives'
import { DiffFileView } from '../components/DiffFileView'
import { StepsTab } from '../components/StepsTab'
import { useWorkflowNames } from '../components/useWorkflowNames'
import { TabNav } from '../../shared/components/ui/TabNav'
import { compareVersions } from './compareVersions'
import { inConversationWords, levelWords } from './workflowWords'
import type { WorkflowPlace, WorkflowVersionView } from './workflowTypes'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

type Tab = 'changes' | 'files' | 'steps'
type Points = { points?: { file: string; line: number; text: string }[]; note?: string } | null

/**
 * The full review of a version (workflows spec part 5, U4): the reviewer's points first, then the checks, then Changes
 * (against the approved version, or against the one chosen), All files and Steps. Approve and Decline are in the header
 * for the place's administrators; the approved version keeps running until a decision. The answer carries the version's
 * hash, so it can only approve what is shown here.
 */
export function VersionReviewView({ place, workflowId, number, against, onBack, onDecided }: {
  place: WorkflowPlace
  workflowId: string
  number: number
  against: number | null
  onBack: () => void
  onDecided: () => void
}) {
  const workflowQuery = useQuery(getWorkflow, { workflowId })
  const { data: workflow } = workflowQuery
  const versionQuery = useQuery(getWorkflowVersion, { workflowId, number })
  const { data: version } = versionQuery
  const otherQuery = useQuery(getWorkflowVersion, against ? { workflowId, number: against } : undefined, { enabled: against !== null })
  const { data: other } = otherQuery
  // The page is three reads; it is on screen once all are, and one failing leaves what is there.
  const queries = against !== null ? [versionQuery, workflowQuery, otherQuery] : [versionQuery, workflowQuery]
  const read = useBackgroundRead({
    data: queries.every(q => q.data) ? true : undefined,
    error: queries.map(q => q.error).find(e => e !== null && e !== undefined) ?? null,
    dataUpdatedAt: Math.min(...queries.map(q => q.dataUpdatedAt)),
    refetch: () => Promise.all(queries.map(q => q.refetch())),
  }, { what: 'The version' })
  const approve = useAction(approveWorkflowVersion)
  const decline = useAction(declineWorkflowVersion)
  const names = useWorkflowNames(place)
  const [tab, setTab] = useState<Tab>('changes')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)

  if (read.failedWithoutData) return read.nudge
  if (!version || !workflow || (against !== null && !other)) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const row = workflow.versions.find((v) => v.number === number)
  const decidable = workflow.mayAdminister && version.state === 'PROPOSED' && against === null
  const comparison: WorkflowVersionView | null = against !== null ? (other ?? null) : null
  const diff = comparison ? compareVersions(comparison, version) : version.diff
  const baseline = comparison ? `version ${comparison.number}` : version.approvedNumber ? `version ${version.approvedNumber}, the approved one` : null
  const review = (version.reviewPoints ?? null) as Points

  const decide = async (kind: 'approve' | 'decline') => {
    setBusy(true)
    setFailure(null)
    try {
      await (kind === 'approve' ? approve({ workflowId, hash: version.hash, via: 'review' }) : decline({ workflowId, hash: version.hash }))
      onDecided()
    } catch (e) {
      setFailure(e)
    } finally {
      setBusy(false)
    }
  }

  const origin = row?.origin === 'STARTER' ? 'a starter workflow' : row?.origin === 'IMAGE_UPGRADE' ? 'HQ, for a newer executor image' : `${names.agent(row?.proposedByAgentId)}${inConversationWords(version.proposedIn)}`
  return (
    <div className="max-w-3xl space-y-4 p-4">
      <ViewHeaderRow><PanelHeaderContent back={workflow.name} onBack={onBack} title={`Version ${number}`} /></ViewHeaderRow>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-h2 font-medium text-text-primary">{decidable ? 'Review' : 'Version'} {workflow.name}, version {number}{comparison ? `, compared with version ${comparison.number}` : ''}</h2>
          <p className="text-small text-text-secondary">
            Proposed by {origin}
            {decidable && version.approvedNumber ? ` · version ${version.approvedNumber} keeps running until you decide` : ''}
          </p>
        </div>
        {decidable && (
          <div className="flex gap-2 max-lg:w-full">
            <Button variant="secondary" disabled={busy} onClick={() => void decide('decline')}>Decline</Button>
            <Button disabled={busy} onClick={() => void decide('approve')}>Approve version {number}</Button>
          </div>
        )}
      </div>
      {read.nudge}
      <ShowAttention kind="alert" text={failure} title="The version was not decided" onClose={() => setFailure(null)} />
      {version.needsApprovalAgain && <p className="text-small text-text-primary">{version.needsApprovalAgain}</p>}

      <section aria-label="The reviewer" className="rounded-xl border border-border bg-card px-3 py-2.5" data-testid="review-points">
        <h3 className="text-small font-medium text-text-primary">Reviewer · {levelWords(version.reviewLevel)}</h3>
        {review?.points && review.points.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-small text-text-secondary">
            {review.points.map((p, i) => <li key={i}>{p.text} (<code className="font-mono">{p.file}:{p.line}</code>)</li>)}
          </ul>
        ) : <p className="mt-1 text-small text-text-muted">{review?.note ?? 'The reviewer has no points.'}</p>}
      </section>

      <section aria-label="Checks" className="rounded-xl border border-border bg-card px-3 py-2.5" data-testid="review-checks">
        <h3 className="text-small font-medium text-text-primary">Checks</h3>
        {version.checkSummary && <p className="mt-1 text-small text-text-secondary">{version.checkSummary}</p>}
        {version.checkFlags && version.checkFlags.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {version.checkFlags.map((f, i) => (
              <li key={i} className={`flex gap-1 text-small ${f.high ? 'text-warning' : 'text-text-secondary'}`}>
                <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0" />
                <span className="break-words">{f.high ? 'High: ' : ''}{f.message}{f.path ? ` (${f.path}${f.line ? `:${f.line}` : ''})` : ''}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-small text-text-muted">{version.checkFlags ? 'The plain checks raised nothing.' : 'The plain checks have not run yet.'}</p>}
      </section>

      <TabNav active={tab} onChange={setTab} tabs={[{ value: 'changes', label: 'Changes' }, { value: 'files', label: 'All files' }, { value: 'steps', label: 'Steps' }]} />
      {tab === 'changes' && (
        <div className="space-y-4">
          <p className="text-small text-text-secondary">{baseline ? `Compared with ${baseline}.` : 'Nothing is approved yet, so everything is new.'}</p>
          {diff.settings.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-border bg-card px-3 py-2 text-small" aria-label="Settings that changed" data-testid="diff-settings">
              {diff.settings.map((s) => (
                <li key={s.setting} className="break-words"><span className="font-medium text-text-primary">{s.setting}</span>: <span className="text-danger line-through">{s.before || 'none'}</span> → <span className="text-text-primary">{s.after || 'none'}</span></li>
              ))}
            </ul>
          )}
          {diff.files.filter((f) => f.change !== 'same').map((f) => <DiffFileView key={f.path} file={f} />)}
          {diff.files.every((f) => f.change === 'same') && diff.settings.length === 0 && <p className="text-small text-text-muted">Nothing differs.</p>}
        </div>
      )}
      {tab === 'files' && (
        <div className="space-y-4">
          {version.files.length === 0 && <p className="text-small text-text-muted">This version has no files besides its definition.</p>}
          {version.files.map((f) => (
            <section key={f.path} className="space-y-1">
              <h4 className="text-small font-medium text-text-primary">{f.path} <span className="font-normal text-text-muted">· {f.size} bytes{f.executable ? ', runs as a program' : ''}</span></h4>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surface-1 p-2 font-mono text-micro text-text-primary">{f.text ?? 'Not a text file.'}</pre>
            </section>
          ))}
        </div>
      )}
      {tab === 'steps' && <StepsTab workflowId={workflowId} number={number} definition={version.definition} />}
    </div>
  )
}
