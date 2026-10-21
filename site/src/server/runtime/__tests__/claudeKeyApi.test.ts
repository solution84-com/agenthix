import { describe, it, expect, vi } from 'vitest'
import { claudeKeyHandler } from '../claudeKeyApi'
import { issueClaudeKeyTicket } from '../claudeKeyTickets'

function call(authorization?: string) {
  const res = { status: vi.fn(), type: vi.fn(), send: vi.fn(), set: vi.fn() }
  res.status.mockReturnValue(res); res.type.mockReturnValue(res); res.set.mockReturnValue(res)
  claudeKeyHandler({ headers: authorization ? { authorization } : {} } as never, res as never)
  return res
}

describe('POST /api/v1/harness/claude-key', () => {
  it('answers the key as text for its ticket, once', () => {
    const ticket = issueClaudeKeyTicket('sk-live')
    const first = call(`Bearer ${ticket}`)
    expect(first.status).toHaveBeenCalledWith(200)
    expect(first.send).toHaveBeenCalledWith('sk-live\n')
    expect(first.set).toHaveBeenCalledWith('Cache-Control', 'no-store')

    const second = call(`Bearer ${ticket}`)
    expect(second.status).toHaveBeenCalledWith(401)
    expect(second.send).not.toHaveBeenCalledWith('sk-live\n')
  })

  it('refuses a request with no ticket or another scheme', () => {
    expect(call().status).toHaveBeenCalledWith(401)
    expect(call('Basic abc').status).toHaveBeenCalledWith(401)
  })
})
