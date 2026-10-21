/**
 * One log line, as HQ and every site write it (adr-0106): an ISO date and
 * time, a level, the source that wrote it, the message, and optional
 * structured fields such as a run id. Stored one JSON object per line.
 *
 * `makeLogLine` is the only way a line is made, and it removes secrets
 * (`redact.ts`) before anything else sees the line, so neither the file nor
 * standard output ever holds one.
 */
import { REDACTED, isSecretKey, redactText } from './redact.js'

export const LOG_LEVELS = ['error', 'warn', 'info'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

/** What a line's fields may hold: plain JSON, so a line crosses any wire unchanged. */
export type LogValue = string | number | boolean | null | LogValue[] | { [key: string]: LogValue }
export type LogFields = { [key: string]: LogValue }

export type LogLine = {
  at: string
  level: LogLevel
  source: string
  message: string
  fields?: LogFields
}

const MAX_MESSAGE = 8_000
const MAX_STRING = 4_000
const MAX_ITEMS = 50
const MAX_DEPTH = 6
const MAX_SOURCE = 80

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… (${text.length - max} more characters)` : text
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function errorFields(err: Error, seen: WeakSet<object>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = { name: err.name, message: redactText(clip(err.message, MAX_STRING)) }
  if (err.stack) out.stack = redactText(clip(err.stack, MAX_STRING))
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string' || typeof code === 'number') out.code = code
  const cause = (err as { cause?: unknown }).cause
  if (cause !== undefined) out.cause = safeValue(cause, seen, depth + 1)
  return out
}

/**
 * A value made safe to write: secrets removed by name and by shape, cycles
 * cut, depth and size bounded, and anything JSON cannot hold turned into text.
 */
function safeValue(v: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return v
  if (typeof v === 'string') return redactText(clip(v, MAX_STRING))
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'undefined') return undefined
  if (typeof v === 'function' || typeof v === 'symbol') return undefined
  if (depth > MAX_DEPTH) return '[nested too deep]'
  const obj = v as object
  if (seen.has(obj)) return '[circular]'
  seen.add(obj)
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  if (v instanceof Error) return errorFields(v, seen, depth)
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return '[bytes]'
  if (Array.isArray(v)) {
    const items = v.slice(0, MAX_ITEMS).map(item => safeValue(item, seen, depth + 1))
    return v.length > MAX_ITEMS ? [...items, `… ${v.length - MAX_ITEMS} more`] : items
  }
  if (v instanceof Map) return safeValue(Object.fromEntries(v), seen, depth)
  if (v instanceof Set) return safeValue([...v], seen, depth)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj).slice(0, MAX_ITEMS)) {
    if (isSecretKey(key) && value !== null && value !== undefined && value !== '') {
      out[key] = REDACTED
      continue
    }
    const safe = safeValue(value, seen, depth + 1)
    if (safe !== undefined) out[key] = safe
  }
  return out
}

/** Fields from a logger call's extra arguments: plain objects merge in, an error becomes `error`, anything else `args`. */
function fieldsOf(args: unknown[]): LogFields | undefined {
  const seen = new WeakSet<object>()
  const fields: Record<string, unknown> = {}
  const rest: unknown[] = []
  for (const arg of args) {
    if (arg instanceof Error && fields.error === undefined) fields.error = safeValue(arg, seen, 0)
    else if (isPlainObject(arg)) Object.assign(fields, safeValue(arg, seen, 0) as Record<string, unknown>)
    else if (arg !== undefined) rest.push(safeValue(arg, seen, 0))
  }
  if (rest.length > 0) fields.args = rest
  return Object.keys(fields).length > 0 ? (fields as LogFields) : undefined
}

export function makeLogLine(level: LogLevel, source: string, message: string, args: unknown[] = [], now: Date = new Date()): LogLine {
  const line: LogLine = {
    at: now.toISOString(),
    level,
    source: clip(source, MAX_SOURCE),
    message: redactText(clip(String(message), MAX_MESSAGE)),
  }
  const fields = fieldsOf(args)
  if (fields) line.fields = fields
  return line
}

export function serializeLogLine(line: LogLine): string {
  return JSON.stringify(line)
}

/** A stored line read back; null for anything that is not one (a line cut short by a crash, a stray write). */
export function parseLogLine(text: string): LogLine | null {
  if (!text || text[0] !== '{') return null
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  if (!isPlainObject(v)) return null
  const { at, level, source, message, fields } = v
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null
  if (typeof level !== 'string' || !(LOG_LEVELS as readonly string[]).includes(level)) return null
  if (typeof source !== 'string' || typeof message !== 'string') return null
  const line: LogLine = { at, level: level as LogLevel, source, message }
  if (isPlainObject(fields)) line.fields = fields as LogFields
  return line
}

/**
 * A line as a person reads it: on standard output, and in a downloaded file.
 * `multiline` puts an error's stack on the lines after it, as a terminal shows one.
 */
export function logLineText(line: LogLine, opts: { multiline?: boolean } = {}): string {
  const head = `${line.at} ${line.level.toUpperCase().padEnd(5)} [${line.source}] ${line.message}`
  if (!line.fields) return head
  if (!opts.multiline) return `${head} ${JSON.stringify(line.fields)}`
  const { error, ...rest } = line.fields
  const err = isPlainObject(error) ? error : null
  const stack = err && typeof err.stack === 'string' ? err.stack : null
  const shown = err && stack ? { ...rest, error: { ...err, stack: undefined } } : line.fields
  const tail = Object.keys(shown).length > 0 ? ` ${JSON.stringify(shown)}` : ''
  return stack ? `${head}${tail}\n${stack}` : `${head}${tail}`
}

/**
 * A line that came from somewhere else — a site, over the channel — checked
 * as a stored line is, and its secrets removed again rather than trusting the
 * sender to have done it.
 */
export function sanitizeLogLine(v: unknown): LogLine | null {
  let text: string
  try {
    text = typeof v === 'string' ? v : JSON.stringify(v ?? null)
  } catch {
    return null
  }
  const line = parseLogLine(text)
  if (!line) return null
  const out: LogLine = {
    at: line.at,
    level: line.level,
    source: redactText(clip(line.source, MAX_SOURCE)),
    message: redactText(clip(line.message, MAX_MESSAGE)),
  }
  if (line.fields) out.fields = safeValue(line.fields, new WeakSet(), 0) as LogFields
  return out
}
