/**
 * A project's boards as the mobile app's client protocol reads them (`getProjectBoards`): answered from boards as
 * saved views (boardReads.ts). Reading needs the project visible (adr-0102).
 */
import { HttpError } from 'wasp/server'
import type { BoardSummary, ProjectBoardsArgs } from '@agenthix/core'
import { requireProjectVisible } from './resourceEntitlement'
import { readProjectBoards } from './boardReads'

type Ctx = { user?: { id: string } | null }

function userOf(context: Ctx): { id: string } {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user
}

export const getProjectBoards = async ({ projectId }: ProjectBoardsArgs, context: Ctx): Promise<BoardSummary[]> => {
  const user = userOf(context)
  await requireProjectVisible(projectId, user.id)
  return readProjectBoards(projectId)
}
