import { describe, expect, it } from 'vitest'
import {
  HARNESS_GATE_PATH, HARNESS_GATE_UNAVAILABLE, HARNESS_SERVER_KEY_ENV, HARNESS_TURN_PATH, type OpenCodePluginConfig,
} from '@agenthix/core'
import { gateHook, headersHook, NO_TURN_FOR_COMMAND, shellEnvHook } from '../hooks'
import { siteClient } from '../site'
import { fakeSite, turnFor } from './helpers'

const config: OpenCodePluginConfig = {
  siteUrl: 'http://site.test',
  gateTimeoutMs: 200,
  turnTimeoutMs: 200,
  secretEnv: ['OPENCODE_CONFIG_CONTENT', 'ANTHROPIC_API_KEY'],
  commandEnv: { npm_config_offline: 'false', SITE_SESSION: 'forged' },
}

const call = (tool = 'read', sessionID = 'ses_A') => ({ tool, sessionID, callID: 'call_1' })

describe('the gate hook', () => {
  it('asks the site about the call with the conversation token, and lets an allowed call run unchanged', async () => {
    const site = fakeSite({ turns: { ses_A: turnFor('conv-a') } })
    const output = { args: { filePath: '/projects/p/a.txt' } }
    await gateHook(site)(call(), output)
    expect(site.decided).toEqual([{
      token: 'tok-conv-a',
      request: { sessionId: 'ses_A', callId: 'call_1', tool: 'read', args: { filePath: '/projects/p/a.txt' } },
    }])
    expect(output.args).toEqual({ filePath: '/projects/p/a.txt' })
  })

  it('throws the steering text itself for a refused call', async () => {
    const site = fakeSite({ turns: { ses_A: turnFor('conv-a') }, decide: () => ({ decision: 'refuse', message: 'Ask the person first.' }) })
    await expect(gateHook(site)(call('bash'), { args: { command: 'rm -rf /' } })).rejects.toThrow(/^Ask the person first\.$/)
  })

  it('replaces the arguments in place with the checked ones an allow carries', async () => {
    const site = fakeSite({
      turns: { ses_A: turnFor('conv-a') },
      decide: () => ({ decision: 'allow', args: { filePath: '/projects/p/real.txt' } }),
    })
    const args: Record<string, unknown> = { filePath: '/projects/p/link.txt', offset: 3 }
    const output = { args }
    await gateHook(site)(call(), output)
    expect(output.args).toBe(args)
    expect(args).toEqual({ filePath: '/projects/p/real.txt' })
  })

  it('refuses every call with no turn running, no site, or no answer', async () => {
    await expect(gateHook(fakeSite({}))(call(), { args: {} })).rejects.toThrow(HARNESS_GATE_UNAVAILABLE)
    await expect(gateHook(null)(call(), { args: {} })).rejects.toThrow(HARNESS_GATE_UNAVAILABLE)
    const hangs = siteClient(config, { [HARNESS_SERVER_KEY_ENV]: 'k' }, (url, init) =>
      url.endsWith(HARNESS_TURN_PATH)
        ? Promise.resolve(Response.json({ turn: turnFor('conv-a') }))
        : new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    const started = Date.now()
    await expect(gateHook(hangs)(call(), { args: {} })).rejects.toThrow(HARNESS_GATE_UNAVAILABLE)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('the site client', () => {
  it('fetches the turn with the server key and reads a malformed or failed answer as no turn', async () => {
    const seen: { url: string; auth: string | null; body: string }[] = []
    const answers = [Response.json({ turn: turnFor('conv-a') }), Response.json({ turn: { conversationId: 'x' } }), new Response('no', { status: 500 })]
    const client = siteClient(config, { [HARNESS_SERVER_KEY_ENV]: 'server-key' }, async (url, init) => {
      seen.push({ url, auth: new Headers(init.headers).get('authorization'), body: String(init.body) })
      return answers.shift() as Response
    })
    expect(await client.turn('ses_A')).toEqual(turnFor('conv-a'))
    expect(await client.turn('ses_A')).toBeNull()
    expect(await client.turn('ses_A')).toBeNull()
    expect(seen[0]).toEqual({ url: `http://site.test${HARNESS_TURN_PATH}`, auth: 'Bearer server-key', body: '{"sessionId":"ses_A"}' })
  })

  it('has no turn without the server key', async () => {
    const client = siteClient(config, {}, async () => Response.json({ turn: turnFor('conv-a') }))
    expect(await client.turn('ses_A')).toBeNull()
  })

  it('reads a failed or malformed decision as a refusal', async () => {
    const answers = [new Response('x', { status: 502 }), Response.json({ decision: 'maybe' }), Response.json({ decision: 'allow' })]
    const urls: string[] = []
    const client = siteClient(config, {}, async url => { urls.push(url); return answers.shift() as Response })
    const request = { sessionId: 's', callId: 'c', tool: 'read', args: {} }
    expect(await client.decide('t', request)).toEqual({ decision: 'refuse', message: HARNESS_GATE_UNAVAILABLE })
    expect(await client.decide('t', request)).toEqual({ decision: 'refuse', message: HARNESS_GATE_UNAVAILABLE })
    expect(await client.decide('t', request)).toEqual({ decision: 'allow' })
    expect(urls[0]).toBe(`http://site.test${HARNESS_GATE_PATH}`)
  })
})

describe('the command environment', () => {
  it('tags every command with its conversation, blanks the secrets and lets it read the staged skills', async () => {
    const env: Record<string, string> = {}
    await shellEnvHook(fakeSite({ turns: { ses_A: turnFor('conv-a') } }), config)({ cwd: '/p', sessionID: 'ses_A', callID: 'c' }, { env })
    expect(env).toEqual({
      SITE_SESSION: 'conv-a',
      SITE_COMMAND_READABLE: '/home/appuser/.claude/.tmp/conversation-conv-a/skills',
      OPENCODE_SERVER_PASSWORD: '',
      [HARNESS_SERVER_KEY_ENV]: '',
      OPENCODE_CONFIG_CONTENT: '',
      ANTHROPIC_API_KEY: '',
      npm_config_offline: 'false',
    })
  })

  it('refuses a command with no session, no turn or no configuration', async () => {
    const site = fakeSite({ turns: { ses_A: turnFor('conv-a') } })
    await expect(shellEnvHook(site, config)({ cwd: '/p' }, { env: {} })).rejects.toThrow(NO_TURN_FOR_COMMAND)
    await expect(shellEnvHook(site, config)({ cwd: '/p', sessionID: 'ses_B' }, { env: {} })).rejects.toThrow(NO_TURN_FOR_COMMAND)
    await expect(shellEnvHook(site, null)({ cwd: '/p', sessionID: 'ses_A' }, { env: {} })).rejects.toThrow(NO_TURN_FOR_COMMAND)
  })
})

describe('the model request headers', () => {
  it("puts each session's own turn key on its requests, and nothing between turns", async () => {
    const hook = headersHook(fakeSite({ turns: { ses_A: turnFor('conv-a'), ses_B: turnFor('conv-b') } }))
    const input = (sessionID: string) => ({ sessionID }) as Parameters<typeof hook>[0]
    const a = { headers: {} as Record<string, string> }
    const b = { headers: {} as Record<string, string> }
    const none = { headers: {} as Record<string, string> }
    await hook(input('ses_A'), a)
    await hook(input('ses_B'), b)
    await hook(input('ses_C'), none)
    expect(a.headers).toEqual({ Authorization: 'Bearer key-conv-a' })
    expect(b.headers).toEqual({ Authorization: 'Bearer key-conv-b' })
    expect(none.headers).toEqual({})
  })
})
