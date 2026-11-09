import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ HttpError: class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } } }))

import { checkVoice, modelsOfVoice } from '../choices'
import type { Snapshot } from '../../routing/decide'

const assembly = { id: 'p-aai', name: 'AssemblyAI', vendor: 'assemblyai', credentialKind: 'api_key', state: 'works', ownerUserId: null } as const
const inworld = { id: 'p-iw', name: 'Inworld', vendor: 'inworld', credentialKind: 'api_key', state: 'works', ownerUserId: null } as const
const snap = { providers: [assembly, inworld], org: {}, agent: null, agentName: 'Kernel', lists: [], conversationModel: null, billingProfileId: 'bp' } as unknown as Snapshot
const req = { purpose: 'tts', place: { kind: 'organisation' } } as const

describe('voice is locked to its models @SC-1203', () => {
  it('offers Inworld TTS 2 for speech, and for listening AssemblyAI’s three live models or Inworld’s one', () => {
    expect(modelsOfVoice('inworld', 'tts')).toEqual(['inworld-tts-2'])
    expect(modelsOfVoice('assemblyai', 'stt').sort()).toEqual(['universal-3-6-pro', 'universal-streaming-english', 'universal-streaming-multilingual'])
    expect(modelsOfVoice('inworld', 'stt')).toEqual(['inworld/inworld-stt-1'])
  })

  it('accepts Inworld TTS 2 with a voice', () => {
    expect(checkVoice({ providerId: 'p-iw', model: 'inworld-tts-2', voice: 'Alistair' }, 'tts', req, snap))
      .toEqual({ providerId: 'p-iw', model: 'inworld-tts-2', voice: 'Alistair' })
  })

  it('refuses any other speech model, in words', () => {
    expect(() => checkVoice({ providerId: 'p-iw', model: 'inworld-tts-1.5-max', voice: 'Alistair' }, 'tts', req, snap))
      .toThrow('Voice speaks with Inworld TTS 2 only.')
  })

  it('refuses a listening model that is not one of the three', () => {
    expect(() => checkVoice({ providerId: 'p-aai', model: 'nova-2' }, 'stt', req, snap))
      .toThrow('AssemblyAI listens with Universal-3 Pro, Universal-Streaming or Universal-Streaming Multilingual.')
    expect(checkVoice({ providerId: 'p-aai', model: 'universal-3-6-pro' }, 'stt', req, snap)).toEqual({ providerId: 'p-aai', model: 'universal-3-6-pro' })
  })

  it('accepts the one Inworld provider for listening as well as speech, and only its own model', () => {
    expect(checkVoice({ providerId: 'p-iw', model: 'inworld/inworld-stt-1' }, 'stt', req, snap)).toEqual({ providerId: 'p-iw', model: 'inworld/inworld-stt-1' })
    expect(() => checkVoice({ providerId: 'p-iw', model: 'universal-3-6-pro' }, 'stt', req, snap)).toThrow('Inworld listens with Inworld STT 1 only.')
  })
})
