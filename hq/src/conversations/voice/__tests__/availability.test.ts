import { afterEach, describe, expect, it } from 'vitest'
import { setDemoModeForTests } from '../../../demo/demoMode'
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

describe('voiceRefusal in the demo @SC-1961', () => {
  afterEach(() => setDemoModeForTests(null))
  const stuck = { ...facts, speechToTextDown: 'stt down', textToSpeechDown: 'tts down', accessProblem: 'no model', holder: { id: 'u2', name: 'Ana' } }

  it('stands aside for speech, model access and another holder, since recorded lines are played', () => {
    setDemoModeForTests(true)
    expect(voiceRefusal(stuck, 'u1')).toBeNull()
  })

  it('still refuses someone who may not speak here, or a conversation with no agent', () => {
    setDemoModeForTests(true)
    expect(voiceRefusal({ ...facts, speakingRefusal: 'closed' }, 'u1')).toBe('closed')
    expect(voiceRefusal({ ...facts, agent: null }, 'u1')).toContain('no longer exists')
  })

  it('changes nothing with the setting off', () => {
    setDemoModeForTests(false)
    expect(voiceRefusal(stuck, 'u1')).toBe('stt down')
  })
})
