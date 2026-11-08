/**
 * The models `start_work` offers the agent to name (models from one place, part 4): when the person's instruction names
 * a model, the agent passes its value, taken from this list. What is listed is what may run for the person and this
 * agent; the pick is checked again against the place the work starts in, and a model the place rules out is refused.
 */
import { prisma } from 'wasp/server'
import { offeredFor } from './offered'

const SHOWN = 40

/** The tool description's lines for the models a worker may be told to use, or none when no provider reaches one. */
export async function describeWorkerModels(agentId: string, personId: string): Promise<string[]> {
  const { models } = await offeredFor({ purpose: 'worker', place: { kind: 'organisation' }, agentId, userId: personId })
  const usable = models.filter(m => !m.notWorking)
  if (usable.length === 0) return []
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } })
  if (!agent) return []
  return [
    '',
    "Work runs on the model this conversation talks on. Only when the person's own words name another model for this work, pass it as `model`,",
    'exactly as one of these values (`value`: model, via provider), and never invent one:',
    ...usable.slice(0, SHOWN).map(m => `- ${m.value}: ${m.label}, ${m.via}`),
    ...(usable.length > SHOWN ? [`(${usable.length - SHOWN} more are not listed; if the person names one of them, say so in your reply rather than guessing.)`] : []),
  ]
}
