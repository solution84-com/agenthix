// Data for the Knowledge specs (knowledge.spec.ts, orgKnowledge.spec.ts, conversationPlaces.spec.ts), made through hq's
// own operations as the e2e administrator, so nothing is written into storage by hand. Run it after seed-e2e-users.mjs,
// with hq running; it can be run again and leaves what it made. Prints the lines to export:
//   E2E_KNOWLEDGE_PROJECT_KEY   a project the administrator changes and the e2e operator reads as a Viewer
//   E2E_PLACES_PROJECT_NAME     a project the operator is a Member of, for adding to a conversation
//   E2E_PLACES_CONVERSATION_ID  the operator's own conversation, holding the lead's card asking to add that project
import { createRequire } from 'node:module'
import { createCipheriv, randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { SERVICE_PORTS } from '@agenthix/core'

const require = createRequire(import.meta.url)
const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    const eq = line.indexOf('=')
    if (!line || line.startsWith('#') || eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, '')
  }
  return out
}
const env = { ...parseEnvFile(resolve(hqRoot, '.env.server')), ...process.env }
const server = process.env.E2E_SERVER_URL ?? `http://localhost:${SERVICE_PORTS.hq.server}`

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } })

const login = await fetch(`${server}/auth/username/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'e2e-admin', password: 'E2eAdmin!2026' }),
})
if (!login.ok) { console.error(`[seed-e2e-knowledge] the e2e administrator cannot sign in (${login.status}); run seed-e2e-users.mjs first`); process.exit(1) }
const { sessionId } = await login.json()
async function operation(name, args) {
  const res = await fetch(`${server}/operations/${name}`, {
    method: 'POST', headers: { Authorization: `Bearer ${sessionId}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ json: args }),
  })
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`)
  return (await res.json()).json
}

const userOf = async (username) => (await prisma.authIdentity.findUnique({
  where: { providerName_providerUserId: { providerName: 'username', providerUserId: username } }, include: { auth: true },
})).auth.userId
const adminId = await userOf('e2e-admin')
const operatorId = await userOf('e2e-operator')

async function ensureProject(key, name, operatorRole) {
  let project = await prisma.project.findUnique({ where: { key } })
  if (!project) project = await operation('create-project', { name, key })
  await operation('add-project-member', { projectId: project.id, userId: adminId, role: 'ADMIN' })
  await operation('add-project-member', { projectId: project.id, userId: operatorId, role: operatorRole })
  return prisma.project.findUniqueOrThrow({ where: { key } })
}
const knowledgeProject = await ensureProject('EKNOW', 'E2E knowledge', 'VIEWER')
const placesProject = await ensureProject('EPLACE', 'E2E places project', 'MEMBER')

// The operator's conversation, with the lead's card as hq stores it (an ACTION line naming the place; the format is
// src/conversations/placesProtocol.ts), sealed the way hq seals bodies (AES-256-GCM under SECRETS_MASTER_KEY).
function seal(plain) {
  const key = Buffer.from(env.SECRETS_MASTER_KEY ?? '', 'base64')
  if (key.length !== 32) { console.error('[seed-e2e-knowledge] SECRETS_MASTER_KEY is missing or not 32 bytes.'); process.exit(1) }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`
}
const agent = await prisma.agent.findFirst()
const title = 'e2e places conversation'
let conversation = await prisma.conversation.findFirst({ where: { openedById: operatorId, home: 'PERSON', title } })
if (!conversation) {
  conversation = await prisma.conversation.create({ data: { home: 'PERSON', openedById: operatorId, agentId: agent.id, title, lastSeq: 1 } })
  const card = {
    text: `Add a place to this conversation: ${placesProject.name}`,
    toolName: 'suggest_place',
    target: { kind: 'place', id: placesProject.id, label: placesProject.name, params: { level: placesProject.slug ?? placesProject.key.toLowerCase(), why: 'The release process is written down there.' } },
  }
  await prisma.conversationMessage.create({
    data: { conversationId: conversation.id, seq: 1, role: 'AGENT', agentId: agent.id, kind: 'ACTION', body: seal(JSON.stringify(card)) },
  })
}
console.log('E2E_KNOWLEDGE_PROJECT_KEY=' + knowledgeProject.key)
console.log('E2E_PLACES_PROJECT_NAME=' + placesProject.name)
console.log('E2E_PLACES_CONVERSATION_ID=' + conversation.id)
await prisma.$disconnect()
