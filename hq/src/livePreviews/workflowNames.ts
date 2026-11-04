/** The workflow names a place gives its live-preview workflows (live preview spec section 4, *Secrets*). Client-safe; declared once, in core. */
import { LIVE_PREVIEW_WORKFLOW_NAMES, isLivePreviewWorkflowName } from '@agenthix/core'

export { LIVE_PREVIEW_WORKFLOW_NAMES }
export type LivePreviewWorkflowKind = keyof typeof LIVE_PREVIEW_WORKFLOW_NAMES

/** A live preview's own workflow, run from its strip (*Start with secrets*), never from *Deploy…*. */
export const isLivePreviewWorkflow = isLivePreviewWorkflowName
