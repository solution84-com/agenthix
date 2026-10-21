/**
 * The read that belongs to no single Execution Site: the dashboard's activity
 * strip.
 *
 * Every other session read in `queries.ts` has an owner — a session, a task, an
 * agent — and routes to the site that owns it. This one has none, so it asks
 * every site and merges the answers (`mergedRunFeed.ts`). Split out of
 * `queries.ts` on the repository's file-size rule, along the seam that was
 * already there; re-exported from it so main.wasp.ts's import paths are unchanged.
 *
 * It returns `unanswered` beside its rows, naming the sites whose runs are
 * missing from the page, so "no runs" and "could not ask" stay apart. And
 * **it can return fewer rows than it asked for** — see `getRecentActivity`.
 */
import { type GetRecentActivity } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { readMergedRunFeed } from './mergedRunFeed'
import { runVisibilityFilter } from './runReadHelpers'

/** The activity strip's page size. */
const RECENT_ACTIVITY_PAGE_SIZE = 10

/**
 * The dashboard's activity strip — a merged, paged feed of the
 * runs that have ended. The narrowing runs before the page is sliced: what a
 * viewer may not see must cost them a filtered feed, never a shorter one.
 *
 * **A short page does not mean the end of the feed.** This read used to fetch
 * a hundred rows from one site and slice ten off the top; with a cursor, the
 * page size IS the read size, and rows dropped by either narrowing leave room
 * they do not fill. `nextCursor` is the only thing that says whether more
 * exist — a consumer that stops paging on a short page stops early.
 */
export const getRecentActivity: GetRecentActivity<{ cursor?: string } | undefined, any> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, 'Not authenticated')
  }

  const { visible, sessionById } = runVisibilityFilter(context.user.id)
  const feed = await readMergedRunFeed({
    limit: RECENT_ACTIVITY_PAGE_SIZE,
    cursor: args?.cursor,
    visible: async (runs) => {
      const terminal = runs.filter((r) => r.status === 'COMPLETED' || r.status === 'FAILED')
      return visible(terminal)
    },
  })

  // One query for the agents these runs name, not one per run.
  const agentIds = [...new Set(feed.runs.map((r) => r.agentId))]
  const agents = await context.entities.Agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, handle: true, avatarUrl: true },
  })
  const agentById = new Map(agents.map((a: { id: string }) => [a.id, a]))

  return {
    runs: feed.runs.map((r) => {
      const s = sessionById.get(r.sessionId)
      return {
        ...r,
        session: s ? { id: s.id, title: s.title } : null,
        agent: agentById.get(r.agentId) ?? null,
      }
    }),
    nextCursor: feed.nextCursor,
    unanswered: feed.unanswered,
  }
}
