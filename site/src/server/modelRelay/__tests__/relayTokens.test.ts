/** Relay tokens name a running turn and nothing else (spec §6, adr-0082). */
import { describe, it, expect, beforeEach } from 'vitest'
import { clearRelayTurn, isLiveRelayToken, issueRelayToken, pointRelayToken, resetRelayTokensForTests, resolveRelayToken, revokeRelayToken, trackRelayRequest, turnModelCredentials } from '../relayTokens'
import { resetGateRunsForTests, stopGateRun } from '../../../agents/runtime/toolGateRuns'

const openrouter = { kind: 'apiKey', provider: 'openrouter', apiKey: 'sk-or' } as const
const openai = { kind: 'apiKey', provider: 'openai', apiKey: 'sk-oai' } as const

beforeEach(() => {
  resetRelayTokensForTests()
  resetGateRunsForTests()
})

describe('a relay token @SC-1226', () => {
  it('names nothing until it is pointed at a turn, and each provider the turn may use while it runs', () => {
    const token = issueRelayToken('c1', 'conv-1')
    expect(resolveRelayToken(token)).toBeNull()
    pointRelayToken(token, 'run-1', [openrouter, openai])
    const turn = resolveRelayToken(token)!
    expect(turn).toMatchObject({ containerName: 'c1', conversationId: 'conv-1', runId: 'run-1' })
    expect([...turn.credentials.keys()]).toEqual(['openrouter', 'openai'])
    expect(turn.credentials.get('openai')).toEqual(openai)
  })

  it('names nothing between turns, and a late clear never takes a later turn', () => {
    const token = issueRelayToken('c1', 'conv-1')
    pointRelayToken(token, 'run-1', [openrouter])
    clearRelayTurn(token, 'run-1')
    expect(resolveRelayToken(token)).toBeNull()
    pointRelayToken(token, 'run-2', [openrouter])
    clearRelayTurn(token, 'run-1')
    expect(resolveRelayToken(token)?.runId).toBe('run-2')
  })

  it('names nothing once its run is stopped, before the turn has cleared it', () => {
    const token = issueRelayToken('c1', 'conv-1')
    pointRelayToken(token, 'run-1', [openrouter])
    stopGateRun('run-1')
    expect(resolveRelayToken(token)).toBeNull()
  })

  it('names nothing once revoked, and cannot be pointed again', () => {
    const token = issueRelayToken('c1', 'conv-1')
    expect(isLiveRelayToken(token)).toBe(true)
    pointRelayToken(token, 'run-1', [openrouter])
    revokeRelayToken(token)
    expect(isLiveRelayToken(token)).toBe(false)
    expect(resolveRelayToken(token)).toBeNull()
    expect(() => pointRelayToken(token, 'run-2', [openrouter])).toThrow()
  })

  it('is unguessable: an unknown or empty token names nothing', () => {
    expect(resolveRelayToken('')).toBeNull()
    expect(resolveRelayToken('not-a-token')).toBeNull()
    expect(issueRelayToken('c1', 'x')).not.toBe(issueRelayToken('c1', 'x'))
  })

  it('cuts off its requests still running when its turn ends, and not those of a request already done', () => {
    const token = issueRelayToken('c1', 'conv-1')
    pointRelayToken(token, 'run-1', [openrouter])
    const cut: string[] = []
    trackRelayRequest(token, () => cut.push('a'))
    const untrackB = trackRelayRequest(token, () => cut.push('b'))
    untrackB()
    clearRelayTurn(token, 'run-1')
    expect(cut).toEqual(['a'])
  })

  it("serves a turn's own API key and its fallbacks', never a subscription", () => {
    expect(turnModelCredentials({ credential: openrouter, fallbackCredentials: [openai] })).toEqual([openrouter, openai])
    expect(turnModelCredentials({ credential: { kind: 'subscription', provider: 'anthropic', oauthJson: '{}', grantId: 'grant-1', loginId: 'login-1' } })).toEqual([])
    expect(turnModelCredentials({ credential: null })).toEqual([])
  })
})
