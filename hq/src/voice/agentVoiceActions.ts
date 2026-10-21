import { HttpError } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'

type UpdateAgentVoiceArgs = {
  agentId: string
  voiceEnabled: boolean
  voiceId?: string | null
  voiceTtsModel?: string | null
}

export const updateAgentVoice = async (args: UpdateAgentVoiceArgs, context: any) => {
  await requireRole(context, 'ADMIN', "Changing an agent's voice")

  const agent = await context.entities.Agent.findUnique({ where: { id: args.agentId } })
  if (!agent) throw new HttpError(404, 'Agent not found')

  return context.entities.Agent.update({
    where: { id: args.agentId },
    data: {
      voiceEnabled: args.voiceEnabled,
      ...(args.voiceId !== undefined && { voiceId: args.voiceId }),
      ...(args.voiceTtsModel !== undefined && { voiceTtsModel: args.voiceTtsModel }),
    },
  })
}
