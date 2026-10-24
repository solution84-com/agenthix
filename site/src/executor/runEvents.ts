/**
 * A run's step events and its result, to hq over the control channel as the site's other run events go
 * (`SiteStreamEmitter.ts`): fire and forget, since hq recovers a run's state with `workflow.get` after a lost frame.
 */
import { WORKFLOW_RESULT_EVENT, WORKFLOW_STEP_EVENT, type WorkflowRunResult, type WorkflowStepEvent } from '@agenthix/core'
import { hqConnectionManager } from '../server/hq/hqConnection'

export function sendStepEvent(e: WorkflowStepEvent): void {
  hqConnectionManager.sendEvent(WORKFLOW_STEP_EVENT, e)
}

export function sendResult(r: WorkflowRunResult): void {
  hqConnectionManager.sendEvent(WORKFLOW_RESULT_EVENT, r)
}
