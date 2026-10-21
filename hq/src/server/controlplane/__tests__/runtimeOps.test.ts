/**
 * start_preview's forward: it reads nothing itself — it hands the preview tool
 * the run's own boundary, from its claims, and a channel request to the site
 * that holds it. (resolve_git_credential: resolveGitCredential.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { ControlPlaneError, type CallerContext } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'

const { mockRunStartPreview, mockResolvePreviewBoundary, mockChannelRequest } = vi.hoisted(() => ({
  mockRunStartPreview: vi.fn(),
  mockResolvePreviewBoundary: vi.fn(),
  mockChannelRequest: vi.fn(),
}))

vi.mock('../../../preview/previewBoundary', () => ({ resolvePreviewBoundary: mockResolvePreviewBoundary }))

vi.mock('../../../preview/startPreviewTool', () => ({ runStartPreview: mockRunStartPreview }))
vi.mock('../../../preview/previewRegistry', () => ({ createPreview: vi.fn(), markStatus: vi.fn() }))
vi.mock('../../../preview/previewWiring', () => ({
  hqBaseUrl: () => 'https://hq.example.com',
  previewDomain: () => 'preview.hq.example.com',
  PREVIEW_TTL_MS: 1_800_000,
}))
vi.mock('../../../sites/channel', () => ({ siteChannelRegistry: { request: mockChannelRequest } }))

import { startPreviewOp } from '../runtimeOps'

function makeClaims(overrides: Partial<CapabilityClaims> = {}): CapabilityClaims {
  return {
    tokenType: 'capability',
    userId: 'u1',
    runner: { kind: 'person', userId: 'u1' }, startedBy: 'person' as const,
    agentId: 'agent-1',
    sessionId: 's1',
    projectId: null,
    workspaceId: null,
    taskId: null,
    role: null,
    siteId: 'site-local',
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    ...overrides,
  }
}

const CLAIMS_CTX: CallerContext = { kind: 'run', claims: makeClaims() }
const CONNECTION_CTX: CallerContext = connectionCaller()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('start_preview', () => {
  it("refuses a person's connection, which is no run (adr-0090)", async () => {
    await expect(startPreviewOp(CONNECTION_CTX, { command: 'npm run dev', port: 5173 })).rejects.toBeInstanceOf(ControlPlaneError)
    expect(mockRunStartPreview).not.toHaveBeenCalled()
  })

  it("resolves the run's own boundary from its claims, never a model-supplied identity", async () => {
    const boundary = {
      agentId: 'agent-1', sessionId: 's1', siteId: 'site-b',
      location: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null },
      ownerSlug: 'acme',
    }
    mockResolvePreviewBoundary.mockResolvedValue(boundary)
    mockRunStartPreview.mockResolvedValue({ url: 'https://p-row1.preview.hq.example.com/', status: 'running' })

    const result = await startPreviewOp(CLAIMS_CTX, { command: 'npm run dev', port: 5173 })

    expect(result).toEqual({ url: 'https://p-row1.preview.hq.example.com/', status: 'running' })
    expect(mockRunStartPreview).toHaveBeenCalledTimes(1)
    const [args, deps] = mockRunStartPreview.mock.calls[0]
    expect(args).toEqual({ command: 'npm run dev', port: 5173 })
    expect(await deps.resolveTarget()).toEqual(boundary)
    expect(deps.previewDomain).toBe('preview.hq.example.com')
    // The run is named by the capability's own agent and session, not by anything the model said.
    expect(mockResolvePreviewBoundary).toHaveBeenCalledWith({ agentId: 'agent-1', sessionId: 's1' })
  })

  // hq no longer runs anything for a preview: the forward is a control-channel
  // request to the site that holds the boundary.
  it('hands the tool a channel request addressed to whichever site it is given', async () => {
    mockResolvePreviewBoundary.mockResolvedValue({})
    mockRunStartPreview.mockResolvedValue({ url: 'u', status: 'running' })
    mockChannelRequest.mockResolvedValue({ previewId: 'pv-9' })

    await startPreviewOp(CLAIMS_CTX, { command: 'npm run dev', port: 5173 })

    const [, deps] = mockRunStartPreview.mock.calls[0]
    await deps.request('site-b', 'preview.start', { command: 'npm run dev' })
    expect(mockChannelRequest).toHaveBeenCalledWith('site-b', 'preview.start', { command: 'npm run dev' })
  })
})
