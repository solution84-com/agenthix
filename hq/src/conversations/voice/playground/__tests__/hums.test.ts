/**
 * The listening read and its sounds in the voice playground (spec §The backchannel): the page's questions answered on
 * the model it picked, with no answer while voice is off; and a kind's sounds made with the steering the page changed.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import { ACCESS, scriptedModel, userText } from '../light/__tests__/fakes'
import { LIGHT_OFF } from '../light/payload'
import { PlaygroundHums, type HumsHost } from '../hums'
import type { PlaygroundLightConfig } from '../../../../shared/voicePlaygroundLight'

function rig(config: PlaygroundLightConfig = { ...LIGHT_OFF, on: true, humModel: 'p1/flash' }, model = scriptedModel([[/ankle/, 'sympathy gentle']])) {
  const out: [string, unknown][] = []
  const asked: (string | null)[] = []
  const made: unknown[] = []
  const host: HumsHost = {
    conversationId: 'pg', hq: (e, p) => out.push([e, p]), now: () => 0, log: () => undefined, config: () => config,
    async made() { return false },
    async sound(sound, steering) { made.push({ sound, steering }); return { audio: Buffer.from([1, 2]), made: 'new' } },
  }
  const hums = new PlaygroundHums(host, { model, access: async m => { asked.push(m); return ACCESS } })
  return { hums, out, asked, made, model }
}

const settle = () => new Promise(r => setTimeout(r, 0))

describe('the playground\'s listening read @SC-2228', () => {
  it('answers the page\'s question on the model it picked, as hq\'s own event', async () => {
    const { hums, out, asked } = rig()
    hums.voiceStarted()
    hums.ask({ conversationId: 'pg', seq: 2, text: 'she twisted her ankle' })
    await settle()
    expect(asked).toEqual(['p1/flash'])
    expect(out).toEqual([[VP.backchannelKind, { conversationId: 'pg', seq: 2, kind: 'sympathy', tone: 'gentle', ms: 0 }]])
  })

  it('tells the read a question was asked as a pause began, and its last sounds', async () => {
    const { hums, model } = rig(undefined, scriptedModel([[/paused/, 'continuer calm']]))
    hums.voiceStarted()
    hums.ask({ conversationId: 'pg', seq: 1, text: 'about 6 in the morning', atPause: true, recent: ['Mm.', 7, 'Right.'] })
    await settle()
    expect(userText(model.requests[0]!)).toBe('about 6 in the morning\n\nThey have just paused.\nYour recent sounds: Mm. Right.')
  })

  it('answers nothing while voice is off, nor a malformed question', async () => {
    const { hums, out } = rig()
    hums.ask({ seq: 1, text: 'hello' })
    hums.voiceStarted()
    hums.ask({ seq: 'x', text: 'hello' })
    await settle()
    expect(out).toEqual([])
  })

  it('makes a kind\'s sound in a tone with the steering the page changed, and sends its audio', async () => {
    const { hums, out, made } = rig({ ...LIGHT_OFF, on: true, humSteering: { gentle: '[quiet, sad]' } })
    hums.voiceStarted()
    hums.speak({ conversationId: 'pg', kind: 'sympathy', tone: 'gentle' })
    hums.speak({ conversationId: 'pg', kind: 'sympathy', tone: 'bright' })
    await settle()
    expect(made).toEqual([{ sound: { kind: 'sympathy', tone: 'gentle', words: 'Oh no.' }, steering: { gentle: '[quiet, sad]' } }])
    expect(out.at(-1)).toEqual([VP.backchannelSound, { conversationId: 'pg', kind: 'sympathy', tone: 'gentle', words: 'Oh no.', audio: Buffer.from([1, 2]), made: 'new' }])
  })
})
