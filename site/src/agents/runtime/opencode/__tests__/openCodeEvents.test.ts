import { describe, it, expect } from 'vitest'
import { openCodeEventSession, parseOpenCodeEvent } from '../openCodeEvents'

// Recorded from OpenCode 1.18.32 in the phase 3 runs.
const pendingTool = {
  id: 'evt_0eab3a0e0001RzL5PcRkuJ7eBx',
  type: 'message.part.updated',
  properties: {
    sessionID: 'ses_f154c6176ffeGXot3HUvKlW3b8',
    part: {
      id: 'prt_0eab3a0e0001mItpHvnD0vEz6E', messageID: 'msg_0eab3a0d6001CFC2PZCkCFlPsj', sessionID: 'ses_f154c6176ffeGXot3HUvKlW3b8',
      type: 'tool', tool: 'bash', callID: 'call_2_0', state: { status: 'pending', input: {}, raw: '' },
    },
    time: 1790644035808,
  },
}
const delta = {
  id: 'evt_0eab3a081001l5b1SjNgDJVF3n',
  type: 'message.part.delta',
  properties: { sessionID: 'ses_f154c618affe3IszkCShB1NfsL', messageID: 'msg_0eab39fc1001ZiViwDMj48Sz4b', partID: 'prt_0eab3a08000139fWrB0v6wHMXI', field: 'text', delta: 'OK' },
}
const stepFinish = {
  id: 'evt_0eab3a084001w0HObAm9BCFSCq',
  type: 'message.part.updated',
  properties: {
    sessionID: 'ses_f154c618affe3IszkCShB1NfsL',
    part: {
      id: 'prt_0eab3a084001n44zZc42e4vwbV', reason: 'stop', messageID: 'msg_0eab39fc1001ZiViwDMj48Sz4b', sessionID: 'ses_f154c618affe3IszkCShB1NfsL',
      type: 'step-finish', tokens: { total: 15, input: 10, output: 5, reasoning: 0, cache: { write: 0, read: 0 } }, cost: 0,
    },
    time: 1790644035716,
  },
}
const idle = { id: 'evt_0eab3a088002C6bkNQCbd7ofFi', type: 'session.idle', properties: { sessionID: 'ses_f154c618affe3IszkCShB1NfsL' } }
const retry = { id: 'e', type: 'session.status', properties: { sessionID: 's', status: { type: 'retry', attempt: 1, message: 'rate limited', next: 1790647082000 } } }
const rateLimited = {
  id: 'e', type: 'session.error',
  properties: { sessionID: 's', error: { name: 'APIError', data: { message: 'temporarily rate-limited', statusCode: 429, isRetryable: true } } },
}

describe('parseOpenCodeEvent', () => {
  it.each([
    ['a pending tool part', pendingTool],
    ['a text delta', delta],
    ['a step-finish part', stepFinish],
    ['session.idle', idle],
    ['a retry status', retry],
    ['a rate-limit error', rateLimited],
    ['an instance disposal', { id: 'e', type: 'server.instance.disposed', properties: { directory: '/projects/p1' } }],
    ['a message', { id: 'e', type: 'message.updated', properties: { sessionID: 's', info: { id: 'm', sessionID: 's', role: 'assistant', modelID: 'qwen/qwen3.8-27b:free' } } }],
  ])('keeps %s', (_name, e) => {
    expect(parseOpenCodeEvent(e)).toBe(e)
  })

  it.each([
    ['plugin.added', { id: 'e', type: 'plugin.added', properties: { id: 'core/config-reference' } }],
    ['session.diff', { id: 'e', type: 'session.diff', properties: { sessionID: 's' } }],
    ['a step-start part', { id: 'e', type: 'message.part.updated', properties: { sessionID: 's', part: { id: 'p', sessionID: 's', messageID: 'm', type: 'step-start' } } }],
    ['a tool part with no call id', { ...pendingTool, properties: { ...pendingTool.properties, part: { ...pendingTool.properties.part, callID: undefined } } }],
    ['an unknown tool status', { ...pendingTool, properties: { ...pendingTool.properties, part: { ...pendingTool.properties.part, state: { status: 'queued', input: {} } } } }],
    ['a status of an unknown type', { ...retry, properties: { sessionID: 's', status: { type: 'paused' } } }],
    ['no properties', { id: 'e', type: 'session.idle' }],
    ['not an object', 'session.idle'],
  ])('drops %s', (_name, e) => {
    expect(parseOpenCodeEvent(e)).toBeNull()
  })

  it('names the session an event concerns', () => {
    expect(openCodeEventSession(parseOpenCodeEvent(pendingTool)!)).toBe('ses_f154c6176ffeGXot3HUvKlW3b8')
    expect(openCodeEventSession(parseOpenCodeEvent({ id: 'e', type: 'session.error', properties: {} })!)).toBeNull()
    expect(openCodeEventSession(parseOpenCodeEvent({ id: 'e', type: 'server.instance.disposed', properties: {} })!)).toBeNull()
  })
})
