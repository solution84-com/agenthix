import { Link } from 'react-router'
import { useQuery, getSkillProposalQueues } from 'wasp/client/operations'
import type { QueueLevel } from './queues'

const LIBRARY_PROPOSALS_PATH = '/library/proposals'

function useWaiting(only?: (l: QueueLevel) => boolean): number {
  const { data } = useQuery(getSkillProposalQueues, undefined, { retry: false })
  return ((data ?? []) as QueueLevel[]).filter(l => !only || only(l)).reduce((n, l) => n + l.open.length, 0)
}

const words = (n: number) => `${n} ${n === 1 ? 'proposal' : 'proposals'} waiting`

/** A project's Skills page: the proposals aimed at the project, when the person reviews them (skills spec part 5). */
export function ProjectProposalsWaiting({ projectId }: { projectId: string }) {
  const n = useWaiting(l => l.level === 'project' && l.projectId === projectId)
  if (n === 0) return null
  return (
    <p className="mt-3 text-small text-text-secondary" data-testid="place-skills-proposals">
      {words(n)} · <Link to={LIBRARY_PROPOSALS_PATH} className="font-medium text-accent hover:text-accent-hover">Review</Link>
    </p>
  )
}

/** The Library's header: the way to the review queue, when anything waits for the person. */
export function LibraryReviewLink({ className }: { className: string }) {
  const n = useWaiting()
  if (n === 0) return null
  return <Link to={LIBRARY_PROPOSALS_PATH} className={className}>Review ({n})</Link>
}
