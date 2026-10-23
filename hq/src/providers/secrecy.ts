/**
 * What of a provider's key may ever leave the provider store (models from one place, part 1): its last four
 * characters, and a vendor's message with anything that looks like a key taken out.
 */
import { PROVIDER_STATE_DETAIL_MAX } from '@agenthix/core'

const MIN_KEY_LENGTH = 8
const MAX_KEY_LENGTH = 1024

export function keyHintOf(key: string | null | undefined): string | null {
  return key ? key.slice(-4) : null
}

/** Why a key as given cannot be one, or null. Checked before anything is sent to a vendor. */
export function providerKeyProblem(key: string): string | null {
  if (key.length < MIN_KEY_LENGTH) return 'That key is too short to be one.'
  if (key.length > MAX_KEY_LENGTH) return 'That key is too long to be one.'
  if (/[\s\p{Cc}]/u.test(key)) return 'A key has no spaces or line breaks in it: copy it again.'
  return null
}

// A run of 20 or more characters a key is made of, after an optional prefix such as `sk-ant-`: no word is that long.
const KEY_LIKE = /\b(?:[A-Za-z]{2,8}-){0,3}[A-Za-z0-9_\-+/=]{20,}/g

/** A vendor's own words for why it refused, made safe to store and show: one line, trimmed, no key in it. */
export function vendorMessage(text: string, key?: string | null): string {
  let said = key ? text.split(key).join('…') : text
  said = said.replace(KEY_LIKE, '…').replace(/\s+/g, ' ').trim()
  return said.length > PROVIDER_STATE_DETAIL_MAX ? `${said.slice(0, PROVIDER_STATE_DETAIL_MAX - 1)}…` : said
}
