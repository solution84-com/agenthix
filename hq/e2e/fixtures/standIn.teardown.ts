import { test as teardown } from '@playwright/test'
import { adminOperations, takeRecord } from './standInModel'

// Removing the stand-in leaves the defaults on nothing, so the ones the organisation had before the run go back first,
// and so do the models of their own that agents had.
teardown('the organisation talks on what it did before the run', async ({ request }) => {
  const record = takeRecord()
  if (!record) return
  const call = await adminOperations(request)
  if (!call) return
  await call('set-model-defaults', {
    ...(record.conversation ? { conversation: record.conversation } : {}),
    ...(record.worker ? { worker: record.worker } : {}),
  }).catch(() => undefined)
  for (const { agentId, conversation, worker } of record.agents ?? []) {
    await call('set-agent-models', { agentId, conversation, worker }).catch(() => undefined)
  }
  await call('remove-ai-provider', { id: record.providerId })
})
