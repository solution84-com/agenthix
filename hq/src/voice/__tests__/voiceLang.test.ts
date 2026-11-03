import { describe, it, expect, vi } from 'vitest'

vi.mock('../../server/hqStoragePaths', () => ({ getVoiceCacheDir: () => '/store/cache' }))
vi.mock('../inworldAdapter', () => ({ inworldTtsAdapter: {} }))
vi.mock('../phraseModel', () => ({ fallbackPhrase: () => '', generateSamplePhrase: async () => '' }))

import { isLanguageCode } from '../languageCode'
import { phraseFile, audioFile } from '../voiceCache'

describe('a voice preview language', () => {
  it('accepts language codes and refuses anything path-like', () => {
    for (const ok of ['en', 'fr', 'pt-BR', 'fil']) expect(isLanguageCode(ok)).toBe(true)
    for (const bad of ['/../../x', '../x', 'en/..', 'e', 'english', 'en_US', '', 5, null]) expect(isLanguageCode(bad)).toBe(false)
  })
  it('keeps cache file names inside the cache folder whatever the language', () => {
    for (const lang of ['/../../x', '..\\..\\y', 'a/../../b']) {
      expect(phraseFile('v1', lang).startsWith('/store/cache/v1/')).toBe(true)
      expect(phraseFile('v1', lang).slice('/store/cache/v1/'.length)).not.toMatch(/[\\/]/)
      expect(audioFile('v1', lang, 'p', 'm').slice('/store/cache/v1/'.length)).not.toMatch(/[\\/]/)
    }
  })
})
