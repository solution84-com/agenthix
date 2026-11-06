import { describe, expect, it, vi } from 'vitest'
import { HttpError } from 'wasp/server'
import { COULD_NOT_READ, createListen, listenParts, NOT_AN_ANSWER, type ListenDeps } from '../listen'

const ref = { id: 'c1', home: 'PERSON' as const, projectId: null, taskId: null, openedById: 'u1', agentId: 'a1' }
const voice = { apiKey: 'k', voiceId: 'v', model: 'm', providerId: 'p1' }

function deps(over: Partial<ListenDeps> = {}): ListenDeps {
  return {
    reader: vi.fn(async () => ref),
    answer: vi.fn(async () => ({ text: '## Found\n\nTwo links are broken. One points to the old site.', agentId: 'a1' })),
    voice: vi.fn(async () => ({ voice })),
    synthesize: vi.fn(async () => Buffer.from('RIFFsound')),
    spent: vi.fn(),
    failed: vi.fn(),
    ...over,
  }
}

describe('the parts an answer is read aloud in', () => {
  it('reads the words without their markup, skipping code and tables', () => {
    expect(listenParts('# What I found\n\nThe **footer** has [two](https://x) broken links.\n\n```bash\nnpm run x\n```\n\n| a | b |\n|---|---|\n\nFixed.'))
      .toEqual(['What I found The footer has two broken links. Fixed.'])
  })

  it('cuts a long answer at whole sentences, and a sentence longer than a part at its words', () => {
    const parts = listenParts('One two three. Four five six. Seven.', 16)
    expect(parts).toEqual(['One two three.', 'Four five six.', 'Seven.'])
    expect(listenParts('alpha beta gamma delta', 11)).toEqual(['alpha beta', 'gamma delta'])
  })

  it('has nothing to read in an answer that is only code', () => {
    expect(listenParts('```\nx\n```')).toEqual([])
  })
})

describe('reading an answer aloud', () => {
  it('shows the speaker only where text to speech works for the agent', async () => {
    expect(await createListen(deps()).available('c1', 'u1')).toEqual({ available: true })
    expect(await createListen(deps({ voice: vi.fn(async () => ({ reason: 'Voice is down.' })) })).available('c1', 'u1')).toEqual({ available: false })
    expect(await createListen(deps({ reader: vi.fn(async () => ({ ...ref, agentId: null })) })).available('c1', 'u1')).toEqual({ available: false })
  })

  it('reads a part in the agent\'s voice, and puts its characters on the ledger', async () => {
    const d = deps()
    const result = await createListen(d).speak({ conversationId: 'c1', messageId: 'm1', part: 0 }, 'u1')
    expect(result).toEqual({ audio: Buffer.from('RIFFsound').toString('base64'), parts: 1 })
    expect(d.synthesize).toHaveBeenCalledWith('Found Two links are broken. One points to the old site.', voice)
    expect(d.spent).toHaveBeenCalledWith(voice, 'Found Two links are broken. One points to the old site.'.length, 'c1')
  })

  it('refuses a message that is not an answer in the conversation, or a part it does not have', async () => {
    const none = createListen(deps({ answer: vi.fn(async () => null) }))
    await expect(none.speak({ conversationId: 'c1', messageId: 'm9', part: 0 }, 'u1')).rejects.toMatchObject({ statusCode: 404, message: NOT_AN_ANSWER })
    await expect(createListen(deps()).speak({ conversationId: 'c1', messageId: 'm1', part: 3 }, 'u1')).rejects.toBeInstanceOf(HttpError)
  })

  it('says why when voice is not there, and when the provider fails', async () => {
    const down = createListen(deps({ voice: vi.fn(async () => ({ reason: 'Voice is down: text to speech isn\'t working.' })) }))
    await expect(down.speak({ conversationId: 'c1', messageId: 'm1', part: 0 }, 'u1')).rejects.toMatchObject({ statusCode: 503 })
    const d = deps({ synthesize: vi.fn(async () => { throw new Error('Inworld TTS failed: 401') }) })
    await expect(createListen(d).speak({ conversationId: 'c1', messageId: 'm1', part: 0 }, 'u1')).rejects.toMatchObject({ statusCode: 502, message: COULD_NOT_READ })
    expect(d.failed).toHaveBeenCalledWith(voice, 'Inworld TTS failed: 401')
    expect(d.spent).not.toHaveBeenCalled()
  })
})
