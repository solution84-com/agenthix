import { createRequire } from 'node:module'
import { createCipheriv, randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Workspaces live in site's database (plan 5c) — e2e fixtures reach each
// database with its own client. hq's client still owns everything else this
// fixture needs (users, agents, conversations). Both clients get an explicit
// datasource override read from each app's own .env.server: relying on a bare
// `new PrismaClient()` picking up ambient process.env.DATABASE_URL is exactly
// what breaks when the two apps' URLs differ (as the README's own "export
// DATABASE_URL" setup step would do here).
const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const hqRoot = resolve(here, '../..')
const siteRoot = resolve(hqRoot, '../site')

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim().replace(/^"|"$/g, '')
    out[key] = val
  }
  return out
}

// hq's follows the copy script's pattern too (file, then process.env override) —
// the README's documented setup step exports hq's own DATABASE_URL, so this
// still resolves to hq's value either way. site's deliberately does NOT spread
// process.env: that ambient DATABASE_URL is hq's by the same documented step,
// and would silently point the site client at the wrong database.
const hqEnv = { ...parseEnvFile(resolve(hqRoot, '.env.server')), ...process.env }
const siteEnv = parseEnvFile(resolve(siteRoot, '.env.server'))

if (!hqEnv.DATABASE_URL) {
  console.error('[seed-e2e-data] no DATABASE_URL for hq (checked process env and hq/.env.server).')
  process.exit(1)
}
if (!siteEnv.DATABASE_URL) {
  console.error('[seed-e2e-data] no DATABASE_URL for site (checked site/.env.server).')
  process.exit(1)
}

const { PrismaClient } = require('@prisma/client')
const { PrismaClient: SitePrismaClient } = require(resolve(siteRoot, 'node_modules/@prisma/client'))

const p = new PrismaClient({ datasources: { db: { url: hqEnv.DATABASE_URL } } })
const site = new SitePrismaClient({ datasources: { db: { url: siteEnv.DATABASE_URL } } })

const a = await p.authIdentity.findUnique({ where: { providerName_providerUserId: { providerName: 'username', providerUserId: 'e2e-operator' } }, include: { auth: true } })
const userId = a.auth.userId
const agent = await p.agent.findFirst()

// The operator's private conversation is held in hq: its row, and one message whose body is sealed the way hq
// seals it (AES-256-GCM under SECRETS_MASTER_KEY; the format is src/server/crypto/secretCrypto.ts).
function seal(plain) {
  const key = Buffer.from(hqEnv.SECRETS_MASTER_KEY ?? '', 'base64')
  if (key.length !== 32) {
    console.error('[seed-e2e-data] SECRETS_MASTER_KEY is missing or not 32 bytes (checked process env and hq/.env.server).')
    process.exit(1)
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`
}

let c = await p.conversation.findFirst({ where: { openedById: userId, home: 'PERSON', title: 'operator private conversation' } })
if (!c) {
  c = await p.conversation.create({
    data: { home: 'PERSON', openedById: userId, agentId: agent.id, title: 'operator private conversation', lastSeq: 1 },
  })
  await p.conversationMessage.create({
    data: {
      conversationId: c.id, seq: 1, role: 'PERSON', authorId: userId, kind: 'TEXT',
      body: seal(JSON.stringify({ text: 'E2E-PRIVATE-TRANSCRIPT-MARKER' })),
    },
  })
}
const ws = await site.workspace.findFirst({ where: { name: 'smoke' } }) ?? await site.workspace.findFirst()
console.log('E2E_CONVERSATION_ID=' + c.id)
console.log('E2E_AGENT_ID=' + agent.id)
// A fresh site may have no workspace yet; the workspace spec then skips.
console.log(ws ? 'E2E_WORKSPACE_ID=' + ws.id : '# no workspace on the site yet: E2E_WORKSPACE_ID left unset')
await p.$disconnect()
await site.$disconnect()
