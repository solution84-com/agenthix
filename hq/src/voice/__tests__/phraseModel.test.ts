import { describe, it, expect, vi } from 'vitest'
import { fallbackPhrase, generateSamplePhrase } from '../phraseModel'

describe('the voice sample phrase @SC-090 @SC-1206', () => {
  it('asks the model once and returns the trimmed text', async () => {
    const generateText = vi.fn().mockResolvedValue({ text: '  Good morning, and welcome.  ' })
    const phrase = await generateSamplePhrase('a warm, low voice', 'en', {
      generateText, model: async () => ({}) as never,
    })
    expect(phrase).toBe('Good morning, and welcome.')
    expect(generateText).toHaveBeenCalledTimes(1)
  })

  it('refuses with a reason when no model is working, rather than returning an empty phrase', async () => {
    await expect(generateSamplePhrase('a warm, low voice', 'en', {
      generateText: vi.fn(), model: async () => null,
    })).rejects.toThrow(/no model is working/i)
  })

  it('keeps the phrase to one or two sentences by asking for it in the prompt', async () => {
    const generateText = vi.fn().mockResolvedValue({ text: 'x' })
    await generateSamplePhrase('a warm, low voice', 'fr', { generateText, model: async () => ({}) as never })
    const prompt = generateText.mock.calls[0][0].prompt as string
    expect(prompt).toContain('"fr"')
    expect(prompt).toContain('a warm, low voice')
  })
})

describe('the fixed sample phrase, for when no model can write one @SC-090 @SC-1206', () => {
  it('has a phrase in every language the voice screen offers', () => {
    for (const lang of ['ar', 'de', 'en', 'es', 'fr', 'he', 'hi', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'zh']) {
      expect(fallbackPhrase(lang).length).toBeGreaterThan(10)
    }
  })

  it('speaks English for a language it does not know', () => {
    expect(fallbackPhrase('xx')).toBe(fallbackPhrase('en'))
  })
})
