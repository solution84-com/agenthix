/**
 * Editing an agent's definition in place (ADR-0072; spec §6.3: an org act).
 * Instructions are its package content; its settings are its
 * record's own columns. Either way, the next run uses what is saved here, and a
 * run already started keeps what it started with — there is nothing to publish.
 */
import type { UpdateAgentFile, UpdateAgentSettings } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { packageWriteOrHttp } from '../packages/writeErrors'
import {
  changeAgentContent, updateAgentSettings as updateSettings, INSTRUCTIONS_FILE,
  type AgentSettingsChange,
} from '../packages/agentPackageService'

type ChangeView = { digest: string; changed: boolean }

type UpdateAgentFileArgs = { agentId: string; filename: 'instructions.md'; content: string }

export const updateAgentFile: UpdateAgentFile<UpdateAgentFileArgs, ChangeView> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Changing an agent's instructions")
  if (args.filename !== INSTRUCTIONS_FILE) {
    throw new HttpError(400, `'${String(args.filename)}' is not part of an agent's content`)
  }
  if (typeof args.content !== 'string') throw new HttpError(400, 'content must be text')
  const { ref, changed } = await packageWriteOrHttp(() => changeAgentContent(
    args.agentId,
    content => ({ ...content, instructions: args.content }),
    context.user!.id,
  ))
  return { digest: ref.digest, changed }
}

type UpdateAgentSettingsArgs = { agentId: string } & AgentSettingsChange

export const updateAgentSettings: UpdateAgentSettings<UpdateAgentSettingsArgs, { ok: true }> = async (args, context) => {
  await requireRole(context, 'ADMIN', "Changing an agent's settings")
  const { agentId, ...change } = args
  if (!(await context.entities.Agent.findUnique({ where: { id: agentId }, select: { id: true } }))) throw new HttpError(404, 'Agent not found')
  await packageWriteOrHttp(() => updateSettings(agentId, change))
  return { ok: true }
}
