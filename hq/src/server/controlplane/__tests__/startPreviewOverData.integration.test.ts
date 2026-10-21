/**
 * The refusal an agent actually reads (@SC-307).
 *
 * Agents run on a site, so `start_preview` reaches hq through the data path:
 * `dataApi.ts` → `startPreviewOp` → `runStartPreview`. `dataApi` answers a
 * plain `Error` with `500 {"error":"internal error"}` on purpose, so every
 * carefully worded refusal in the preview path is invisible unless it is a
 * `ControlPlaneError`. These run the whole chain against the real test
 * database — the site's credential, the signed capability, the run's session
 * and project, the preview row — replacing only the socket to the site.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PreviewError, SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createUser, createProject } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
const channelRequest = vi.hoisted(() => vi.fn())
vi.mock('../../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request: channelRequest }, ChannelRequestFailed }
})
vi.mock('../../../preview/previewWiring', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../preview/previewWiring')>()),
  hqBaseUrl: () => 'https://hq.example',
  previewDomain: () => 'preview.hq.example',
}))

import { dataHandler } from '../dataApi'
import { signCapability } from '../../identity/tokenService'
import { ensureHqSigningKey } from '../../identity/signingKeyService'
import { hashCredential } from '../../../sites/credentials'

const SITE = 'site-b'
const CREDENTIAL = 'smc_preview_site'
let capability: string

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  channelRequest.mockReset()
  await ensureHqSigningKey()
  const site = await prisma.executionSite.create({
    data: { siteId: SITE, label: 'Studio', status: 'ONLINE', protocolVersion: SITE_PROTOCOL_VERSION, credentialHash: hashCredential(CREDENTIAL) },
  })
  const user = await createUser()
  const project = await createProject({ executionSiteId: site.id, accessLevel: 'OPEN' })
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Agent', handle: 'agent-1' } })
  await prisma.agentSession.create({
    data: { id: 's1', userId: user.id, agentId: 'agent-1', sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: project.id },
  })
  capability = (await signCapability({
    userId: user.id, runner: { kind: 'person', userId: user.id }, startedBy: 'person', agentId: 'agent-1', sessionId: 's1',
    projectId: project.id, workspaceId: null, taskId: null, role: null, siteId: SITE,
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
  })).token
})

async function callStartPreview() {
  const r = { code: 200, body: undefined as { error?: string; result?: unknown } | undefined, status(c: number) { r.code = c; return r }, json(b: never) { r.body = b; return r } }
  const req = {
    headers: { authorization: `Bearer ${CREDENTIAL}`, 'x-site-id': SITE, 'x-run-capability': capability },
    body: { operation: 'start_preview', args: { command: 'npm run dev', port: 5173 } },
  }
  // The Wasp API type wants Express's request and response; these pass the fields the handler reads.
  await (dataHandler as unknown as (req: unknown, res: unknown, ctx: unknown) => Promise<void>)(req, r, {})
  return r
}

describe('start_preview over the data path @SC-307', () => {
  it("hands the agent the site's reason, not \"internal error\"", async () => {
    channelRequest.mockRejectedValue(new PreviewError('no_container', 'preview.start found no container'))
    const r = await callStartPreview()
    expect(r.code).toBe(409)
    expect(r.body?.error).toMatch(/start a run there first/)
    expect(r.body?.error).not.toMatch(/internal error/)
  })

  it("hands the agent the dev server's own output when it never answered", async () => {
    channelRequest.mockRejectedValue(new PreviewError('not_ready', 'EADDRINUSE: port 5173 is taken'))
    expect((await callStartPreview()).body?.error).toMatch(/EADDRINUSE/)
  })

  it("returns the preview's own host when the site starts one, and records the preview for this site", async () => {
    channelRequest.mockResolvedValue({ previewId: 'pv-9' })
    const r = await callStartPreview()
    const row = await prisma.previewSession.findFirstOrThrow()
    expect(r.body?.result).toEqual({ url: `https://p-${row.id}.preview.hq.example/`, status: 'running' })
    expect(row).toMatchObject({ siteId: SITE, agentId: 'agent-1', sessionId: 's1', command: 'npm run dev' })
    expect(channelRequest.mock.calls[0][0]).toBe(SITE)
  })
})
