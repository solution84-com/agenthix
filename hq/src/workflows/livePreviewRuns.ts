/**
 * The workflows' run path for a live preview's secrets (live preview spec section 4, *Secrets*; adr-0171): a place's
 * *Start live preview* or *Reload live preview*, run as any person's run of an approved workflow (`runs.ts`), sent to
 * the site the live preview runs on, which hands the secrets its steps name to the app's own container. Provided to
 * `livePreviews/workflowSecrets.ts` at start, which has checked the live preview and the workflow already;
 * `startWorkflowRun` checks the person and the workflow again, as for every run.
 */
import type { LivePreviewWorkflowDelivery } from '../livePreviews/workflowSecrets'
import { startWorkflowRun } from './runs'

export const deliverLivePreviewWorkflow: LivePreviewWorkflowDelivery = a => startWorkflowRun({
  place: a.place,
  workspace: { ownerType: a.place.type, ownerId: a.place.id, workspaceId: a.workspaceId },
  workflow: { name: a.workflowName },
  parameters: {},
  starter: { kind: 'person', userId: a.userId },
  livePreview: { id: a.livePreviewId, siteId: a.siteId },
})
