import { test as setup } from '@playwright/test'
import { ORG_KEY, STAND_IN_URL, adminOperations, writeRecord } from './standInModel'

// The organisation talks on the stand-in for the run. An organisation that already has its own endpoint is left as
// it is, and so is one the e2e admin cannot sign in to (the specs that sign in fail on their own).
setup('the organisation talks on the stand-in model', async ({ request }) => {
  const call = await adminOperations(request)
  if (!call) return
  if ((await call('get-model-credential-status', ORG_KEY)).present) return
  const before = (await call('get-model-policy', { scope: 'org' })).policy as { talking?: string | null } | null
  await call('set-model-credential', { ...ORG_KEY, baseUrl: STAND_IN_URL, secret: '' })
  await call('set-model-policy', { scope: 'org', talking: 'openai_compatible/stand-in' })
  writeRecord({ talking: before?.talking ?? null })
})
