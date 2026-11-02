/**
 * The last step of a run aimed at a live preview (core's `WorkflowRunInstruction.livePreview`): once its steps passed,
 * the scan found nothing and its changes were written back, the secrets its steps name go to the live preview's app
 * container (`server/livePreviews/secrets/handedSecrets.ts`). The site checks again that the live preview is still its
 * own and running first. Answers null when they were handed, or the sentence the run fails with.
 */
import type { WorkflowRunInstruction } from '@agenthix/core'
import { HandOffFailed, handSecrets, secretsToHand } from '../server/livePreviews/secrets/handedSecrets'
import { runningPreviewFor } from '../server/livePreviews/secrets/runTarget'
import { Logger } from '../server/utils/logger'

const logger = new Logger('executor')

export type HandOver = (ins: WorkflowRunInstruction) => Promise<string | null>

export const handOverToLivePreview: HandOver = async ins => {
  const row = await runningPreviewFor(ins)
  if (!row) return 'The run passed, but the live preview stopped or paused meanwhile, so its secrets were not handed to the app. Run the workflow again once it is running.'
  try {
    await handSecrets(row.id, secretsToHand(ins.steps), ins.masking)
    return null
  } catch (err) {
    if (err instanceof HandOffFailed) return `The run passed, but ${err.message.charAt(0).toLowerCase()}${err.message.slice(1)}`
    logger.error(`run ${ins.runId}: its secrets could not be handed to live preview ${row.id}`, { error: err instanceof Error ? err.message : String(err) })
    return 'The run passed, but the site could not hand its secrets to the live preview\'s app.'
  }
}
