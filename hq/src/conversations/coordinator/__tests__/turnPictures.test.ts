/**
 * The pictures a turn gives its model (conversation's design, *Photos and files*): best effort, the files always named
 * in the words. A model known to read text only gets none and the message says so; one that takes images, or one
 * nobody knows, gets the newest; a provider's refusal sends the step again without them, and the message says so.
 */
import { describe, it, expect, vi } from 'vitest'
import { ModelCallError, type LeadMessage } from '../../contract'
import { runTurn } from '../turn'
import { turnPictures, type PictureSource } from '../turnPictures'
import { claimed, harness, scriptedModel, usage } from './turnHarness'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])
const NOT_AN_IMAGE = new TextEncoder().encode('just words')
const shotMessage = (messageId = 'm1', name = 'shot.png'): LeadMessage => ({
  role: 'user', content: `see this\n\n[Shared with this message, in the place's files: files/Shared in conversations/${name} (a picture)]`,
  shared: [{ messageId, name, kind: 'image' }],
})

function source(files: Record<string, Uint8Array> = { 'shot.png': PNG }) {
  const unseen: { ids: readonly string[]; label: string }[] = []
  const s: PictureSource = {
    read: vi.fn(async (name: string) => { const f = files[name]; if (!f) throw new Error('gone'); return f }),
    unseen: vi.fn(async (ids, label) => { unseen.push({ ids, label }) }),
  }
  return { s, unseen }
}

const words = (reply: string) => [{ type: 'text' as const, text: reply }, { type: 'finish' as const, reason: 'stop' as const, usage: usage(1) }]

describe('the pictures a turn gives its model', () => {
  it('gives a model that takes images the picture beside the words, read back and checked by its bytes', async () => {
    const { s, unseen } = source()
    const messages = [shotMessage()]
    await turnPictures({ takes: true, modelLabel: 'DeepSeek Flash', inputIds: ['m1'], source: s }).give(messages)
    expect(messages[0]).toMatchObject({ images: [{ mediaType: 'image/png', data: PNG }] })
    expect(unseen).toEqual([])
  })

  it('gives a model nobody knows the picture too: the provider decides', async () => {
    const { s } = source()
    const messages = [shotMessage()]
    await turnPictures({ takes: null, modelLabel: 'stand-in', inputIds: ['m1'], source: s }).give(messages)
    expect(messages[0]).toHaveProperty('images')
  })

  it('gives a model known to read text only no picture, and marks the message this turn answers with its name', async () => {
    const { s, unseen } = source()
    const messages = [shotMessage('old'), shotMessage()]
    await turnPictures({ takes: false, modelLabel: 'DeepSeek Pro', inputIds: ['m1'], source: s }).give(messages)
    expect(messages.some(m => 'images' in m)).toBe(false)
    expect(s.read).not.toHaveBeenCalled()
    expect(unseen).toEqual([{ ids: ['m1'], label: 'DeepSeek Pro' }])
  })

  it('leaves out a file that is gone or whose bytes are not a picture, keeping its name in the words', async () => {
    const { s } = source({ 'fake.png': NOT_AN_IMAGE })
    const messages = [shotMessage('m1', 'fake.png'), shotMessage('m2', 'gone.png')]
    await turnPictures({ takes: true, modelLabel: 'x', inputIds: ['m1', 'm2'], source: s }).give(messages)
    expect(messages.some(m => 'images' in m)).toBe(false)
    expect((messages[0] as { content: string }).content).toContain('files/Shared in conversations/fake.png')
  })

  it('gives at most the newest few', async () => {
    const files = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`s${i}.png`, PNG]))
    const { s } = source(files)
    const messages = Array.from({ length: 6 }, (_, i) => shotMessage(`m${i}`, `s${i}.png`))
    await turnPictures({ takes: true, modelLabel: 'x', inputIds: ['m5'], source: s, max: 2 }).give(messages)
    expect(messages.map(m => 'images' in m)).toEqual([false, false, false, false, true, true])
  })
})

describe('a turn whose provider refuses the pictures @SC-947', () => {
  it('sends the step again without them, answers, and marks the message as not seen by the model', async () => {
    const model = scriptedModel([
      async function* () { throw new ModelCallError('invalid', 'refused') },
      words('I have the file.'),
    ])
    const h = harness(model)
    vi.mocked(h.deps.context).mockResolvedValue({ system: [{ text: 'base' }], messages: [shotMessage()] })
    const { s, unseen } = source()
    h.deps.pictures = () => turnPictures({ takes: null, modelLabel: 'stand-in', inputIds: ['m1'], source: s })

    const outcome = await runTurn(h.deps, h.run(claimed()).running)

    expect(outcome.state).toBe('COMPLETED')
    expect(model.requests[0].messages[0]).toHaveProperty('images')
    expect(model.requests[1].messages[0]).not.toHaveProperty('images')
    expect((model.requests[1].messages[0] as { content: string }).content).toContain('files/Shared in conversations/shot.png')
    expect(unseen).toEqual([{ ids: ['m1'], label: 'stand-in' }])
    expect(h.stored.at(-1)).toMatchObject({ kind: 'TEXT', body: { text: 'I have the file.' } })
  })

  it('fails as before when the request carried no picture', async () => {
    const model = scriptedModel([async function* () { throw new ModelCallError('invalid', 'The model endpoint did not accept the request.') }])
    const h = harness(model)
    const { s } = source()
    h.deps.pictures = () => turnPictures({ takes: null, modelLabel: 'stand-in', inputIds: ['m1'], source: s })
    const outcome = await runTurn(h.deps, h.run(claimed()).running)
    expect(outcome.state).toBe('FAILED')
    expect(model.requests).toHaveLength(1)
  })
})
