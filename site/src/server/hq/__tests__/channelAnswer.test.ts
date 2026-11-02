import { describe, it, expect, vi } from 'vitest'
import type { HQConnectionMessage } from '@agenthix/core'
import { answerChannelRequest } from '../channelAnswer'

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
