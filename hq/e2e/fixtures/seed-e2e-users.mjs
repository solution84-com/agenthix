// Throwaway end-to-end test accounts. Uses the app's real password hashing so the
// UI login path is genuinely exercised. Removed again by cleanup-smoke-users.mjs.
import { PrismaClient } from '@prisma/client'
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
