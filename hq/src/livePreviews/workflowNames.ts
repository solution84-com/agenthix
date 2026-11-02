/** The workflow names a place gives its live-preview workflows (live preview spec section 4, *Secrets*). Client-safe. */
export type LivePreviewWorkflowKind = 'start' | 'reload'

export const LIVE_PREVIEW_WORKFLOW_NAMES: Record<LivePreviewWorkflowKind, string> = {
  start: 'start-live-preview',
  reload: 'reload-live-preview',
}

/** A live preview's own workflow, run from its strip (*Start with secrets*), never from *Deploy…*. */
export function isLivePreviewWorkflow(name: string): boolean {
  return Object.values(LIVE_PREVIEW_WORKFLOW_NAMES).includes(name)
}
