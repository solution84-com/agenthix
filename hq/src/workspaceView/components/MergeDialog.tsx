import { useState } from 'react'
import { AlertTriangle, GitMerge, Info } from 'lucide-react'
import { useAction, mergeBranch } from 'wasp/client/operations'
import { isCommitMessage, type BranchFileChange, type MergeClash } from '@agenthix/core'
import { ChangeMarker } from '@agenthix/ui/files'
import { Modal } from '@agenthix/ui/primitives'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import type { BranchLineView, MergeBranchResult } from '../../branches/views'
import { agentOf, clashesByVersion, mergeRefusal, plural } from '../words'
import { markerStatus } from './changeMarks'

type Merged = Extract<MergeBranchResult, { outcome: 'merged' }>

/**
 * *Merge into main* (spec part 3; board `merge-into-main`): the changed files, a summary written from the work, and
 * the version it goes in as. While an agent works on the branch it says what a merge then takes. A clash merges
 * nothing: the dialog names the files and the version of `main` that changed them, and that the agent was asked to
 * bring the branch up to date. The summary is kept for next time.
 */
export function MergeDialog({ line, mainHead, mainVersion, changes, summary, onSummary, onClose, onMerged }: {
  line: BranchLineView
  mainHead: string
  mainVersion: number
  changes: readonly BranchFileChange[]
  summary: string
  onSummary: (summary: string) => void
  onClose: () => void
  onMerged: (result: Merged) => void
}) {
  const merge = useAction(mergeBranch)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [clash, setClash] = useState<{ clashes: MergeClash[]; agentAsked: boolean } | null>(null)
  const valid = isCommitMessage(summary)

  const go = async () => {
    setBusy(true)
    setRefusal(null)
    try {
      const result = await merge({ branchId: line.id, message: summary.trim(), expectedMain: mainHead })
      if (result.outcome === 'merged') onMerged(result)
      else if (result.outcome === 'clash') setClash({ clashes: result.clashes, agentAsked: result.agentAsked })
      else setRefusal(mergeRefusal(result))
    } catch (e) {
      setRefusal(e instanceof Error ? `${e.message} Nothing was merged.` : 'The merge did not go through. Nothing was merged.')
    } finally {
      setBusy(false)
    }
  }

  const agent = agentOf(line)
  return (
    <Modal open onClose={onClose} title={`Merge ${line.name} into main`} maxWidth="max-w-xl">
      <div className="space-y-4 text-small" data-testid="merge-dialog">
        {clash ? <ClashBody clash={clash} agent={agent} /> : (
          <>
            {line.working && (
              <div role="status" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-text-primary">
                <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                <p>{line.working.agentName} is still working on this branch. This merges what it has committed so far; it keeps working.</p>
              </div>
            )}
            <label className="block">
              <span className="mb-1 block font-semibold text-text-primary">Summary</span>
              <input value={summary} onChange={e => onSummary(e.target.value)} maxLength={2000}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-body text-text-primary focus:border-accent focus:outline-none" />
              <span className="mt-1 block text-micro text-text-muted">What main’s history will say. Written from the work; change it if you like.</span>
            </label>
            <div>
              <p className="mb-1 font-semibold text-text-primary">Goes in</p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {changes.map(f => (
                  <li key={f.path} className="flex items-center gap-2">
                    <ChangeMarker status={markerStatus(f.status)} added={f.additions ?? 0} removed={f.deletions ?? 0} />
                    <span className={`min-w-0 flex-1 truncate font-mono ${f.status === 'deleted' ? 'text-text-muted' : 'text-text-primary'}`}>{f.path}</span>
                    {f.additions !== null && (
                      <span className="font-mono text-micro">
                        {f.additions > 0 && <span className="text-success">+{f.additions}</span>} {(f.deletions ?? 0) > 0 && <span className="text-danger">−{f.deletions}</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 rounded-lg border border-border-subtle bg-surface-2 p-3 text-text-secondary">
              <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" />
              <p>
                Goes into main as <b className="text-text-primary">one version — version {mainVersion + 1}</b>. The branch’s{' '}
                {plural(line.ahead, 'commit')} {line.ahead === 1 ? 'becomes' : 'become'} that one version. Any version can be restored later.
              </p>
            </div>
            {refusal && <p role="alert" className="text-danger">{refusal}</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          {clash ? (
            <button type="button" className={FILES_BUTTON_PRIMARY} onClick={onClose}>Close</button>
          ) : (
            <>
              <button type="button" className={FILES_BUTTON} onClick={onClose}>Cancel</button>
              <button type="button" className={FILES_BUTTON_PRIMARY} disabled={busy || !valid} onClick={() => void go()}>
                <GitMerge size={14} aria-hidden /> {busy ? 'Merging…' : 'Merge into main'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function ClashBody({ clash, agent }: { clash: { clashes: MergeClash[]; agentAsked: boolean }; agent: string | null }) {
  const who = agent ?? 'The branch’s agent'
  return (
    <>
      <div role="alert" className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-text-primary">
        <p className="flex gap-2"><AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-danger" /><b>Nothing was merged.</b></p>
        {clashesByVersion(clash.clashes).map(g => (
          <div key={g.version?.commit ?? 'unknown'}>
            <p>
              These files clash with main — main changed them too
              {g.version ? <>, in version {g.version.number} <i>“{g.version.subject}”</i>:</> : ':'}
            </p>
            <ul className="mt-1">
              {g.paths.map(p => <li key={p} className="flex items-center gap-2"><ChangeMarker status="modified" /><span className="font-mono">{p}</span></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex gap-2 rounded-lg border border-border-subtle bg-surface-2 p-3 text-text-secondary">
        <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <p>
          {clash.agentAsked
            ? <><b className="text-text-primary">{who} will bring the branch up to date</b> with main, then tells you in the conversation when it is ready to merge.</>
            : <>Ask the branch’s agent in the conversation to bring it up to date with main, then merge again.</>}
        </p>
      </div>
      <p className="text-micro text-text-muted">The summary is kept for next time.</p>
    </>
  )
}
