/** The agent's Skills section as a Wasp operation, hosted in `assets.wasp.ts`. Adding and removing use the lifecycle's own. */
import { HttpError, prisma } from 'wasp/server'
import { agentSkillsView } from './agentSkills'
import type { AgentSkillsView } from './types'

type Ctx = { user?: { id: string } | null }

export const getAgentSkillSet = async (args: unknown, context: Ctx): Promise<AgentSkillsView> => {
  if (!context.user) throw new HttpError(401)
  const a = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  return agentSkillsView(prisma, context.user.id, a.agentId)
}
