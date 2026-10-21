import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearOpenCodeTurn, containerForServerKey, forgetConversationSessions, forgetServer, recordOpenCodeSession,
  registerServerKey, resetOpenCodeTurnsForTests, resolveHarnessTurn, setOpenCodeTurn,
} from '../openCodeTurns'
import { harnessTurnHandler } from '../../../../server/harness/turnApi'

const turn = { conversationId: 'conv-a', conversationToken: 'tok-a', modelHeaders: { Authorization: 'Bearer k' } }

beforeEach(() => {
  resetOpenCodeTurnsForTests()
  registerServerKey('agent-1', 'key-1')
  registerServerKey('agent-2', 'key-2')
  recordOpenCodeSession('ses_a', { containerName: 'agent-1', conversationId: 'conv-a', connectionName: 'agxa' })
})

describe('the turn a plugin may read', () => {
  it('is the session\'s turn while one runs, and nothing between turns', () => {
    expect(resolveHarnessTurn('key-1', 'ses_a')).toBeNull()
    setOpenCodeTurn('ses_a', turn)
    expect(resolveHarnessTurn('key-1', 'ses_a')).toEqual(turn)
    clearOpenCodeTurn('ses_a', 'tok-a')
    expect(resolveHarnessTurn('key-1', 'ses_a')).toBeNull()
  })

  it('is never another container\'s, and never for an unknown key or session', () => {
    setOpenCodeTurn('ses_a', turn)
    expect(resolveHarnessTurn('key-2', 'ses_a')).toBeNull()
    expect(resolveHarnessTurn('nope', 'ses_a')).toBeNull()
    expect(resolveHarnessTurn('', 'ses_a')).toBeNull()
    expect(resolveHarnessTurn('key-1', 'ses_other')).toBeNull()
  })

  it('is not cleared by a late clear from an earlier turn', () => {
    setOpenCodeTurn('ses_a', turn)
    clearOpenCodeTurn('ses_a', 'tok-earlier')
    expect(resolveHarnessTurn('key-1', 'ses_a')).toEqual(turn)
  })

  it('ends with its server and with its conversation', () => {
    setOpenCodeTurn('ses_a', turn)
    forgetServer('agent-1')
    expect(containerForServerKey('key-1')).toBeNull()
    expect(resolveHarnessTurn('key-1', 'ses_a')).toBeNull()

    registerServerKey('agent-1', 'key-1b')
    setOpenCodeTurn('ses_a', turn)
    forgetConversationSessions('conv-a')
    expect(resolveHarnessTurn('key-1b', 'ses_a')).toBeNull()
    expect(() => setOpenCodeTurn('ses_a', turn)).toThrow(/did not record/)
  })
})

function call(headers: Record<string, string>, body: unknown) {
  const res = { statusCode: 200, body: undefined as unknown, setHeader: vi.fn(), status(c: number) { this.statusCode = c; return this }, json(b: unknown) { this.body = b; return this } }
  return Promise.resolve(harnessTurnHandler({ headers, body } as never, res as never)).then(() => res)
}

describe('POST /api/v1/harness/turn', () => {
  it('answers the turn to its own server\'s key', async () => {
    setOpenCodeTurn('ses_a', turn)
    const res = await call({ authorization: 'Bearer key-1' }, { sessionId: 'ses_a' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ turn })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('answers no turn to another server\'s key', async () => {
    setOpenCodeTurn('ses_a', turn)
    const res = await call({ authorization: 'Bearer key-2' }, { sessionId: 'ses_a' })
    expect(res.body).toEqual({ turn: null })
  })

  it('refuses a missing or unknown key, and a malformed request', async () => {
    expect((await call({}, { sessionId: 'ses_a' })).statusCode).toBe(401)
    expect((await call({ authorization: 'Bearer wrong' }, { sessionId: 'ses_a' })).statusCode).toBe(401)
    expect((await call({ authorization: 'key-1' }, { sessionId: 'ses_a' })).statusCode).toBe(401)
    expect((await call({ authorization: 'Bearer key-1' }, {})).statusCode).toBe(400)
  })
})
