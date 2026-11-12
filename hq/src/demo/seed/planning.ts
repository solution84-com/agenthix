import { createHash, randomBytes } from 'node:crypto'
import { idFor, type SeedOrganisation } from '@agenthix/core'
import { spanFrom } from '../../projects/sprintSeries'
import type { SeedContext } from './types'

/** Each project's current sprint with the tasks planned into it, and the invitations still waiting. */
export async function seedPlanning(c: SeedContext, o: SeedOrganisation): Promise<void> {
  const { db, ids } = c
  for (const s of o.sprints) {
    await db.sprint.create({
      data: {
        id: s.id, projectId: idFor(ids.projects, s.project, 'project'), number: s.number, name: s.name, goal: s.goal,
        ...spanFrom(c.at(s.start), s.days), createdAt: c.at(s.start),
      },
    })
    await db.task.updateMany({ where: { id: { in: s.tasks.map(t => idFor(ids.tasks, t, 'task')) } }, data: { sprintId: s.id } })
  }
  for (const i of o.invitations) {
    // Its link is made and dropped here: only the hash is kept, so nobody can accept it. It only shows on People.
    const token = randomBytes(32).toString('base64url')
    await db.invite.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'), role: i.role, note: i.note,
        projectIds: i.projects.map(p => idFor(ids.projects, p, 'project')), createdBy: idFor(ids.people, i.createdBy, 'person'),
        createdAt: c.at(i.at), expiresAt: c.at(i.expiresAt),
      },
    })
  }
}
