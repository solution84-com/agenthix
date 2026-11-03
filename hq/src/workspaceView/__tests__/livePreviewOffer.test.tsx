// @vitest-environment jsdom
import { withFeature } from '@agenthix/core/testing'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
vi.mock('wasp/client/operations', async () => {
  const { featuresAnswer } = await import('../../test/featuresAnswer')
  return {
    useAction: (name: string) => (actions[name] ??= vi.fn()),
    useQuery: (name: string) => ({ data: name === 'getFeatures' ? featuresAnswer() : undefined }),
    startLivePreview: 'startLivePreview', getFeatures: 'getFeatures',
  }
})

import { LivePreviewOffer, livePreviewOfferOf } from '../components/LivePreviewOffer'

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.pathname}{l.search}</div>
}

beforeEach(() => { for (const k of Object.keys(actions)) delete actions[k] })
afterEach(cleanup)

const body = { text: 'See the new login page running', toolName: 'offer_live_preview', target: { kind: 'livePreview', id: 'w1', label: 'shop-app', params: { branchId: 'b1', branch: 'login-page' } } }

withFeature('livePreview', () => {
describe("the lead's live preview offer @SC-1708", () => {
  it('reads the card from the message, and nothing from another', () => {
    expect(livePreviewOfferOf(body)).toEqual({ text: body.text, workspaceId: 'w1', workspaceName: 'shop-app', branchId: 'b1', branch: 'login-page' })
    expect(livePreviewOfferOf({ ...body, target: { ...body.target, params: {} } })).toMatchObject({ branchId: null, branch: null })
    expect(livePreviewOfferOf({ ...body, toolName: 'offer_new_conversation' })).toBeNull()
    expect(livePreviewOfferOf({ text: 'x', toolName: 'offer_live_preview' })).toBeNull()
  })

  it('starts the live preview, then opens the workspace view on that branch’s Live preview', async () => {
    actions.startLivePreview = vi.fn().mockResolvedValue({ livePreviewId: 'lp1' })
    render(
      <MemoryRouter initialEntries={['/c']}>
        <Routes><Route path="*" element={<><LivePreviewOffer card={livePreviewOfferOf(body)!} /><Where /></>} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(/Live preview ·/).textContent).toContain('login-page')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Live preview/ })) })
    expect(actions.startLivePreview).toHaveBeenCalledWith({ workspaceId: 'w1', branchId: 'b1' })
    expect(screen.getByTestId('where').textContent).toBe('/workspaces/w1/view?branch=login-page&section=preview')
  })

  it("shows HQ's refusal and stays", async () => {
    actions.startLivePreview = vi.fn().mockRejectedValue(new Error('Live previews are off on preview-box. A fleet admin turns them on in the Fleet Console. Nothing was changed.'))
    render(<MemoryRouter><LivePreviewOffer card={livePreviewOfferOf(body)!} /></MemoryRouter>)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Live preview/ })) })
    expect(screen.getByRole('alert').textContent).toMatch(/Nothing was changed\./)
  })
})
})

describe("the lead's live preview offer while its flag is off @SC-1773", () => {
  it('is not drawn, so nothing can start one from it', () => {
    render(<MemoryRouter><LivePreviewOffer card={livePreviewOfferOf(body)!} /></MemoryRouter>)
    expect(screen.queryByTestId('live-preview-offer')).toBeNull()
    expect(screen.queryByRole('button', { name: /Live preview/ })).toBeNull()
  })
})
