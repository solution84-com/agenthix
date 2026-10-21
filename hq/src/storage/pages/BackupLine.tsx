import { useState } from 'react'
import { GitBranch } from 'lucide-react'
import { useQuery, getRepoState } from 'wasp/client/operations'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import { RepoPanel } from './RepoPanel'
import type { Owner } from './filesToolData'

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
    return <p role="status" className="px-4 py-2.5 text-small text-text-muted">The GitHub backup could not be read right now.</p>
  }
  if (!state) return null

  return (
    <div className="border-b border-border-subtle">
      <div className="flex items-center gap-2 px-4 py-2.5 text-small text-text-secondary">
        <GitBranch size={14} aria-hidden className="shrink-0 text-text-muted" />
        {state.repoUrl ? (
          <>
            <span className="min-w-0 flex-1 truncate">
              Backed up to{' '}
              <a href={state.repoUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-text-primary hover:underline">{repoName(state.repoUrl)}</a>
            </span>
            <button type="button" className="text-accent hover:underline" aria-expanded={open} onClick={() => setOpen(o => !o)}>Manage</button>
          </>
        ) : (
          <>
            <span className="flex-1">Not backed up</span>
            <button type="button" className={FILES_BUTTON} aria-expanded={open} onClick={() => setOpen(o => !o)}>Back up to GitHub</button>
          </>
        )}
      </div>
      {open && <div className="px-4 pb-3"><RepoPanel target={owner} /></div>}
    </div>
  )
}
