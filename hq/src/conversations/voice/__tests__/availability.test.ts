import { describe, expect, it } from 'vitest'
import { voiceRefusal, type VoiceFacts } from '../availability'

const facts: VoiceFacts = {
  speakingRefusal: null, agent: { name: 'Kernel' }, speechToTextDown: null, textToSpeechDown: null, accessProblem: null, holder: null,
}

describe('voiceRefusal', () => {
  it('lets every agent speak: there is no per-agent switch', () => {
    expect(voiceRefusal(facts, 'u1')).toBeNull()
  })

  it('reads as an outage when speech to text or text to speech is down, before a model problem', () => {
    const stt = "Voice is down: speech to text isn't working. An organisation admin has been told."
    expect(voiceRefusal({ ...facts, speechToTextDown: stt, accessProblem: 'no model' }, 'u1')).toBe(stt)
    expect(voiceRefusal({ ...facts, textToSpeechDown: 'tts down', accessProblem: 'no model' }, 'u1')).toBe('tts down')
  })

  it('then the model access problem, then another person holding voice', () => {
    expect(voiceRefusal({ ...facts, accessProblem: 'no model' }, 'u1')).toBe('no model')
    expect(voiceRefusal({ ...facts, holder: { id: 'u2', name: 'Ana' } }, 'u1')).toContain('Ana is using voice')
  })
})
