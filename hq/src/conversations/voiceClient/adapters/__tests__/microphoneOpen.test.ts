import { afterEach, describe, expect, it, vi } from 'vitest'
import { microphoneProblem, openMicrophone } from '../microphone'

afterEach(() => { vi.unstubAllGlobals() })

describe('opening the microphone', () => {
  it('asks for the device’s echo cancellation, noise suppression and automatic gain', async () => {
    const asked: MediaStreamConstraints[] = []
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: async (c: MediaStreamConstraints) => { asked.push(c); throw new Error('denied') } },
    })
    await expect(openMicrophone(() => undefined)).rejects.toThrow(/microphone could not be used/)
    expect(asked[0]!.audio).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })
  })

  it('says plainly that a page over plain http at a network address cannot have it', async () => {
    vi.stubGlobal('navigator', {})
    await expect(openMicrophone(() => undefined)).rejects.toThrow(/need a secure page: open HQ over https, or on this computer at localhost/)
  })

  it('says which of the browser\'s reasons stopped it', () => {
    const refused = (name: string) => microphoneProblem(Object.assign(new Error('x'), { name }))
    expect(refused('NotAllowedError')).toMatch(/blocked/)
    expect(refused('NotReadableError')).toMatch(/in use by another app/)
    expect(refused('NotFoundError')).toMatch(/No microphone was found/)
    expect(refused('TypeError')).toMatch(/could not be used \(TypeError\)/)
  })
})
