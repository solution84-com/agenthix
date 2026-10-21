import { describe, it, expect } from 'vitest'
import {
  CLAUDE_KEY_TICKET_TTL_MS, issueClaudeKeyTicket, redeemClaudeKeyTicket, revokeClaudeKeyTicket, sweepExpiredClaudeKeyTickets,
} from '../claudeKeyTickets'

describe('a claude process key ticket', () => {
  it('answers the key once', () => {
    const ticket = issueClaudeKeyTicket('sk-1')
    expect(ticket).not.toContain('sk-1')
    expect(redeemClaudeKeyTicket(ticket)).toBe('sk-1')
    expect(redeemClaudeKeyTicket(ticket)).toBeNull()
  })

  it('answers nothing after its deadline, or once revoked, or for an unknown ticket', () => {
    const t0 = 1_000_000
    const late = issueClaudeKeyTicket('sk-2', t0)
    expect(redeemClaudeKeyTicket(late, t0 + CLAUDE_KEY_TICKET_TTL_MS)).toBeNull()

    const revoked = issueClaudeKeyTicket('sk-3')
    revokeClaudeKeyTicket(revoked)
    expect(redeemClaudeKeyTicket(revoked)).toBeNull()

    expect(redeemClaudeKeyTicket('nope')).toBeNull()
  })

  it('is swept once expired and unused', () => {
    const t0 = 2_000_000
    const ticket = issueClaudeKeyTicket('sk-4', t0)
    expect(sweepExpiredClaudeKeyTickets(t0 + CLAUDE_KEY_TICKET_TTL_MS)).toBeGreaterThanOrEqual(1)
    expect(redeemClaudeKeyTicket(ticket, t0)).toBeNull()
  })
})
