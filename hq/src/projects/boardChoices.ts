/**
 * What a board's Columns menu and filters choose from (spec D3, B5, the board design's Columns menu and filters): the
 * project's types with their columns (and each state's default column, where a drop on a state lands), its custom
 * fields with their options, its epics, the agents on it, and its sprints (the current one, the next ones, the past).
 * Archived types and fields are left out: a board is not made of them. Access is the caller's to check; this only reads.
 */
import { prisma } from 'wasp/server'
import type { CustomFieldView, TaskTypeView } from '@agenthix/core'
import { listCustomFields } from './fieldService'
import { listTaskTypes } from './taskTypeService'
import { seriesOf } from './projectSprintService'
import { seriesParts, sprintTitle } from './sprintSeries'

export type BoardChoice = { id: string; name: string }

export type BoardChoices = {
  types: TaskTypeView[]
  fields: CustomFieldView[]
  /** The project's epics, by key: "WEB-20 · Launch pages". */
  epics: Array<BoardChoice & { key: string }>
  agents: BoardChoice[]
  sprints: { current: BoardChoice | null; upcoming: BoardChoice[]; past: BoardChoice[] }
}

const choice = (s: { id: string; number: number; name: string | null }): BoardChoice => ({ id: s.id, name: sprintTitle(s) })

export async function readBoardChoices(projectId: string): Promise<BoardChoices> {
  const [types, fields, project, agents, series] = await Promise.all([
    listTaskTypes(projectId),
    listCustomFields(projectId),
    prisma.project.findUnique({ where: { id: projectId }, select: { key: true } }),
    prisma.projectAgent.findMany({
      where: { projectId },
      select: { agent: { select: { id: true, name: true } } },
      orderBy: { agent: { name: 'asc' } },
    }),
    seriesOf(prisma, projectId),
  ])
  const epics = await prisma.task.findMany({
    where: { projectId, archived: false, type: { kind: 'EPIC' } },
    select: { id: true, number: true, title: true },
    orderBy: { number: 'asc' },
  })
  const parts = seriesParts(series)
  return {
    types: types.filter(t => !t.archivedAt),
    fields: fields.filter(f => !f.archivedAt),
    epics: epics.map(e => ({ id: e.id, key: `${project?.key ?? ''}-${e.number}`, name: e.title })),
    agents: agents.map(a => a.agent),
    sprints: {
      current: parts.current ? choice(parts.current) : null,
      upcoming: parts.upcoming.map(choice),
      past: parts.past.map(choice),
    },
  }
}
