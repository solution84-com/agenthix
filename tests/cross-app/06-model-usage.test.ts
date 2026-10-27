// A run's model call, from the provider an organisation admin adds to the ledger row it is costed by (models from one
// place, parts 1, 4 and 5): hq checks and keeps the provider, the organisation's worker default names it, a task's
// run is dispatched with it to the site, the call goes through the site's relay to the vendor with the provider's key,
// the relay's usage report reaches hq, and hq writes one CALL row with the vendor's token counts, the run, its
// project and the organisation's default billing profile.
//
// The vendor is a stand-in on a local port (harness/fakeVendor.ts); no real one is called. This tier has no
// container runtime, so the run itself fails at launch on the site, and its call is made through the site's relay
// code run in this process instead (harness/siteRelay.ts says what that leaves out). Its report is kept in the
// running site's outbox folder, and the site delivers it to hq when it starts again.
//
// Runs after 05-relay, on the pair 04-pairing left running.
import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HQ_URL } from './harness/env'
import { hqDb, siteDb } from './harness/db'
import { login, op, until } from './harness/hqApi'
import { startSite, stopSite, waitForSite } from './harness/apps'
import { FAKE_KEY, FAKE_MODEL, FAKE_USAGE, FakeVendor } from './harness/fakeVendor'
import { InProcessRelay, USAGE_REPORTS_DIR } from './harness/siteRelay'

let vendor: FakeVendor
let relay: InProcessRelay
let adminToken: string
let providerId: string
let projectId: string
let agentId: string
let runId: string
let callId: string

beforeAll(async () => {
  vendor = await FakeVendor.start()
  relay = await InProcessRelay.start()
  adminToken = await login('e2e-admin', 'E2eAdmin!2026')
})

afterAll(async () => {
  await relay?.close()
  await vendor?.close()
})

async function reportsWaiting(): Promise<string[]> {
  return (await readdir(USAGE_REPORTS_DIR).catch(() => [] as string[])).filter(n => n.endsWith('.json'))
}

describe('a run’s call through the relay is written to the ledger @SC-1220', () => {
  it('an organisation admin adds the provider: hq checks its key with the vendor, keeps it, and answers no key', async () => {
    const added = await op(HQ_URL, 'add-ai-provider', {
      vendor: 'openai_compatible', key: FAKE_KEY, name: 'Stand-in vendor', baseUrl: vendor.baseUrl,
    }, adminToken)
    expect(added.status, JSON.stringify(added.json)).toBe(200)
    providerId = added.json.provider.id
    expect(JSON.stringify(added.raw)).not.toContain(FAKE_KEY)
    expect(vendor.seen).toContainEqual(expect.objectContaining({ method: 'GET', path: '/v1/models', authorization: `Bearer ${FAKE_KEY}` }))

    const row = await hqDb.aiProvider.findUniqueOrThrow({ where: { id: providerId } })
    expect(row.state).toBe('works')
    expect(row.secret).not.toContain(FAKE_KEY)

    const defaults = await op(HQ_URL, 'set-model-defaults', {
      conversation: `${providerId}/${FAKE_MODEL}`, worker: `${providerId}/${FAKE_MODEL}`,
    }, adminToken)
    expect(defaults.status, JSON.stringify(defaults.json)).toBe(200)
  })

  it('a task’s run is dispatched to the site with that provider, costed to its project and the default billing profile', async () => {
    const agent = await op(HQ_URL, 'create-agent', { name: 'Cross-App Usage Agent', handle: 'crossapp-usage' }, adminToken)
    expect(agent.status, JSON.stringify(agent.json)).toBe(200)
    agentId = agent.json.id
    const project = await op(HQ_URL, 'create-project', { name: `Cross-App Usage ${Date.now()}` }, adminToken)
    expect(project.status, JSON.stringify(project.json)).toBe(200)
    projectId = project.json.id
    await hqDb.projectAgent.create({ data: { projectId, agentId } })
    const task = await op(HQ_URL, 'create-task', { projectId, title: 'Cross-App Usage', assignedAgentId: agentId }, adminToken)
    expect(task.status, JSON.stringify(task.json)).toBe(200)

    const run = await op(HQ_URL, 'run-task', { taskId: task.json.id }, adminToken)
    expect(run.status, JSON.stringify(run.json)).toBe(200)
    const session = await until(async () => hqDb.agentSession.findUnique({ where: { taskId: task.json.id } }), "the task's session", 60_000)
    const siteRun = await until(async () => siteDb.agentRun.findFirst({ where: { sessionId: session.id } }), 'the run on the site', 60_000)
    runId = siteRun.id

    const costing = await until(async () => hqDb.runCosting.findUnique({ where: { runId } }), "hq's costing of the run", 60_000)
    const defaultProfile = await hqDb.billingProfile.findFirstOrThrow({ where: { isDefault: true, archivedAt: null } })
    expect(costing).toMatchObject({ providerId, model: FAKE_MODEL, projectId, agentId, billingProfileId: defaultProfile.id, subscription: false })

    // The run is left ended, so the site's restart below finds nothing of it still starting. Where there is no
    // container runtime it fails at launch; where there is one, it may complete.
    const ended = await until(async () => {
      const r = await siteDb.agentRun.findUnique({ where: { id: runId } })
      return r && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(r.status) ? r : null
    }, 'the run to end on the site', 150_000)
    expect(['COMPLETED', 'FAILED']).toContain(ended.status)
    await until(async () => {
      const t = await hqDb.task.findUnique({ where: { id: task.json.id }, select: { runState: true } })
      return t && t.runState !== 'RUN_ACTIVE' && t.runState !== 'RUN_QUEUED' ? true : null
    }, "the task's run state to settle", 30_000)
  })

  it('the call goes through the relay to the vendor with the provider’s key, never the relay token, and the stream comes back whole', async () => {
    const costing = await hqDb.runCosting.findUniqueOrThrow({ where: { runId } })
    const token = relay.openTurn(runId, {
      kind: 'api_key', providerId, vendor: 'openai_compatible', apiKey: FAKE_KEY, baseUrl: vendor.baseUrl,
    }, costing.billingProfileId)
    try {
      const res = await fetch(`${relay.providerUrl('openai_compatible')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: FAKE_MODEL, stream: true, stream_options: { include_usage: true }, messages: [{ role: 'user', content: 'Hello' }] }),
      })
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toContain('Hello from the stand-in vendor.')
      expect(text).toContain('data: [DONE]')
    } finally {
      relay.closeTurn(token)
    }

    const call = vendor.seen.find(r => r.method === 'POST' && r.path === '/v1/chat/completions')!
    expect(call.authorization).toBe(`Bearer ${FAKE_KEY}`)
    expect(JSON.parse(call.body).model).toBe(FAKE_MODEL)
    expect(JSON.stringify(vendor.seen)).not.toContain(token)

    await relay.reportsKept(1)
    // The folder is also the running site's outbox: a run's own container may have left a report there, so this
    // call's report is found by its id, not by counting.
    expect(relay.keptCallIds).toHaveLength(1)
    callId = relay.keptCallIds[0]
    await expect(access(join(USAGE_REPORTS_DIR, `${callId}.json`))).resolves.toBeUndefined()
  })

  it('the site delivers the report to hq, and hq writes one CALL row with the vendor’s counts, the run, its project and the profile', async () => {
    // The running site sends what its outbox folder holds when it starts.
    await stopSite()
    await startSite()
    await waitForSite()

    const report = await until(
      async () => hqDb.relayUsageReport.findFirst({ where: { callId, ledgeredAt: { not: null } } }),
      'the relay usage report kept and on the ledger in hq',
      90_000,
    )
    expect(report).toMatchObject({ providerId, model: FAKE_MODEL, hasUsage: true, upstreamStatus: 200, errorKind: null })
    await until(async () => ((await reportsWaiting()).length === 0 ? true : null), 'the site to drop the report hq acknowledged', 30_000)

    // Where a container runtime is present the run's own harness may also have called through the relay: count this call.
    const entries = await hqDb.usageEntry.findMany({ where: { runId, callId } })
    expect(entries).toHaveLength(1)
    const cached = FAKE_USAGE.prompt_tokens_details.cached_tokens
    const costing = await hqDb.runCosting.findUniqueOrThrow({ where: { runId } })
    expect(entries[0]).toMatchObject({
      kind: 'CALL', callId, purpose: 'worker',
      providerId, providerName: 'Stand-in vendor', model: FAKE_MODEL,
      inputTokens: FAKE_USAGE.prompt_tokens - cached, outputTokens: FAKE_USAGE.completion_tokens,
      cacheReadTokens: cached, cacheWriteTokens: 0,
      runId, projectId, agentId, billingProfileId: costing.billingProfileId,
    })
    const defaultProfile = await hqDb.billingProfile.findFirstOrThrow({ where: { isDefault: true, archivedAt: null } })
    expect(entries[0].billingProfileId).toBe(defaultProfile.id)
  })
})
