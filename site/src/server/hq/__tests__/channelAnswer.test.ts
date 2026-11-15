import { describe, it, expect, vi } from 'vitest'
import type { HQConnectionMessage } from '@agenthix/core'
import { answerChannelRequest } from '../channelAnswer'
import { currentSwitches, featureMethod } from '../../features/siteFeatures'

async function ask(method: string) {
  const sent: HQConnectionMessage[] = []
  const handler = vi.fn(async () => 'done')
  await answerChannelRequest(
    { version: '1.0', type: 'channel.request', siteId: 's1', requestId: 'r1', payload: { method } } as never,
    's1',
    reply => sent.push(reply),
    { real: handler },
  )
  return { sent, handler }
}

describe('answering a channel request', () => {
  it('runs a method the site has', async () => {
    const { sent, handler } = await ask('real')
    expect(handler).toHaveBeenCalled()
    expect(sent[0]).toMatchObject({ type: 'channel.response', payload: 'done' })
  })

  it.each(['__proto__', 'toString', 'constructor', 'hasOwnProperty'])('answers %s as an unknown method, not as a handler', async (name) => {
    const { sent, handler } = await ask(name)
    expect(handler).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'channel.error', payload: { code: 'unknown_method' } })
  })
})

describe('the switches hq sends with a request @SC-1775', () => {
  it("are the handler's current switches, read with core's parser", async () => {
    const sent: HQConnectionMessage[] = []
    let seen: unknown = null
    await answerChannelRequest(
      { version: '1.0', type: 'channel.request', siteId: 's1', requestId: 'r1', payload: { method: 'real', features: { usageBilling: true, nope: true } } } as never,
      's1',
      reply => sent.push(reply),
      { real: async () => { seen = currentSwitches(); return 'ok' } },
    )
    expect(seen).toEqual({ usageBilling: true })
    expect(sent[0]).toMatchObject({ type: 'channel.response', payload: 'ok' })
  })

  it("answer a flagged method that is off with an error saying so, its handler never run", async () => {
    const sent: HQConnectionMessage[] = []
    const handler = vi.fn(async () => 'done')
    await answerChannelRequest(
      { version: '1.0', type: 'channel.request', siteId: 's1', requestId: 'r1', payload: { method: 'flagged' } } as never,
      's1',
      reply => sent.push(reply),
      { flagged: featureMethod('usageBilling', handler) },
    )
    expect(handler).not.toHaveBeenCalled()
    expect(sent[0]).toMatchObject({ type: 'channel.error', payload: { message: expect.stringContaining('not available') } })
  })
})
