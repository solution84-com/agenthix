/**
 * "Used the skill <name>" on the work lines built from a session's transcript (spec part 5 *Seeing it used*): task
 * sessions, the run page and the conversation panel draw a run's steps in the browser, so hq gives them, for each of
 * the session's recent runs, the person-facing line of every skill the run used that the viewer may see. The session
 * is checked first, as reading its transcript is; then each skill through `usedSkillOrigin`, now (security review
 * M6). A skill the viewer may not see is left out, and its step keeps the staged name. Hosted in `assets.wasp.ts`.
 */
import { HttpError, prisma } from 'wasp/server'
import type { RunSkillUse } from '@agenthix/core'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'
import * as dispatchService from '../../agents/dispatchService'
import { requireTaskVisible } from '../../projects/resourceEntitlement'
import { canReachSessionContent } from '../../sessions/sessionEntitlement'
import { rethrowSiteUnreachableAsHttp } from '../../storage/httpErrors'
import { isProjectMember } from '../../projects/membership'
import { usedSkillOrigin, usedSkillLabel, type UsedSkillDeps, type UsedSkillOrigin } from './usedSkillOrigin'
import { usedSkillsOf } from './usedSkillRecord'

/** The session's newest runs whose skills are named; older ones keep their staged names. */
export const SESSION_SKILL_RUNS = 50

export type GetSessionSkillStepsArgs = { sessionId: string }
export type SessionSkillSteps = {
  /** Per run listed, the line of each skill it used that the viewer may see, by the name it was staged under. */
  runs: Record<string, Record<string, string>>
  /** The newest run, for a work line drawn while its run has no id yet. */
  latestRunId: string | null
}

type Ctx = { user?: { id: string } | null }

/** Labels for each run's used skills; one access check per distinct entry. */
export async function skillStepsOf(deps: UsedSkillDeps, viewerId: string, runs: { id: string; skillsUsed?: unknown }[]): Promise<SessionSkillSteps['runs']> {
  const origins = new Map<string, Promise<UsedSkillOrigin | null>>()
  const keyOf = (u: RunSkillUse) => JSON.stringify([u.name, u.source, u.fingerprint, u.identity ?? null, u.version ?? null, u.placeId ?? null, u.path ?? null, u.personId ?? null])
  const out: SessionSkillSteps['runs'] = {}
  for (const run of runs) {
    const labels: Record<string, string> = {}
    for (const [name, use] of usedSkillsOf(run.skillsUsed)) {
      const key = keyOf(use)
      if (!origins.has(key)) origins.set(key, usedSkillOrigin(deps, viewerId, use))
      const origin = await origins.get(key)!
      if (origin) labels[name] = usedSkillLabel(origin)
    }
    out[run.id] = labels
  }
  return out
}

export const getSessionSkillSteps = async (args: GetSessionSkillStepsArgs, context: Ctx): Promise<SessionSkillSteps> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const sessionId = args?.sessionId
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 100) throw new HttpError(400, 'Say which session.')
  const session = await prisma.agentSession.findUnique({ where: { id: sessionId } })
  if (!session) throw new HttpError(404, 'Session not found')
  // As the session's transcript is read: a task's session by whoever sees the task, any other by its own person.
  if (session.taskId) await requireTaskVisible(session.taskId, userId, 'Session not found')
  else if (!(await canReachSessionContent(session, userId))) throw new HttpError(404, 'Session not found')

  let runs
  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    runs = await siteRuntimeStore.listRuns(siteId, { sessionId: session.id, limit: SESSION_SKILL_RUNS })
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  return { runs: await skillStepsOf({ db: prisma, sees: isProjectMember }, userId, runs), latestRunId: runs[0]?.id ?? null }
}
