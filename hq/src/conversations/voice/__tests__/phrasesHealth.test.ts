import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ reportCall: vi.fn(), stream: vi.fn() }))
vi.mock('../../../routing/resolver', () => ({ reportCall: h.reportCall }))
vi.mock('../../../voice/inworldAdapter', () => ({ inworldTtsAdapter: { synthesizeStream: h.stream } }))

import { phraseClips } from '../phrases'

const voice = { apiKey: 'k', voiceId: 'Ashley', model: 'm', providerId: 'p1' }
let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phrases-health-'))
  h.reportCall.mockReset()
  h.stream.mockReset()
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const make = () => phraseClips(voice, () => undefined, () => true, { dir: () => dir, random: () => 0 })

describe('the stored phrases report to the provider\'s health @SC-1547', () => {
  it('reports each clip that was made as a success', async () => {
    h.stream.mockImplementation(async function* () { yield { audio: Buffer.from('pcm') } })
    await make()
    expect(h.reportCall).toHaveBeenCalledWith('p1', null)
  })

  it('reports a clip the service refused, with why, and carries on without it', async () => {
    h.stream.mockImplementation(async function* () { throw new Error('401 unauthorised') })
    await make()
    expect(h.reportCall).toHaveBeenCalledWith('p1', expect.anything(), '401 unauthorised')
  })
})
