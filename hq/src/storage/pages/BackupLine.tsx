import { useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { GitBranch } from 'lucide-react'
import { useQuery, getRepoState } from 'wasp/client/operations'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import { RepoPanel } from './RepoPanel'
import type { Owner } from './filesToolData'
import { ShowAttention } from '@agenthix/ui/attention'

/** "acme/docs" from a repository address. */
export function repoName(repoUrl: string): string {
  return repoUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
}

/**
 * The place's GitHub backup on one line at the top of Files (spec §3): where it is backed up to, or an offer to
 * back it up. Either opens the repository panel below the line: connecting, and disconnecting, are its flow.
 * While the state cannot be read, nothing is offered: a repository may already be attached.
 */
export function BackupLine({ owner }: { owner: Owner }) {
  const { data: state, error } = useQuery(getRepoState, { target: owner })
  const [open, setOpen] = useState(false)

  if (error) {
    return <ShowAttention kind="alert" title="The GitHub backup could not be read" text="The GitHub backup could not be read right now. Nothing was changed." />
  }
  if (!state) return null
  // Connecting and disconnecting are a project administrator's; an old answer without the flag leaves it to the server.
  const mayAdminister = state.mayAdminister !== false

  return (
    <div className="border-b border-border-subtle">
      <div className="flex items-center gap-2 px-4 py-2.5 text-small text-text-secondary">
        <GitBranch size={14} aria-hidden className="shrink-0 text-text-muted" />
        {state.repoUrl ? (
          <>
            <span className="min-w-0 flex-1 truncate">
              Backed up to{' '}
              <a href={state.repoUrl} target="_blank" rel="noopener noreferrer" className={`rounded font-medium text-text-primary hover:underline ${FOCUS_RING}`}>{repoName(state.repoUrl)}</a>
            </span>
            {mayAdminister && <button type="button" className={`rounded text-link hover:underline ${FOCUS_RING}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>Manage</button>}
          </>
        ) : (
          <>
            <span className="flex-1">Not backed up</span>
            {mayAdminister && <button type="button" className={FILES_BUTTON} aria-expanded={open} onClick={() => setOpen(o => !o)}>Back up to GitHub</button>}
          </>
        )}
      </div>
      {open && mayAdminister && <div className="px-4 pb-3"><RepoPanel target={owner} /></div>}
    </div>
  )
}
