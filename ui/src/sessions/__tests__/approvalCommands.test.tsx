import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { approvalItems } from '@agenthix/core'
import { ApprovalCard } from '../ApprovalCard'
import { ManifestApprovalBubble } from '../ManifestApprovalBubble'
import { ManifestApprovalComment } from '../ManifestApprovalComment'

afterEach(cleanup)

const LONG = `cd packages/sdk && npm install sdk@0.9.2 && npm run build -- --filter ${'x'.repeat(200)} && echo done`
const pendingManifest = { tools: [{ name: 'web_fetch', reason: 'https://example.com' }], bashPatterns: [{ pattern: LONG }, { pattern: 'make test' }] }
const actions = { approveManifest: vi.fn(), rejectManifest: vi.fn() }
const noTruncation = (el: HTMLElement) => expect(el.className).not.toMatch(/truncate/)

describe('every view of a waiting request shows each whole command it would approve', () => {
  it('the task comment view shows the commands, not their first words', () => {
    const content = `__MANIFEST_APPROVAL__:${JSON.stringify({ runId: 'r1', summary: null, pendingManifest })}`
    render(<ManifestApprovalComment content={content} sessionId="s1" queries={{ getRunManifestStatus: async () => null }} actions={actions} />)
    noTruncation(screen.getByText(LONG))
    expect(screen.getByText('make test')).toBeTruthy()
    expect(screen.queryByText(/Bash prefixes/)).toBeNull()
  })

  it('the waiting view shows the whole command, never cut with an ellipsis', () => {
    render(<ManifestApprovalBubble data={{ runId: 'r1', sessionId: 's1', summary: null, pendingManifest }} actions={actions} />)
    noTruncation(screen.getByText(LONG))
    expect(screen.queryByText(/Bash prefixes/)).toBeNull()
  })

  it('the conversation card lists every item while it waits, none folded behind "more"', () => {
    const request = { tools: [{ name: 'web_fetch' }, { name: 'write_file' }], bashPatterns: [{ pattern: LONG }] }
    const card = { answer: 'waiting' as const, items: approvalItems(request), decidedBy: null, decidedByYou: false, decidedAt: null, reason: null, allowedFor: 'this_run' as const }
    render(<ApprovalCard card={card} agentName="Kernel" runId="r1" sessionId="s1" actions={actions} />)
    expect(screen.getByText(LONG)).toBeTruthy()
    expect(screen.queryByText(/more/)).toBeNull()
    expect(screen.getByText(/exactly as shown/)).toBeTruthy()
  })
})
