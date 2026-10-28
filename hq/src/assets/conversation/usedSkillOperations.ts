/**
 * Opening a skill a conversation's work used, beside the thread (spec part 5 *Seeing it used*). The run is found from
 * hq's own record of the work in that conversation, never from the request; reading the conversation is checked
 * first, then the skill's own access (security review M6). Hosted in `assets.wasp.ts`.
 */
import { HttpError, prisma } from 'wasp/server'
import type { OperationResult } from '../../shared/conversations/protocol'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { isProjectMember } from '../../projects/membership'
import { requireConversationReader } from '../../conversations/readingRule'
import { openJson } from '../../conversations/sealing'
import { usedSkillsOf } from './usedSkillRecord'
import { usedSkillView } from './usedSkillView'
import { noteSkillUses } from './lastUsed'
import { USED_SKILL_NOT_FOUND, type GetUsedSkillArgs, type UsedSkillView } from './usedSkillTypes'

type Ctx = { user?: { id: string } | null }

const text = (v: unknown, max = 512): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

export const getUsedSkill = async (args: GetUsedSkillArgs, context: Ctx): Promise<UsedSkillView> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const ref = await requireConversationReader(args?.conversationId, userId)
  const operationId = text(args?.operationId)
  const name = text(args?.name, 64)
  const path = args?.path === undefined ? undefined : text(args.path)
  if (!operationId || !name || path === null) throw new HttpError(400, 'Say which skill to open.')
  const row = await prisma.operation.findFirst({ where: { id: operationId, conversationId: ref.id }, select: { siteId: true, runId: true, resultSummary: true, boundaryType: true, boundaryId: true } })
  const result = row?.resultSummary ? openJson<OperationResult>(row.resultSummary) : null
  const runId = result?.runId ?? row?.runId
  if (!row?.siteId || !runId) throw new HttpError(404, USED_SKILL_NOT_FOUND)
  let run
  try {
    run = await siteRuntimeStore.getRun(row.siteId, runId)
  } catch (err) {
    if (err instanceof SiteUnreachableError) throw new HttpError(503, "The place this ran is not reachable now, so the skill it used can't be found. Try again later.")
    throw err
  }
  if (run) await noteSkillUses(prisma, [run], row.boundaryType && row.boundaryId ? { placeType: row.boundaryType, placeId: row.boundaryId } : null)
  const use = usedSkillsOf(run?.skillsUsed).get(name)
  const view = use ? await usedSkillView({ db: prisma, sees: isProjectMember }, userId, use, path) : null
  if (!view) throw new HttpError(404, USED_SKILL_NOT_FOUND)
  return view
}
