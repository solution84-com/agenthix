// @vitest-environment jsdom
/**
 * A task's approval card (every-screen-reviewed spec §9): a request replaced by something newer in its task
 * says so and offers neither Approve nor Deny. Rendered through the real lifted card.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// The lifted card lives in ui/, which resolves its own copy of React and of the
// icon library; two Reacts cannot share hooks, so ui's copies are pointed at
// this module's.
vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ getRunManifestStatus: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useAction: () => vi.fn(),
  approveManifest: 'approveManifest',
  rejectManifest: 'rejectManifest',
  getRunManifestStatus: h.getRunManifestStatus,
}))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <span>{content}</span> }))

import { ManifestApprovalComment } from '../ManifestApprovalComment'

const content = `__MANIFEST_APPROVAL__:${JSON.stringify({ runId: 'r1', summary: null, pendingManifest: { tools: [{ name: 'web_fetch' }], bashPatterns: [] } })}`

afterEach(cleanup)

describe("a task's approval card @SC-642", () => {
  it('shows a replaced request as replaced, with no Approve or Deny', async () => {
    h.getRunManifestStatus.mockResolvedValue({ manifestStatus: 'SUPERSEDED' })
    render(<ManifestApprovalComment content={content} sessionId="s1" />)

    expect(await screen.findByText('Replaced — something newer happened in this task')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reject|deny/i })).toBeNull()
  })

  it('offers Approve while the request still waits', async () => {
    h.getRunManifestStatus.mockResolvedValue({ manifestStatus: 'PENDING_APPROVAL' })
    render(<ManifestApprovalComment content={content} sessionId="s1" />)

    expect(await screen.findByRole('button', { name: /approve/i })).toBeTruthy()
  })
})
