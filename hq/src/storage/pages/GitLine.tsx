import { useQuery, getGitStatus } from 'wasp/client/operations'
import type { GitStatusResult } from '@agenthix/core'
import type { Target } from './filesToolData'

type Repository = Extract<GitStatusResult, { repository: true }>

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function commitAge(at: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(at).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The middle of the line: what an agent left stopped, or the changed count, or clean. */
function changeState(s: Repository): { text: string; tone: string; mark: string } {
  if (s.inProgress) return { mark: '⚠', tone: 'text-warning', text: s.inProgress === 'merge' ? 'Merge in progress' : 'Rebase in progress' }
  const count = `${s.changed.toLocaleString('en-GB')}${s.changedOverflow ? '+' : ''}`
  if (!s.lastCommit) return { mark: '●', tone: 'text-warning', text: `${count} new ${s.changed === 1 && !s.changedOverflow ? 'file' : 'files'}` }
  if (s.changed === 0) return { mark: '✓', tone: 'text-success', text: 'No changes' }
  return { mark: '●', tone: 'text-warning', text: `${count} changed` }
}

/**
 * The folder's git status on one line (spec part 4, G1), read when the folder opens and again on focus: the branch,
 * clean or what changed, and the last commit. Nothing while it is read; no line for a folder that is not a
 * repository, or when the site does not answer, where the folder says so itself. Read only: it offers nothing to do.
 */
export function GitLine({ target, className = 'border-b border-border-subtle' }: { target: Target; className?: string }) {
  const loc = { ownerType: target.ownerType, ownerId: target.ownerId, workspaceId: target.workspaceId ?? null, taskId: null }
  const { data, error } = useQuery(getGitStatus, { target: loc }, { refetchOnWindowFocus: true, retry: false })
  if (error || !data?.repository) return null

  const state = changeState(data)
  const commit = data.lastCommit
  return (
    <div role="status" aria-label="Git status" className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2 text-small text-text-secondary ${className}`}>
      <span className="whitespace-nowrap">
        <span aria-hidden>⎇ </span>
        {data.head.kind === 'branch'
          ? <b className="font-medium text-text-primary">{data.head.name}</b>
          : <>detached at <code className="font-mono">{data.head.commit}</code></>}
      </span>
      <span aria-hidden>·</span>
      <span className={`whitespace-nowrap ${state.tone}`}><span aria-hidden>{state.mark} </span>{state.text}</span>
      <span aria-hidden>·</span>
      {commit ? (
        <span className="min-w-0 truncate">
          Last commit <code className="font-mono">{commit.id}</code> “{commit.subject}” by {commit.author}, {commitAge(commit.at)}
        </span>
      ) : (
        <span>No commits yet</span>
      )}
    </div>
  )
}
