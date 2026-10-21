import { describe, it, expect } from 'vitest'
import { issueRunToken, resolvePlatformToken, resolveRunToken, revokeRunToken } from '../runTokens'
import { clearConversationTurn, pointConversationToken, revokeConversationToken } from '../conversationTokens'

const holder = () => ({ jwt: 'jwt', expiresAt: Date.now() + 60_000 })

describe('platform tokens name the run they act for', () => {
  it('a run token issued with its run, the same holder instance', () => {
    const h = holder()
    const token = issueRunToken(h, 'run-1')
    expect(resolvePlatformToken(token)).toEqual({ holder: h, runId: 'run-1' })
    expect(resolvePlatformToken(token)?.holder).toBe(h)
    expect(resolveRunToken(token)).toBe(h)
    expect(resolvePlatformToken(issueRunToken(holder()))?.runId).toBeNull()
    revokeRunToken(token)
    expect(resolvePlatformToken(token)).toBeNull()
  })

  it('a conversation token the run of its current turn, and nothing between turns', () => {
    const h = holder()
    const token = pointConversationToken('conv-9', 'run-7', h)
    expect(resolvePlatformToken(token)).toEqual({ holder: h, runId: 'run-7' })
    clearConversationTurn('conv-9', 'run-7')
    expect(resolvePlatformToken(token)).toBeNull()
    revokeConversationToken('conv-9')
  })

  it('an expired run token resolves to nothing', () => {
    const token = issueRunToken({ jwt: 'jwt', expiresAt: Date.now() - 1 }, 'run-1')
    expect(resolvePlatformToken(token)).toBeNull()
  })
})
