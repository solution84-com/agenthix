/**
 * hq's price list for voice on the organisation's own keys, kept by hand: speech to text per hour of audio and text
 * to speech per million characters, in whole millionths of a US dollar, from each vendor's published list price. Its
 * version is the date it was last checked against those prices, and moves with every change, so a ledger row's
 * `hq:<version>` names exactly the prices it used. A speech model not listed here has no known price, and its use is
 * unpriced.
 */
import { hqPriceRef, type PriceRef } from '../billing/ledger.js'

export const VOICE_PRICE_LIST_VERSION = 'voice-2026-11-09.1'
export const VOICE_PRICE_REF: PriceRef = hqPriceRef(VOICE_PRICE_LIST_VERSION)

/** Speech to text, per hour of audio streamed, by vendor and speech model. */
export const STT_PRICES_PER_HOUR_MICROS: Readonly<Record<string, Readonly<Record<string, bigint>>>> = {
  assemblyai: {
    'universal-streaming-english': 150_000n,
    'universal-streaming-multilingual': 150_000n,
    'universal-3-6-pro': 450_000n,
  },
  // On demand, billed by the second; higher plans pay less, which an organisation's own invoice shows.
  inworld: {
    'inworld/inworld-stt-1': 150_000n,
  },
}

/** Text to speech, per million characters sent, by vendor and speech model. */
export const TTS_PRICES_PER_MILLION_CHARS_MICROS: Readonly<Record<string, Readonly<Record<string, bigint>>>> = {
  inworld: {
    'inworld-tts-2': 25_000_000n,
  },
}

export function sttPricePerHourMicros(vendor: string, model: string): bigint | null {
  return STT_PRICES_PER_HOUR_MICROS[vendor]?.[model] ?? null
}

export function ttsPricePerMillionCharsMicros(vendor: string, model: string): bigint | null {
  return TTS_PRICES_PER_MILLION_CHARS_MICROS[vendor]?.[model] ?? null
}
