import { describe, it, expect } from 'vitest'
import {
  clearConversationTurn,
  pointConversationToken,
  resolveConversationToken,
  revokeConversationToken,
  sweepExpiredConversationTurns,
} from '../conversationTokens'
import { issueRunToken, resolveRunToken, sweepExpiredRunTokens } from '../runTokens'

const holder = (jwt: string, ttlMs = 60_000) => ({ jwt, expiresAt: Date.now() + ttlMs })

describe('the per-conversation platform token (adr-0082)', () => {
  it('resolves to the current turn\'s capability during a turn', () => {
    const h1 = holder('cap-run-1')
    const token = pointConversationToken('conv-a', 'run-1', h1)
    expect(resolveConversationToken(token)).toEqual({ sessionId: 'conv-a', runId: 'run-1', holder: h1 })
    expect(resolveRunToken(token)).toBe(h1)
  })

  it('resolves to nothing between turns', () => {
    const token = pointConversationToken('conv-b', 'run-1', holder('cap'))
    clearConversationTurn('conv-b', 'run-1')
    expect(resolveConversationToken(token)).toBeNull()
    expect(resolveRunToken(token)).toBeNull()
  })

  it('is the same token on the next turn, re-pointed at that turn\'s capability', () => {
    const first = pointConversationToken('conv-c', 'run-1', holder('cap-1'))
    clearConversationTurn('conv-c', 'run-1')
    const h2 = holder('cap-2')
    const second = pointConversationToken('conv-c', 'run-2', h2)
    expect(second).toBe(first)
    expect(resolveConversationToken(second)).toEqual({ sessionId: 'conv-c', runId: 'run-2', holder: h2 })
  })

  it('follows the holder the renewal loop updates in place', () => {
    const h = holder('cap-old')
    const token = pointConversationToken('conv-d', 'run-1', h)
    h.jwt = 'cap-renewed'
    expect(resolveRunToken(token)?.jwt).toBe('cap-renewed')
  })

  it('keeps a later turn when an earlier run clears late', () => {
    const token = pointConversationToken('conv-e', 'run-1', holder('cap-1'))
    pointConversationToken('conv-e', 'run-2', holder('cap-2'))
    clearConversationTurn('conv-e', 'run-1')
    expect(resolveConversationToken(token)?.runId).toBe('run-2')
  })

  it('resolves to nothing once the conversation is revoked, and a new turn gets a new token', () => {
    const token = pointConversationToken('conv-f', 'run-1', holder('cap'))
    revokeConversationToken('conv-f')
    expect(resolveConversationToken(token)).toBeNull()
    expect(resolveRunToken(token)).toBeNull()
    const next = pointConversationToken('conv-f', 'run-2', holder('cap'))
    expect(next).not.toBe(token)
    expect(resolveConversationToken(token)).toBeNull()
  })

  it('resolves to nothing once the turn\'s capability expires, and the sweep clears it', () => {
    const token = pointConversationToken('conv-g', 'run-1', holder('cap', -1))
    expect(resolveConversationToken(token)).toBeNull()
    expect(sweepExpiredConversationTurns()).toBeGreaterThanOrEqual(1)
    pointConversationToken('conv-h', 'run-1', holder('cap', -1))
    expect(sweepExpiredRunTokens()).toBeGreaterThanOrEqual(1)
  })

  it('never resolves an unknown token, and keeps run tokens working', () => {
    expect(resolveConversationToken('nope')).toBeNull()
    const h = holder('run-cap')
    expect(resolveRunToken(issueRunToken(h))).toBe(h)
  })

  it('gives each conversation its own token', () => {
    const a = pointConversationToken('conv-i', 'run-1', holder('a'))
    const b = pointConversationToken('conv-j', 'run-2', holder('b'))
    expect(a).not.toBe(b)
    expect(resolveConversationToken(b)?.sessionId).toBe('conv-j')
  })
})
