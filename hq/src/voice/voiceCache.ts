import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { inworldTtsAdapter } from './inworldAdapter'
import { fallbackPhrase, generateSamplePhrase } from './phraseModel'
import { getVoiceCacheDir } from '../server/hqStoragePaths'
import type { Voice } from './ttsAdapter'

const VOICES_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000  // check count daily

function cacheDir(): string {
  return getVoiceCacheDir()
}

function voicesFile(providerId: string): string {
  return path.join(cacheDir(), `voices-${providerId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
}

function voiceDir(voiceId: string): string {
  return path.join(cacheDir(), voiceId.replace(/[^a-zA-Z0-9_-]/g, '_'))
}

/** A language in a file name: only letters, digits and hyphens, so it can never name a place outside the folder. */
function langPart(lang: string): string {
  return lang.replace(/[^a-zA-Z0-9-]/g, '_')
}

export function phraseFile(voiceId: string, lang: string): string {
  return path.join(voiceDir(voiceId), `phrase-${langPart(lang)}.json`)
}

export function audioFile(voiceId: string, lang: string, phrase: string, model: string): string {
  const hash = crypto.createHash('sha1').update(phrase + '|' + model).digest('hex').slice(0, 12)
  return path.join(voiceDir(voiceId), `phrase-${langPart(lang)}-${hash}.raw`)
}

function descriptionHash(description: string): string {
  return crypto.createHash('sha1').update(description).digest('hex').slice(0, 16)
}

function isStale(filePath: string, ttlMs: number): boolean {
  try {
    const age = Date.now() - fs.statSync(filePath).mtimeMs
    return age > ttlMs
  } catch {
    return true
  }
}

// ─── Voice list ───────────────────────────────────────────────────────────────

/** One provider's voices: each provider has its own workspace, and so its own list and custom voices. */
export async function getCachedVoices(providerId: string, apiKey: string): Promise<Voice[]> {
  const file = voicesFile(providerId)

  if (!isStale(file, VOICES_CHECK_INTERVAL_MS)) {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Voice[]
  }

  // Check interval elapsed — fetch fresh list and compare count
  const fresh = await inworldTtsAdapter.listVoices(apiKey)
  fs.mkdirSync(path.dirname(file), { recursive: true })

  let cached: Voice[] = []
  try { cached = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}

  if (fresh.length !== cached.length) {
    // Count changed — new or removed voices, overwrite cache
    fs.writeFileSync(file, JSON.stringify(fresh, null, 2))
    return fresh
  }

  // Count unchanged — touch file to reset the check interval, return cached
  fs.utimesSync(file, new Date(), new Date())
  return cached
}

// ─── Phrase generation ────────────────────────────────────────────────────────

export async function getCachedPhrase(voiceId: string, description: string, lang: string): Promise<string> {
  const file = phraseFile(voiceId, lang)
  const dHash = descriptionHash(description)

  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8')) as { phrase: string; descriptionHash: string }
    if (cached.descriptionHash === dHash) return cached.phrase
  } catch {}

  // File missing or description changed — generate fresh phrase. Without a model to write one, the fixed phrase
  // is used and not kept, so a model added later still writes the voice's own.
  let phrase: string
  try {
    phrase = await generateSamplePhrase(description, lang)
  } catch {
    return fallbackPhrase(lang)
  }

  const dir = voiceDir(voiceId)
  fs.mkdirSync(dir, { recursive: true })

  // Purge stale audio files for this language only
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(`phrase-${langPart(lang)}-`) && f.endsWith('.raw')) fs.unlinkSync(path.join(dir, f))
    }
  } catch {}

  fs.writeFileSync(file, JSON.stringify({ phrase, descriptionHash: dHash, generatedAt: new Date().toISOString() }, null, 2))
  return phrase
}

// ─── Audio cache ──────────────────────────────────────────────────────────────

export async function getCachedAudio(
  voiceId: string,
  lang: string,
  phrase: string,
  model: string,
  apiKey: string,
  /** Told the characters sent when the audio was made rather than read from the cache, for the ledger. */
  onSynthesized?: (characters: number) => void,
): Promise<Buffer> {
  const file = audioFile(voiceId, lang, phrase, model)
  if (fs.existsSync(file)) return fs.readFileSync(file)

  const audio = await inworldTtsAdapter.synthesize(phrase, { apiKey, voiceId, model })
  onSynthesized?.(phrase.length)
  fs.mkdirSync(voiceDir(voiceId), { recursive: true })
  fs.writeFileSync(file, audio)
  return audio
}
