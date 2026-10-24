/**
 * A run's calls to the site that holds the place's storage: start it, and read its state back when events were
 * lost. An unreachable site is told apart from one that answered, and from one that may have received the run but
 * didn't answer in time — that one may be running it, so the run isn't simply forgotten.
 */
import {
  WORKFLOW_RUN_METHODS,
  type WorkflowRunAcceptance,
  type WorkflowRunInstruction,
  type WorkflowRunReport,
} from '@agenthix/core'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'

const RUN_ANSWER_TIMEOUT_MS = 30_000
const GET_TIMEOUT_MS = 10_000

export type RunSent =
  | { sent: 'accepted' }
  | { sent: 'refused'; message: string }
  /** Never reached the site: nothing was given to it. */
  | { sent: 'unreachable' }
  /** It may have reached the site, which didn't answer. */
  | { sent: 'unknown' }

export type RunSiteCalls = {
  run(siteId: string, instruction: WorkflowRunInstruction): Promise<RunSent>
  get(siteId: string, runId: string): Promise<WorkflowRunReport | null>
}

export const runSiteCalls: RunSiteCalls = {
  async run(siteId, instruction) {
    let answer: WorkflowRunAcceptance
    try {
      answer = await siteChannelRegistry.request(siteId, WORKFLOW_RUN_METHODS.run, instruction, RUN_ANSWER_TIMEOUT_MS)
    } catch (err) {
      if (err instanceof ChannelRequestFailed && err.code === 'offline') return { sent: 'unreachable' }
      if (err instanceof ChannelRequestFailed && err.code === 'unknown_method') {
        return { sent: 'refused', message: 'The Execution Site that holds this place\'s storage can\'t run workflows yet; it needs upgrading. Nothing was changed.' }
      }
      // Timed out, disconnected, or failed part way: the site may have started it.
      return { sent: 'unknown' }
    }
    if (answer?.accepted === true) return { sent: 'accepted' }
    const message = typeof answer?.message === 'string' && answer.message ? answer.message.slice(0, 1000) : 'The Execution Site refused the run. Nothing was changed.'
    return { sent: 'refused', message }
  },

  async get(siteId, runId) {
    try {
      return await siteChannelRegistry.request(siteId, WORKFLOW_RUN_METHODS.get, { runId }, GET_TIMEOUT_MS)
    } catch {
      return null
    }
  },
}
