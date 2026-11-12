/**
 * Demo mode reaches no voice vendor (live demo spec, *Voice is in, as a demo voice*; S2): not the speech token, not
 * synthesis, not the voice list. With the setting off nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDemoModeForTests } from '../../demo/demoMode'
import { mintSpeechToken } from '../speechMint'
import { InworldTtsAdapter } from '../inworldAdapter'

vi.mock('ws')
const { streamWithTimestamps } = vi.hoisted(() => ({ streamWithTimestamps: vi.fn() }))
vi.mock('@inworld/tts', () => ({ InworldTTS: () => ({ streamWithTimestamps }) }))

const access = { providerId: 'p-demo', providerName: 'Inworld', vendor: 'inworld', model: 'inworld/inworld-stt-1', apiKey: 'fake-demo-key' }
const config = { apiKey: 'fake-demo-key', voiceId: 'Clive', model: 'inworld-tts-1.5-mini' }
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(ok({ audioContent: Buffer.from('x').toString('base64'), voices: [], accessToken: 't', expireTime: '2030-01-01T00:00:00Z' }))
  vi.stubGlobal('fetch', fetchMock)
  streamWithTimestamps.mockReset()
})
afterEach(() => { setDemoModeForTests(null); vi.unstubAllGlobals() })

describe('demo mode: no voice vendor @SC-1965', () => {
  beforeEach(() => setDemoModeForTests(true))

  it('mints no listening token', async () => {
    const got = await mintSpeechToken(access)
    expect(got).toMatchObject({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('synthesises nothing, whole or streamed', async () => {
    const adapter = new InworldTtsAdapter()
    await expect(adapter.synthesize('Hello', config)).rejects.toThrow(/demo/i)
    const drain = async () => { for await (const _ of adapter.synthesizeStream('Hello', config)) void _ }
    await expect(drain()).rejects.toThrow(/demo/i)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(streamWithTimestamps).not.toHaveBeenCalled()
  })

  it('lists no voices', async () => {
    await expect(new InworldTtsAdapter().listVoices('fake-demo-key')).rejects.toThrow(/demo/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('with the demo setting off @SC-1965 @SC-1979', () => {
  beforeEach(() => setDemoModeForTests(false))

  it('the speech token, synthesis and the voice list reach the vendor as before', async () => {
    expect(await mintSpeechToken({ ...access, providerId: 'p-off' })).toMatchObject({ ok: true })
    expect((await new InworldTtsAdapter().synthesize('Hello', config)).toString()).toBe('x')
    await new InworldTtsAdapter().listVoices('k')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
