/**
 * The values of a services file (services.ts) that have a grammar of their own: an image's name, a command written
 * as one line, a duration.
 */
import { SERVICE_LIMITS } from './services.js'

const COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/
const DIGEST = /^sha256:[0-9a-f]{64}$/
const HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
const IP_LIKE = /^[0-9.]+$|^\[|:/

/**
 * An image named by DNS name (S14): `[registry/]path[:tag][@sha256:…]`, as Docker reads it. A registry named by an
 * address, `localhost`, or with a port is refused: images come from public registries by name. Answers the image,
 * or what is wrong with it.
 */
export function checkImage(image: string): { image: string } | string {
  const bad = 'An image is named like postgres:16 or ghcr.io/owner/name:tag, from a public registry by its name.'
  if (image.length === 0 || image.length > SERVICE_LIMITS.imageChars || /\s|\$/.test(image)) return bad
  let rest = image
  const at = rest.indexOf('@')
  if (at >= 0) {
    if (!DIGEST.test(rest.slice(at + 1))) return bad
    rest = rest.slice(0, at)
  }
  const parts = rest.split('/')
  const last = parts[parts.length - 1]
  const colon = last.indexOf(':')
  if (colon >= 0) {
    if (!TAG.test(last.slice(colon + 1))) return bad
    parts[parts.length - 1] = last.slice(0, colon)
  }
  // Docker's rule: the first part is a registry when it has a dot or a colon, or is localhost.
  const first = parts[0]
  if (parts.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost')) {
    if (first === 'localhost' || IP_LIKE.test(first) || !HOST.test(first)) {
      return 'An image comes from a public registry named by its DNS name, never an address, a port or localhost.'
    }
    parts.shift()
  }
  return parts.length > 0 && parts.every(c => COMPONENT.test(c)) ? { image } : bad
}

/**
 * A command as a list of words. A list is taken as it is; a line is split as a shell splits words (spaces, single and
 * double quotes, backslashes), and nothing in it is run or expanded.
 */
export function readCommand(v: unknown): { command: string[] } | { problem: string } {
  const problem = 'command is a list of words, such as [postgres, -c, fsync=off], or one line.'
  if (Array.isArray(v)) {
    if (v.length === 0 || v.length > SERVICE_LIMITS.commandArgs) return { problem }
    if (!v.every(a => typeof a === 'string' || (typeof a === 'number' && Number.isFinite(a)))) return { problem }
    return { command: v.map(String) }
  }
  if (typeof v !== 'string') return { problem }
  const words = splitWords(v)
  if (!words || words.length === 0 || words.length > SERVICE_LIMITS.commandArgs) return { problem: 'command has an unclosed quote, or is empty.' }
  return { command: words }
}

function splitWords(line: string): string[] | null {
  const words: string[] = []
  let word: string | null = null
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote === "'") {
      if (c === "'") quote = null
      else word += c
    } else if (quote === '"') {
      if (c === '"') quote = null
      else if (c === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) word += line[++i]
      else word += c
    } else if (c === "'" || c === '"') {
      quote = c
      word ??= ''
    } else if (c === '\\') {
      if (i + 1 >= line.length) return null
      word = (word ?? '') + line[++i]
    } else if (/\s/.test(c)) {
      if (word !== null) words.push(word)
      word = null
    } else word = (word ?? '') + c
  }
  if (quote) return null
  if (word !== null) words.push(word)
  return words
}

const UNIT_MS: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1000, ms: 1, us: 0.001, ns: 0.000001 }

/** A Compose duration (`1m30s`, `500ms`, a number of seconds) in whole milliseconds, or null. */
export function readDuration(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 1000) : null
  if (typeof v !== 'string' || !/^(\d+(\.\d+)?(h|ms|m|s|us|ns))+$/.test(v)) return null
  let total = 0
  for (const [, n, , unit] of v.matchAll(/(\d+(\.\d+)?)(h|ms|m|s|us|ns)/g)) total += Number(n) * UNIT_MS[unit]
  return Math.round(total)
}
