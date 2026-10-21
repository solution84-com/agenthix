// Removes everything seed-e2e-users.mjs / seed-e2e-data.mjs created.
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// hq's client reads the ambient DATABASE_URL (README setup step). The site's
// client must not: that variable is hq's, so its URL comes from site/.env.server,
// as in seed-e2e-data.mjs.
const require = createRequire(import.meta.url)
const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../site')
const siteEnvPath = resolve(siteRoot, '.env.server')
const siteUrl = existsSync(siteEnvPath)
  ? readFileSync(siteEnvPath, 'utf8').split('\n').map(l => l.trim()).find(l => l.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).replace(/^"|"$/g, '')
  : undefined
if (!siteUrl) {
  console.error('[cleanup-e2e-data] no DATABASE_URL in site/.env.server.')
  process.exit(1)
}
const { PrismaClient } = require('@prisma/client')
const { PrismaClient: SitePrismaClient } = require(resolve(siteRoot, 'node_modules/@prisma/client'))
const p = new PrismaClient()
const site = new SitePrismaClient({ datasources: { db: { url: siteUrl } } })
const sessionIds = []
for (const username of ['e2e-operator', 'e2e-admin']) {
  const ident = await p.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username } },
    include: { auth: true },
  })
  if (!ident) { console.log(`${username}: absent`); continue }
  const userId = ident.auth.userId
  // Transcript entries and runs live in the site's database, not hq's. The
  // site's own copy of these sessions (and, by cascade, their entries and
  // runs) is removed below, once hq's rows say which sessions they were.
  // Conversations are held in hq; their messages go with them by cascade.
  await p.conversation.deleteMany({ where: { openedById: userId } })
  const sessions = await p.agentSession.findMany({ where: { userId }, select: { id: true } })
  sessionIds.push(...sessions.map(s => s.id))
  await p.agentSession.deleteMany({ where: { userId } })
  await p.userSettings.deleteMany({ where: { userId } })
  await p.authIdentity.deleteMany({ where: { authId: ident.authId } })
  await p.auth.deleteMany({ where: { userId } })
  await p.user.delete({ where: { id: userId } })
  console.log(`${username}: removed`)
}
// executionSiteRegistry.spec.ts — order matters. Project.executionSiteId and
// UserStoragePlacement.siteId both reference ExecutionSite with onDelete:
// Restrict, so a site anything still points at refuses to delete. Projects go
// first. The e2e users' own placement rows are already gone by this point —
// not because of the loop's deletes, but because UserStoragePlacement cascades
// from User. Any OTHER person's storage placed on an e2e site would still
// block the delete, so those are cleared explicitly rather than left to luck.
const projectCleanup = await p.project.deleteMany({ where: { name: { startsWith: 'E2E' } } })
console.log('e2e projects removed:', projectCleanup.count)
const placementCleanup = await p.userStoragePlacement.deleteMany({
  where: { site: { siteId: { startsWith: 'e2e-site-' } } },
})
console.log('e2e user storage placements removed:', placementCleanup.count)
const siteCleanup = await p.executionSite.deleteMany({ where: { siteId: { startsWith: 'e2e-site-' } } })
console.log('e2e execution sites removed:', siteCleanup.count)

// The site's copy of each session; its entries and runs go with it by cascade.
const siteSessions = await site.agentSession.deleteMany({ where: { id: { in: sessionIds } } })
console.log('e2e site-side sessions removed:', siteSessions.count)

await p.$disconnect()
await site.$disconnect()
