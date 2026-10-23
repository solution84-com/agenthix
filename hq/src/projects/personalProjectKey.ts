import { randomInt } from 'node:crypto'
import { deriveProjectKey } from '../shared/identifiers'

const VALID_KEY = /^[A-Z]{2,6}$/

/**
 * A project key for a personal project: the name's own key where that is two to six letters and free, otherwise
 * its first letters followed by random ones. The ordinary derivation adds a digit to avoid a clash, and a key is
 * letters only.
 */
export function derivePersonalProjectKey(name: string, existingKeys: string[], random: (max: number) => number = randomInt): string {
  const taken = new Set(existingKeys)
  const derived = deriveProjectKey(name, existingKeys)
  if (VALID_KEY.test(derived) && !taken.has(derived)) return derived

  const letters = (name.match(/[a-zA-Z]/g) ?? []).join('').toUpperCase()
  const prefix = (letters.slice(0, 2) || 'PR').padEnd(2, 'X')
  for (let attempt = 0; attempt < 200; attempt++) {
    let key = prefix
    const extra = attempt < 50 ? 2 : 4
    for (let i = 0; i < extra; i++) key += String.fromCharCode(65 + random(26))
    if (!taken.has(key)) return key
  }
  throw new Error('Could not find a free project key')
}
