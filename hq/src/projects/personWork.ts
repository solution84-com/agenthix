/**
 * What waits on each person in a project, and what they are doing there
 * (every screen reviewed spec §3, People), from hq's own task state — the
 * Agents tool's rule (`agents/agentNow.ts`) applied per person instead of per
 * agent. A task waits on the person its run is for: who started the run when
 * someone did, else the person the task is done on behalf of (adr-0095).
 * Their tasks here are the ones done on their behalf.
 *
 * When they were last here is what hq can know without asking a site: their
 * latest conversation in the project, or comment on one of its tasks.
 */
import { prisma } from 'wasp/server'
import { withDisplayReasons } from './taskReasonDisplay'
import { workOfPerson, type PersonTask, type PersonWork } from './personNow'

export type { PersonWork, PersonNow } from './personNow'

export async function readPeopleWork(projectId: string, userIds: string[]): Promise<Map<string, PersonWork>> {
  if (userIds.length === 0) return new Map()
  const [rows, done, sessions, comments] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId, archived: false,
        OR: [{ state: { not: 'DONE' } }, { runState: 'RUN_BLOCKED' }],
        AND: [{ OR: [{ onBehalfOfUserId: { in: userIds } }, { runOnBehalfOfUserId: { in: userIds } }] }],
      },
      select: {
        id: true, number: true, title: true, projectId: true, state: true, runState: true, runStateReason: true,
        assignedAgentId: true, scheduleNextDueAt: true, lastWorkedAt: true, updatedAt: true,
        onBehalfOfUserId: true, runOnBehalfOfUserId: true,
        project: { select: { key: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.task.groupBy({
      by: ['onBehalfOfUserId'],
      where: { projectId, archived: false, state: 'DONE', runState: { not: 'RUN_BLOCKED' }, onBehalfOfUserId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.agentSession.groupBy({
      by: ['userId'],
      where: { sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: projectId, userId: { in: userIds } },
      _max: { updatedAt: true },
    }),
    prisma.taskComment.groupBy({
      by: ['userId'],
      where: { authorType: 'USER', userId: { in: userIds }, task: { projectId } },
      _max: { createdAt: true },
    }),
  ])
  const open = (await withDisplayReasons(rows)).map(({ project, ...t }): PersonTask => ({ ...t, projectKey: project.key, projectName: project.name }))
  const doneByPerson = new Map(done.map(g => [g.onBehalfOfUserId, g._count._all]))
  const latest = new Map<string, Date>()
  const note = (userId: string | null, at: Date | null) => {
    if (!userId || !at) return
    const seen = latest.get(userId)
    if (!seen || at > seen) latest.set(userId, at)
  }
  for (const s of sessions) note(s.userId, s._max.updatedAt)
  for (const c of comments) note(c.userId, c._max.createdAt)
  return new Map(userIds.map(id => [id, { ...workOfPerson(id, open, doneByPerson), lastActiveAt: latest.get(id) ?? null }]))
}
