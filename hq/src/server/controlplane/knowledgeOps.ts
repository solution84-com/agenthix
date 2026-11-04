/**
 * The five knowledge tools for a worker's run (agent knowledge spec, part 3, *Serving*): data-path-only, forwarded by
 * the run's site, which fills in the calling run's id as it does for set_result. What a call reaches is built from
 * the run's capability alone (knowledgeReach.ts); the knowledge service validates the tool's own input and answers
 * its text. A conversation's lead reaches the same service through its own tools (conversations/memory/
 * leadKnowledgeTools.ts), so a turn is refused here, as a connection is.
 *
 * The site names the run, and hq checks it as set_result does: it must be a run of the capability's own session (and
 * task), since the id keys the call's rate limit and the record of who changed what.
 */
import {
  deleteKnowledge, editKnowledge, readKnowledge, searchKnowledge, writeKnowledge, type KnowledgeReach,
} from '../../knowledge'
import { ControlPlaneError, type CallerContext } from './types'
import { actingPerson } from './runPerson'
import { runReach } from './knowledgeReach'
import { runOfCapability } from './capabilityRun'

type KnowledgeCall = (reach: KnowledgeReach, params: unknown) => Promise<string>
type WithRun = Record<string, unknown> & { runId?: string }

function knowledgeOp(tool: string, call: KnowledgeCall) {
  return async (ctx: CallerContext, args: WithRun): Promise<string> => {
    if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', `${tool} is for an agent's run`)
    const { runId, ...params } = args ?? {}
    if (!runId) throw new ControlPlaneError('invalid', `${tool} needs the run it is called from, which this site did not say`)
    const { claims } = ctx
    // The site leaves a never-listed tool out of the run's list; refused here too, so no other caller gets round it.
    if (claims.permissions.neverTools.includes(tool)) throw new ControlPlaneError('forbidden', `${tool} is not available for this agent`)
    if (!(await runOfCapability(claims, runId))) throw new ControlPlaneError('forbidden', `${tool} names a run that is not this one`)
    const { userId } = await actingPerson(ctx, tool)
    return call(await runReach(claims, userId, runId), params)
  }
}

export const searchKnowledgeOp = knowledgeOp('search_knowledge', searchKnowledge)
export const readKnowledgeOp = knowledgeOp('read_knowledge', readKnowledge)
export const writeKnowledgeOp = knowledgeOp('write_knowledge', writeKnowledge)
export const editKnowledgeOp = knowledgeOp('edit_knowledge', editKnowledge)
export const deleteKnowledgeOp = knowledgeOp('delete_knowledge', deleteKnowledge)
