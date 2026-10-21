import { describe, it, expect } from 'vitest'
import {
  HARNESS_GATE_UNAVAILABLE,
  parseHarnessGateRequest,
  parseHarnessGateResponse,
  parseHarnessTurnRequest,
  parseHarnessTurnResponse,
  parseOpenCodePluginConfig,
} from '../openCodePlugin.js'

describe('the gate call', () => {
  const request = { sessionId: 'ses_1', callId: 'call-9', tool: 'convA_create_task', args: { title: 't', nested: { a: [1] } } }

  it('takes a well-formed request, arguments whole', () => {
    expect(parseHarnessGateRequest(request)).toEqual(request)
  })

  it.each([
    null, 'x', [], {},
    { ...request, sessionId: '' },
    { ...request, callId: 5 },
    { ...request, tool: undefined },
    { ...request, args: 'command' },
    { ...request, args: ['a'] },
  ])('refuses the request %j', (v) => {
    expect(parseHarnessGateRequest(v)).toBeNull()
  })

  it('reads allow and refuse, and anything else as a refusal', () => {
    expect(parseHarnessGateResponse({ decision: 'allow' })).toEqual({ decision: 'allow' })
    expect(parseHarnessGateResponse({ decision: 'refuse', message: 'No.' })).toEqual({ decision: 'refuse', message: 'No.' })
    for (const v of [null, {}, { decision: 'ALLOW' }, { decision: 'refuse' }, { decision: 'refuse', message: '' }, 'allow', { allow: true }]) {
      expect(parseHarnessGateResponse(v)).toEqual({ decision: 'refuse', message: HARNESS_GATE_UNAVAILABLE })
    }
  })

  it('reads an allow carrying the checked arguments, and a malformed one as a refusal', () => {
    const args = { filePath: '/projects/p1/files/real.ts', nested: { a: [1] } }
    expect(parseHarnessGateResponse({ decision: 'allow', args })).toEqual({ decision: 'allow', args })
    for (const bad of [null, 'x', ['a'], 5]) {
      expect(parseHarnessGateResponse({ decision: 'allow', args: bad })).toEqual({ decision: 'refuse', message: HARNESS_GATE_UNAVAILABLE })
    }
  })
})

describe('the turn call', () => {
  const turn = { conversationId: 'cm1', conversationToken: 'tok', modelHeaders: { Authorization: 'Bearer k' } }

  it('takes a request and a turn', () => {
    expect(parseHarnessTurnRequest({ sessionId: 'ses_1' })).toEqual({ sessionId: 'ses_1' })
    expect(parseHarnessTurnRequest({ sessionId: '' })).toBeNull()
    expect(parseHarnessTurnResponse({ turn })).toEqual({ turn })
    expect(parseHarnessTurnResponse({ turn: { ...turn, modelHeaders: {} } })).toEqual({ turn: { ...turn, modelHeaders: {} } })
  })

  it('reads no turn, and anything malformed, as no turn', () => {
    for (const v of [{ turn: null }, null, {}, { turn: { ...turn, conversationToken: '' } }, { turn: { ...turn, modelHeaders: { a: 1 } } }]) {
      expect(parseHarnessTurnResponse(v)).toEqual({ turn: null })
    }
  })
})

describe('the plugin configuration', () => {
  const config = {
    siteUrl: 'http://host.docker.internal:4201',
    gateTimeoutMs: 120000,
    turnTimeoutMs: 10000,
    secretEnv: ['OPENCODE_SERVER_PASSWORD', 'SITE_HARNESS_KEY'],
    commandEnv: { npm_config_offline: 'false' },
  }

  it('reads a well-formed configuration', () => {
    expect(parseOpenCodePluginConfig(JSON.stringify(config))).toEqual(config)
  })

  it.each([
    undefined, '', 'not json', '[]',
    JSON.stringify({ ...config, siteUrl: 'http://host/' }),
    JSON.stringify({ ...config, siteUrl: 'file:///x' }),
    JSON.stringify({ ...config, gateTimeoutMs: 0 }),
    JSON.stringify({ ...config, turnTimeoutMs: 1.5 }),
    JSON.stringify({ ...config, secretEnv: 'X' }),
    JSON.stringify({ ...config, commandEnv: { a: false } }),
  ])('refuses %j', (json) => {
    expect(parseOpenCodePluginConfig(json)).toBeNull()
  })
})
