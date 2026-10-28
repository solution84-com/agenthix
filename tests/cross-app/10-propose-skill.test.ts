// propose_skill reaching hq the way a run's site forwards it (skills spec part 5 *Proposing a skill*; adr-0159;
// security review H5): a POST to hq's data path with the site's own credential and a capability for a run that is
// going on the site, the run's id filled in as the site's MCP server fills it. hq asks the site for the run over the
// channel, takes the person from the run, and makes a proposal, never a live skill. A run that is not the person's own
// interactive conversation (here, one a schedule started) always proposes, whoever the person is.
//
// No agent runs: a run on this tier fails at launch (no agent image), and the site's MCP endpoint takes only a token
// its own running run holds. So the run is written into the site's database as going, and the call is the one the
// site's MCP server makes for the tool (site/src/server/hq/dataClient.ts). The site's half — that propose_skill is
// offered and forwarded with the calling run's id — is its unit tests' (forwardedSkillSchemas.test.ts).
//
// Runs on the pair an earlier file left, or alone (`npx vitest run 10-propose-skill`), pairing its own default site.
import { createDecipheriv, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { HQ_URL, SITE_SECRETS_KEY_IN_USE } from './harness/env'
import { hqDb, siteDb } from './harness/db'
import { login, op } from './harness/hqApi'
import { hqSigningKey, signToken } from './harness/hqSigner'
import { ensureDefaultSite } from './harness/knowledgeSetup'

// core's HQ_DATA_PATH, HQ_TOKEN_ISSUER and PROPOSE_SKILL_TOOL: this package does not depend on core.
const HQ_DATA_PATH = '/api/v1/data'
const HQ_TOKEN_ISSUER = 'agenthix-hq'
const PROPOSE_SKILL_TOOL = 'propose_skill'

const NAME = `crossapp-review-${Date.now().toString(36)}`
const SKILL_MD = `---\nname: ${NAME}\ndescription: Review a change before it is merged.\n---\n\n1. Read the change.\n2. Say what to fix.\n`

let siteId: string
let siteCredential: string
let adminId: string
let agentId: string

/** The site's stored credential for hq, decrypted as the site reads it (site/src/server/crypto/secretCrypto.ts). */
function decryptSiteSecret(stored: string): string {
  const [iv, tag, ct] = stored.split('.').map(p => Buffer.from(p, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(SITE_SECRETS_KEY_IN_USE, 'base64'), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** A run going on the site, in a chat session both apps hold, and a capability hq would mint for it. */
async function goingRun(startedBy: 'person' | 'schedule'): Promise<{ runId: string; capability: string }> {
  const sessionId = randomUUID()
  const runId = randomUUID()
  await hqDb.agentSession.create({ data: { id: sessionId, agentId, userId: adminId, sessionType: 'chat' } })
  await siteDb.agentSession.create({
    data: { id: sessionId, sessionKey: randomUUID(), agentId, userId: adminId, sessionType: 'chat', createdAt: new Date() },
  })
  await siteDb.agentRun.create({ data: { id: runId, agentId, sessionId, status: 'RUNNING', inputText: 'Make it a skill.', model: 'stand-in', startedAt: new Date() } })
  const now = Math.floor(Date.now() / 1000)
  const capability = signToken({
    iss: HQ_TOKEN_ISSUER, aud: siteId, iat: now, exp: now + 600,
    tokenType: 'capability', userId: adminId, runner: { kind: 'person', userId: adminId }, startedBy, agentId, sessionId,
    projectId: null, workspaceId: null, taskId: null, role: null, siteId,
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
  }, await hqSigningKey())
  return { runId, capability }
}

/** What the site's MCP server sends hq for one tool call. */
async function forwarded(capability: string, args: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const res = await fetch(new URL(HQ_DATA_PATH, HQ_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${siteCredential}`, 'X-Site-Id': siteId, 'X-Run-Capability': capability },
    body: JSON.stringify({ operation: PROPOSE_SKILL_TOOL, args }),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

beforeAll(async () => {
  await ensureDefaultSite()
  const [config, connection] = await Promise.all([siteDb.siteConfig.findFirst(), siteDb.hqConnection.findFirst()])
  siteId = config.siteId
  siteCredential = decryptSiteSecret(connection.connectionToken)
  const identity = await hqDb.authIdentity.findUniqueOrThrow({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: 'e2e-admin' } }, include: { auth: true },
  })
  adminId = identity.auth.userId
  const token = await login('e2e-admin', 'E2eAdmin!2026')
  const agent = await op(HQ_URL, 'create-agent', { name: 'Cross-App Skill Agent', handle: `crossapp-skill-${Date.now().toString(36)}` }, token)
  expect(agent.status, JSON.stringify(agent.json)).toBe(200)
  agentId = agent.json.id
}, 600_000)

describe('an agent proposes a skill through its site @security-H5 @SC-1661', () => {
  it('reaches hq, which makes a proposal for the run\'s person, never a live skill, whatever the call names', async () => {
    const { runId, capability } = await goingRun('schedule')
    const sent = await forwarded(capability, {
      name: NAME, description: 'Review a change before it is merged.', files: { 'SKILL.md': SKILL_MD },
      why: 'The person asked for their review steps as a skill.', aim: 'organisation', runId,
      // Never read: who asked is the run's person.
      forUserId: randomUUID(),
    })
    expect(sent.status, JSON.stringify(sent.json)).toBe(200)
    expect(sent.json.result).toMatchObject({ landed: 'proposal', name: NAME })

    const proposal = await hqDb.proposal.findFirstOrThrow({ where: { name: NAME, runId } })
    expect(proposal).toMatchObject({ aim: 'ORGANISATION', state: 'OPEN', agentId, forUserId: adminId })
    // Nothing went live: no asset of that name, published or not.
    expect(await hqDb.asset.findFirst({ where: { name: NAME } })).toBeNull()
  })

  it('is refused for a run that has ended, and nothing is made', async () => {
    const { runId, capability } = await goingRun('schedule')
    await siteDb.agentRun.update({ where: { id: runId }, data: { status: 'COMPLETED', endedAt: new Date() } })
    const sent = await forwarded(capability, {
      name: `${NAME}-late`, description: 'Late.', files: { 'SKILL.md': SKILL_MD.replace(NAME, `${NAME}-late`) }, why: 'Late.', aim: 'organisation', runId,
    })
    expect(sent.status, JSON.stringify(sent.json)).toBe(400)
    expect(await hqDb.proposal.findFirst({ where: { runId } })).toBeNull()
  })

  it('is refused for a run that is not the capability\'s', async () => {
    const mine = await goingRun('schedule')
    const other = await goingRun('schedule')
    const sent = await forwarded(mine.capability, {
      name: `${NAME}-other`, description: 'Other.', files: { 'SKILL.md': SKILL_MD.replace(NAME, `${NAME}-other`) }, why: 'Other.', aim: 'organisation', runId: other.runId,
    })
    expect(sent.status, JSON.stringify(sent.json)).toBe(403)
    expect(await hqDb.proposal.findFirst({ where: { runId: other.runId } })).toBeNull()
  })
})
