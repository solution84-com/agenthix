/**
 * Identifier derivation
 * =====================
 * Pure functions for deriving slugs and project keys from human names.
 * Safe to import from both client and server.
 *
 * Slug rule (sites, programs, products):
 *   Lowercase, alphanumeric + hyphens. Leading/trailing hyphens stripped greedily.
 *   Collisions are resolved by the server at persist time (append -2, -3, ...).
 *
 * Project key rule (Jira-style):
 *   Multi-word names use initials of each word (e.g. "New Project" → NP).
 *   Single-word names start at 3 chars (e.g. "Dashboard" → DAS) and expand
 *   to 4, 5, 6 chars on collision before falling back to letter suffixes.
 *   A key is always 2 to 6 letters, the shape project creation accepts: a clash is
 *   resolved with added letters (e.g. "NP" taken → NPA), never a digit.
 *   Words shorter than 3 chars are padded with X (e.g. "Go" → GOX).
 */

export function deriveSlug(name: string, existingSlugs: string[] = []): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled'

  if (!existingSlugs.includes(base)) return base

  let counter = 2
  while (existingSlugs.includes(`${base}-${counter}`)) counter++
  return `${base}-${counter}`
}

export function deriveProjectKey(name: string, existingKeys: string[] = []): string {
  const words = (name.match(/[a-zA-Z]+/g) ?? []).map(w => w.toUpperCase())

  if (words.length === 0) {
    return existingKeys.includes('PROJ') ? _uniqueWithLetters('PROJ', existingKeys) : 'PROJ'
  }

  if (words.length === 1) {
    const word = words[0]
    const candidates: string[] = [word.length >= 3 ? word.slice(0, 3) : word.padEnd(3, 'X')]
    for (let len = 4; len <= 6 && word.length >= len; len++) {
      candidates.push(word.slice(0, len))
    }
    for (const c of candidates) {
      if (!existingKeys.includes(c)) return c
    }
    return _uniqueWithLetters(candidates[0], existingKeys)
  }

  let initials = words.map(w => w[0]).join('').slice(0, 6)
  if (initials.length < 2) initials = initials.padEnd(2, 'X')

  if (!existingKeys.includes(initials)) return initials
  return _uniqueWithLetters(initials, existingKeys)
}

// Base plus one letter (A..Z), then two, and so on, the base cut to keep the key at six letters at most.
function _uniqueWithLetters(base: string, existingKeys: string[]): string {
  for (let extra = 1; extra <= 4; extra++) {
    const stem = base.slice(0, 6 - extra)
    for (let n = 0; n < 26 ** extra; n++) {
      let suffix = ''
      for (let i = 0, rest = n; i < extra; i++, rest = Math.floor(rest / 26)) {
        suffix = String.fromCharCode(65 + (rest % 26)) + suffix
      }
      if (!existingKeys.includes(stem + suffix)) return stem + suffix
    }
  }
  throw new Error('Could not find a free project key')
}
