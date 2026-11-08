/**
 * Boards, the rail's place (spec D20, the rail design's Boards): every board of every project the person is in,
 * grouped by project in name order, each project's two built-in boards first, then its saved ones, as the project's
 * own Boards list reads them. Membership is the gate and nothing else: an organisation admin sees the same boards,
 * not every project's.
 */
import { prisma } from 'wasp/server'
import { entitledProjectsFilter } from './membership'
import { isYourSpace } from './personalProject'
import { listBoards, type BoardListEntry } from './boardListService'

export type ProjectBoards = {
  project: { id: string; name: string; key: string; isPersonal: boolean }
  boards: BoardListEntry[]
}

export async function readBoardViewsAcrossProjects(userId: string): Promise<ProjectBoards[]> {
  const projects = await prisma.project.findMany({
    where: entitledProjectsFilter(userId),
    select: { id: true, name: true, key: true, personalOwnerId: true, personalSpace: true },
    orderBy: { name: 'asc' },
  })
  return Promise.all(projects.map(async p => ({
    project: { id: p.id, name: p.name, key: p.key, isPersonal: isYourSpace(p) },
    boards: await listBoards(p.id),
  })))
}
