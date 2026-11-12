import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BRANCH_WORK_METHODS, BUNDLE_METHODS, CLAUDE_LOGIN_METHODS, LIVE_PREVIEW_APP_METHODS, LIVE_PREVIEW_METHODS, MAIN_WORK_METHODS,
  SITE_PROTOCOL_VERSION,
} from '@agenthix/core'
import { answerChannelRequest } from '../channelAnswer'

vi.mock('../channelMethods', () => ({ channelMethods: {} }))
afterEach(() => vi.unstubAllEnvs())

const families = {
  'Sign in with Claude': [CLAUDE_LOGIN_METHODS.start, CLAUDE_LOGIN_METHODS.finish, CLAUDE_LOGIN_METHODS.cancel],
  'live previews': [LIVE_PREVIEW_METHODS.open, LIVE_PREVIEW_METHODS.act, LIVE_PREVIEW_APP_METHODS.start, BUNDLE_METHODS.make],
  'the branch commit helper': [BRANCH_WORK_METHODS.commit, BRANCH_WORK_METHODS.create, MAIN_WORK_METHODS.merge],
}

async function ask(method: string, handler: () => Promise<unknown>) {
  const sent: any[] = []
  await answerChannelRequest(
    { requestId: 'q1', version: SITE_PROTOCOL_VERSION, type: 'channel.request', payload: { method, params: {} } } as never,
    'site', m => sent.push(m), { [method]: handler },
  )
  return sent[0]
}

describe.each(Object.entries(families))('%s', (_name, methods) => {
  it.each(methods)('%s is refused in the demo and its handler never runs @SC-1990', async method => {
    vi.stubEnv('DEMO_MODE', 'true')
    const handler = vi.fn().mockResolvedValue({ ok: 1 })
    const reply = await ask(method, handler)
    expect(reply.type).toBe('channel.error')
    expect(reply.payload.code).toBe('demo_refused')
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(methods)('%s is answered as before with the setting off @SC-1992', async method => {
    const handler = vi.fn().mockResolvedValue({ ok: 1 })
    const reply = await ask(method, handler)
    expect(reply).toMatchObject({ type: 'channel.response', payload: { ok: 1 } })
    expect(handler).toHaveBeenCalledOnce()
  })
})
