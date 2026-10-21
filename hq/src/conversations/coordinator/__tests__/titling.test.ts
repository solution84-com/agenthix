import { describe, expect, it } from 'vitest'
import { titleFrom, titleRequest } from '../titling'

describe('naming a conversation', () => {
  it('asks the conversation\'s model, with what the person said and the reply, for a short name only', () => {
    const access = { provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'k', owner: 'user', kind: 'API_KEY' } as never
    const request = titleRequest({ access, ask: 'plan the launch', reply: 'Sure.', conversationId: 'c1', signal: new AbortController().signal })
    expect(request.access).toBe(access)
    expect(request.messages).toEqual([{ role: 'user', content: 'The person said: plan the launch\n\nThe reply: Sure.' }])
    expect(request.maxOutputTokens).toBeLessThanOrEqual(30)
  })

  it('takes the name from the first line of the answer, without quotes, markup or a label', () => {
    expect(titleFrom('"Planning the **launch**."')).toBe('Planning the launch')
    expect(titleFrom('Title: A quick hello\nmore')).toBe('A quick hello')
    expect(titleFrom('  \n')).toBeNull()
  })
})
