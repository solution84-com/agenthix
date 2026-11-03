import { useState } from 'react'
import { ChevronDown, ChevronRight, GitBranch, GitMerge } from 'lucide-react'
import { useQuery, getBranchCommits } from 'wasp/client/operations'
import type { BranchFileChange } from '@agenthix/core'
import { ChangeMarker } from '@agenthix/ui/files'
import { FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import type { BranchCommitsView, BranchLineView } from '../../branches/views'
import { useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { VIEWER_REASON, agentOf, plural, whenText, whoseLabel, workingText } from '../words'
import { baseName, markerStatus, parentOf, totals } from './changeMarks'

/**
 * Git for a branch (spec part 1, *Git*): whose it is and what is working on it, how far ahead of `main`, its
 * changes (choosing one shows it in the middle), *Merge into main…*, and its commits, folded.
 */
export function BranchGitPanel({ workspaceId, me, line, mainVersion, changes, changesError, overflow, selected, canAct, onOpenChange, onMerge }: {
  workspaceId: string
  /** The signed-in person's id, to say *You*. */
  me: string | null
  line: BranchLineView
  mainVersion: number
  changes: readonly BranchFileChange[] | undefined
  changesError: Error | null
  overflow: boolean
  selected: string | null
  canAct: boolean
  onOpenChange: (path: string) => void
  onMerge: () => void
}) {
  const sum = totals(changes ?? [])
  const nothing = line.ahead === 0
  return (
    <div className="space-y-3 px-3 py-2 text-small" data-testid="branch-git">
      <div className="space-y-1 text-text-secondary">
        <p>{whoseLabel(line.whose, agentOf(line), me)} · <span className="text-text-primary">{line.whose.title}</span></p>
        <p className="flex items-center gap-1.5">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${line.working ? 'bg-success' : 'bg-text-muted'}`} />
          {workingText(line)}
        </p>
        <p className="flex items-center gap-1.5">
          <GitBranch size={13} aria-hidden />
          {line.ahead} ahead of main{line.behind > 0 && `, ${line.behind} behind`}
          <span className="text-text-muted">· main is at v{mainVersion}</span>
        </p>
      </div>
      <div>
        <button type="button" className={FILES_BUTTON_PRIMARY} disabled={!canAct || nothing} onClick={onMerge}
          title={!canAct ? VIEWER_REASON : nothing ? 'Nothing to merge yet' : undefined}>
          <GitMerge size={14} aria-hidden /> Merge into main…
        </button>
        {!canAct && <p className="mt-1 text-micro text-text-muted">{VIEWER_REASON}</p>}
      </div>

      <section aria-label="Changes">
        <h3 className="flex items-center gap-2 font-semibold text-text-primary">
          Changes <span className="rounded-full bg-surface-2 px-1.5 text-micro">{changes?.length ?? '…'}</span>
          {changes && changes.length > 0 && (
            <span className="ml-auto font-mono text-micro"><span className="text-success">+{sum.added}</span> <span className="text-danger">−{sum.removed}</span></span>
          )}
        </h3>
        {changesError && <p role="status" className="mt-1 text-text-muted">{changesError.message}</p>}
        {changes?.length === 0 && <p className="mt-1 text-text-muted">No changes against main yet.</p>}
        <ul className="mt-1">
          {(changes ?? []).map(f => {
            const dir = parentOf(f.path)
            return (
              <li key={f.path}>
                <button type="button" onClick={() => onOpenChange(f.path)} aria-current={selected === f.path ? 'true' : undefined}
                  className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-surface-hover ${selected === f.path ? 'bg-surface-2' : ''}`}>
                  <ChangeMarker status={markerStatus(f.status)} added={f.additions ?? 0} removed={f.deletions ?? 0} />
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {dir && <span className="text-text-muted">{dir}/</span>}{baseName(f.path)}
                  </span>
                  {f.additions !== null && (
                    <span className="shrink-0 font-mono text-micro">
                      {f.additions > 0 && <span className="text-success">+{f.additions}</span>} {(f.deletions ?? 0) > 0 && <span className="text-danger">−{f.deletions}</span>}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {overflow && <p className="mt-1 text-micro text-text-muted">Only the first changed files are listed.</p>}
      </section>

      <Commits workspaceId={workspaceId} branchId={line.id} count={line.ahead} />
    </div>
  )
}

function Commits({ workspaceId, branchId, count }: { workspaceId: string; branchId: string; count: number }) {
  const [open, setOpen] = useState(false)
  const { data, error, refetch } = useQuery(getBranchCommits, { workspaceId, branchId }, { enabled: open })
  useOnWorkspaceChange(refetch)
  const view = data as BranchCommitsView | undefined
  return (
    <section aria-label="Commits">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="flex items-center gap-1 font-semibold text-text-primary">
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />} {plural(count, 'commit')}
      </button>
      {open && (
        <ul className="mt-1 space-y-1.5">
          {error && <li role="status" className="text-text-muted">{error.message}</li>}
          {!view && !error && <li className="text-text-muted">Loading…</li>}
          {view?.commits.map(c => (
            <li key={c.id}>
              <p className="text-text-primary">{c.subject}</p>
              <p className="text-micro text-text-muted">
                {c.author.name}{c.onBehalfOf ? ` for ${c.onBehalfOf.name}` : ''} · <span className="font-mono">{c.id.slice(0, 7)}</span> · {whenText(c.at)}
              </p>
            </li>
          ))}
          {view?.overflow && <li className="text-micro text-text-muted">Older commits are not listed.</li>}
        </ul>
      )}
    </section>
  )
}
