import { test as teardown } from '@playwright/test'
import { ORG_KEY, adminOperations, takeRecord } from './standInModel'

teardown('the organisation talks on what it did before the run', async ({ request }) => {
  const record = takeRecord()
  if (!record) return
  const call = await adminOperations(request)
  if (!call) return
  await call('set-model-policy', { scope: 'org', talking: record.talking })
  await call('delete-model-credential', ORG_KEY)
})
