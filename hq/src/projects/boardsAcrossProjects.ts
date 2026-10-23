/**
 * The boards of every project a person is a member of, for the Projects screen's Boards view (every screen reviewed
 * spec §3). Membership is the gate and nothing else: an organisation admin sees the same boards, not every
 * project's. Archived boards are included, for the screen to hide behind Archived.
 */
import { prisma } from 'wasp/server'
import { entitledProjectsFilter } from './membership'
import { isYourSpace } from './personalProject'
import type { BoardAcrossProjects } from '@agenthix/core'
import { readProjectBoards } from './boardView'

/** Declared in core's client protocol, since the mobile app reads it too. */
export type { BoardAcrossProjects } from '@agenthix/core'

export async function readBoardsAcrossProjects(userId: string): Promise<BoardAcrossProjects[]> {
  const projects = await prisma.project.findMany({
    where: entitledProjectsFilter(userId),
    select: { id: true, name: true, key: true, personalOwnerId: true, personalSpace: true },
    orderBy: { name: 'asc' },
  })
  const perProject = await Promise.all(projects.map(async p => {
    const project = { id: p.id, name: p.name, key: p.key, isPersonal: isYourSpace(p) }
    return (await readProjectBoards(p.id, true)).map(b => ({ ...b, project }))
  }))
  return perProject.flat()
}
