/**
 * The browser's operations for an agent's line (spec D17, RU4): what Start and Start all agents would run, starting
 * them, and an agent's Stop. Starting and stopping are for anyone who may work in the project (Member or Admin), as a
 * single task's Run and Stop are; reading the plan, for anyone who can see it. Stop every run is `stopPlaceRuns`.
 */
import { HttpError } from 'wasp/server'
import type { GetAgentStartPlan, StartAgentInProject, StartAllAgents, StopAgentInProject } from 'wasp/server/operations'
import { requireMayWorkInProject } from './membership'
import { requireProjectVisible } from './resourceEntitlement'
import { personName } from '../sessions/transcriptAuthors'
import { startPlan, type StartPlan } from './agentStartPlan'
import { checkedTaskIds, startAgent as startAgentLine, startAllAgents as startEveryAgent, type StartResult } from './agentStart'
import { stopAgent as stopAgentLine, type StopAgentResult } from './agentStop'

function requireId(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) throw new HttpError(400, `${what} is needed. Nothing was changed.`)
  return value
}

export const getAgentStartPlan: GetAgentStartPlan<{ projectId: string; agentId?: string | null }, StartPlan> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const projectId = requireId(args?.projectId, 'A project')
  await requireProjectVisible(projectId, context.user.id)
  const agentId = args.agentId == null ? null : requireId(args.agentId, 'An agent')
  return startPlan(projectId, agentId)
}

export const startAgentInProject: StartAgentInProject<{ projectId: string; agentId: string; taskIds: string[] }, StartResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const projectId = requireId(args?.projectId, 'A project')
  const agentId = requireId(args.agentId, 'An agent')
  await requireMayWorkInProject(projectId, context.user.id, 'Starting an agent in this project')
  return startAgentLine(projectId, agentId, checkedTaskIds(args.taskIds), context.user.id)
}

export const startAllAgents: StartAllAgents<{ projectId: string; taskIds: string[] }, StartResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const projectId = requireId(args?.projectId, 'A project')
  await requireMayWorkInProject(projectId, context.user.id, 'Starting the agents in this project')
  return startEveryAgent(projectId, checkedTaskIds(args.taskIds), context.user.id)
}

export const stopAgentInProject: StopAgentInProject<{ projectId: string; agentId: string }, StopAgentResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const projectId = requireId(args?.projectId, 'A project')
  const agentId = requireId(args.agentId, 'An agent')
  await requireMayWorkInProject(projectId, context.user.id, 'Stopping an agent in this project')
  return stopAgentLine(projectId, agentId, context.user.id, await personName(context.user.id))
}
