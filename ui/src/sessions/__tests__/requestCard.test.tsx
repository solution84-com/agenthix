import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { approvalItems } from '@agenthix/core'
import { RequestCard, requestOutcome } from '../RequestCard'
import { requestPhrase } from '../ManifestRequestCard'
import { ApprovalCard } from '../ApprovalCard'
import { ManifestApprovalBubble } from '../ManifestApprovalBubble'
import { formatTime } from '../SessionComponents'

afterEach(cleanup)

const AT = new Date(2026, 10, 5, 18, 31).toISOString()

describe('the one request card', () => {
  it('refuses Approve for a request that is out of date, with the reason, while Deny still works', () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()
    const why = "The skill's files have changed since this was asked. Nothing was changed."
    render(<RequestCard heading="Writer asks to switch on a skill" state={{ kind: 'waiting' }} answer={{ onApprove, onDeny, askWhy: false, approveRefusal: { reason: why, title: 'This request is out of date' } }} />)
    const approve = screen.getByRole('button', { name: 'Approve' })
    expect(approve.getAttribute('aria-disabled')).toBe('true')
    fireEvent.focus(approve)
    expect(screen.getByTestId('tooltip').textContent).toBe(why)
    fireEvent.click(approve)
    expect(onApprove).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'This request is out of date' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onDeny).toHaveBeenCalledWith(undefined)
  })

  it('asks in plain words with Approve and Deny, and a reason is optional', () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()
    render(<RequestCard heading="Writer asks to make a team" state={{ kind: 'waiting' }} answer={{ onApprove, onDeny, scope: 'Only this, once' }} />)
    expect(screen.getByText('Only this, once')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    fireEvent.change(screen.getByLabelText('Why you deny it'), { target: { value: 'Not now' } })
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onDeny).toHaveBeenCalledWith('Not now')
  })

  it('once answered, the buttons go and it says the outcome in place', () => {
    render(<RequestCard heading="Writer asked to make a team" state={{ kind: 'answered', approved: true, by: null, at: AT }} answer={{ onApprove: vi.fn(), onDeny: vi.fn() }} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByTestId('request-outcome').textContent).toBe(`✓ You approved it · ${formatTime(AT)}`)
  })

  it('names who else answered, and says denied', () => {
    expect(requestOutcome({ kind: 'answered', approved: false, by: 'Sam', at: null })).toBe('Sam denied it')
  })

  it('shows one who may not answer who will, without the buttons', () => {
    render(<RequestCard heading="Writer asks to make a team" state={{ kind: 'waiting' }} waitingFor="Waiting for someone who works here to answer" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Waiting for someone who works here to answer')).toBeTruthy()
  })
})

describe("a run's request in the card's words", () => {
  it('says what it asks without developer words', () => {
    const items = approvalItems({ tools: [{ name: 'web_fetch' }], bashPatterns: [{ pattern: 'npm run build' }] })
    expect(requestPhrase(items)).toMatch(/ and run one command$/)
  })

  it("on a task's page, Deny is the word, and the answer shows in place", async () => {
    const actions = { approveManifest: vi.fn(), rejectManifest: vi.fn().mockResolvedValue(undefined) }
    const pendingManifest = { tools: [{ name: 'web_fetch', reason: 'https://example.com' }], bashPatterns: [] }
    render(<ManifestApprovalBubble agentName="Writer" data={{ runId: 'r1', sessionId: 's1', summary: null, pendingManifest }} actions={actions} />)
    expect(screen.queryByText(/Reject|extended access/)).toBeNull()
    expect(screen.getByText(/^Writer asks to /)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    await waitFor(() => expect(screen.getByTestId('request-outcome').textContent).toMatch(/^✕ You denied it/))
    expect(actions.rejectManifest).toHaveBeenCalledWith({ runId: 'r1', sessionId: 's1', reason: 'Denied by the person' })
  })

  it('in the session, answered by someone else: their name and time, with no buttons', () => {
    const card = { answer: 'approved' as const, items: approvalItems({ tools: [{ name: 'web_fetch' }] }), decidedBy: 'Avery', decidedByYou: false, decidedAt: AT, reason: null, allowedFor: 'this_run' as const }
    render(<ApprovalCard card={card} agentName="Kernel" runId="r1" sessionId="s1" actions={{ approveManifest: vi.fn(), rejectManifest: vi.fn() }} />)
    expect(screen.getByText(/^Kernel asked to /)).toBeTruthy()
    expect(screen.getByTestId('request-outcome').textContent).toBe(`✓ Avery approved it · ${formatTime(AT)}`)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })
})
