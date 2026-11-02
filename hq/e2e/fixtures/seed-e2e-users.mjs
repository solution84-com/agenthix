// Throwaway end-to-end test accounts. Uses the app's real password hashing so the
// UI login path is genuinely exercised. Removed again by cleanup-smoke-users.mjs.
import { PrismaClient } from '@prisma/client'
import { FEATURE_FLAGS } from '@agenthix/core'
import { hashPassword } from '../../.wasp/out/sdk/wasp/dist/auth/password.js'

const prisma = new PrismaClient()

// hq creates its default organisation at boot, but a database that was never
// booted (a fresh test database) has none, and enrolling a site needs one.
// Left in place by the cleanup script: it is not this script's to remove.
// A caller that asserts hq creates the organisation itself (the cross-app
// pairing suite) sets E2E_SEED_NO_ORG=1 to leave it out.
if (process.env.E2E_SEED_NO_ORG !== '1' && (await prisma.org.count()) === 0) {
  await prisma.org.create({ data: { name: 'My Organisation' } })
  console.log('org: created (none existed)')
}

// Every test runs as shipped (adr-0172), but the e2e suite runs against `wasp start`, a development build, where a
// flag at preview or beta is on with no switch. So the organisation's switches are set to production's values: only a
// released flag on. A feature's own specs switch it on around their group (fixtures/withFeature.ts). The full
// regression's extra run sets TEST_ALL_FEATURES=1, read only here, to switch every flag on.
const allOn = process.env.TEST_ALL_FEATURES === '1'
const at = new Date().toISOString()
const featureSwitches = Object.fromEntries(Object.entries(FEATURE_FLAGS)
  .map(([flag, entry]) => [flag, { on: allOn || entry.stage === 'released', byUserId: null, at }]))
const { count } = await prisma.org.updateMany({ data: { featureSwitches } })
if (count > 0) console.log(`features: ${allOn ? 'every flag on' : "production's values"}`)

const USERS = [
  { username: 'e2e-operator', password: 'E2eOperator!2026', role: 'MEMBER' },
  { username: 'e2e-admin', password: 'E2eAdmin!2026', role: 'ADMIN' },
]

for (const { username, password, role } of USERS) {
  const existing = await prisma.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username } },
  })
  if (existing) { console.log(`${username}: already exists, skipping`); continue }
  const providerData = JSON.stringify({ hashedPassword: await hashPassword(password) })
  const user = await prisma.user.create({
    data: { auth: { create: { identities: { create: { providerName: 'username', providerUserId: username, providerData } } } } },
  })
  await prisma.userSettings.create({ data: { userId: user.id, role, config: {} } })
  console.log(`${username}: created (${role}) id=${user.id}`)
}
await prisma.$disconnect()
