import { test as setup } from '@playwright/test'
import { ADMIN, MEMBER } from './auth'
import { SERVER_URL } from './urls'

// The specs sign in as two seeded accounts (auth.ts). Against a database that was just reset they do not exist, and
// every spec's sign-in would answer 401 and count toward hq's sign-in limit, which then refuses the whole run for 15
// minutes. This checks both once, before anything else, and stops the run with what to do.
setup('the e2e accounts are seeded', async ({ request }) => {
  const missing: string[] = []
  for (const account of [ADMIN, MEMBER]) {
    const login = await request.post(`${SERVER_URL}/auth/username/login`, { data: account, failOnStatusCode: false })
    if (login.status() === 429) {
      throw new Error(`HQ at ${SERVER_URL} refuses sign-ins from here for a while (too many wrong passwords). Wait 15 minutes, or restart HQ, then run again.`)
    }
    if (!login.ok()) missing.push(account.username)
  }
  if (missing.length > 0) {
    throw new Error(
      `The e2e accounts ${missing.join(' and ')} cannot sign in to HQ at ${SERVER_URL}. Run the seed scripts first: ` +
        '`node e2e/fixtures/seed-e2e-users.mjs` (see e2e/README.md, "Test data"). Nothing was run.',
    )
  }
})
