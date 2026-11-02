/** The lead's offer: only a code workspace of the project, a task's branch or main, and a card that starts nothing. */
import { withFeature } from '@agenthix/core/testing'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../relays', () => ({ livePreviewsHaveAnAddress: () => true }))
vi.mock('../../conversations/coordinator/events', () => ({ conversationEvents: { message: vi.fn() } }))

import { createOfferLivePreviewTool, OFFER_LIVE_PREVIEW_TOOL } from '../offer'
import type { TurnCapability } from '../../conversations/contract'

const capability = {
  conversationId: 'c', turnId: 't', agentId: 'a', home: 'PROJECT', projectId: 'p', taskId: null, actingUserId: 'u',
  trigger: 'MESSAGE', role: 'MEMBER', permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
  expiresAt: Date.now() + 60_000,
} as unknown as TurnCapability

function tool(over: Partial<Parameters<typeof createOfferLivePreviewTool>[0]> = {}) {
  const card = vi.fn(async () => {})
  return {
    card,
    tool: createOfferLivePreviewTool({
      codeWorkspaces: async () => [{ id: 'ws-app', name: 'site-app', git: true }, { id: 'ws-docs', name: 'docs', git: false }],
      branchOfTask: async (_p, _w, key) => (key === 'WEB-3' ? { id: 'br', name: 'fix-sign-up' } : null),
      liveAppsHaveAddress: () => true,
      featureOn: async () => true,
      card,
      ...over,
    }),
  }
}

const run = (t: ReturnType<typeof tool>['tool'], args: unknown) => t.run(capability, args, { signal: new AbortController().signal })

withFeature('livePreview', () => {
describe(`${OFFER_LIVE_PREVIEW_TOOL} @SC-1708`, () => {
  it("leaves a card for a task's branch", async () => {
    const t = tool()
    expect(await run(t.tool, { workspaceId: 'ws-app', task: 'WEB-3', why: 'See it running' })).toMatchObject({ status: 'done' })
    expect(t.card).toHaveBeenCalledWith(capability, expect.objectContaining({
      toolName: OFFER_LIVE_PREVIEW_TOOL, target: { kind: 'livePreview', id: 'ws-app', label: 'site-app', params: { branchId: 'br', branch: 'fix-sign-up' } },
    }))
  })

  it('refuses a workspace without Git, and a task with no branch', async () => {
    const t = tool()
    expect(await run(t.tool, { workspaceId: 'ws-docs', why: 'x' })).toMatchObject({ status: 'refused' })
    expect(await run(t.tool, { workspaceId: 'ws-app', task: 'WEB-9', why: 'x' })).toMatchObject({ status: 'refused' })
    expect(t.card).not.toHaveBeenCalled()
  })

  it('is not offered without a code workspace, or without an address for live apps', async () => {
    expect(await tool({ codeWorkspaces: async () => [] }).tool.offered(capability)).toBe(false)
    expect(await tool({ liveAppsHaveAddress: () => false }).tool.offered(capability)).toBe(false)
    expect(await tool().tool.offered(capability)).toBe(true)
  })
})
})

describe(`${OFFER_LIVE_PREVIEW_TOOL} while the live preview's flag is off`, () => {
  it('is not offered, and leaves no card when called', async () => {
    const t = tool({ featureOn: async () => false })
    expect(await t.tool.offered(capability)).toBe(false)
    expect(await run(t.tool, { workspaceId: 'ws-app', why: 'See it running' })).toMatchObject({ status: 'refused' })
    expect(t.card).not.toHaveBeenCalled()
  })
})
