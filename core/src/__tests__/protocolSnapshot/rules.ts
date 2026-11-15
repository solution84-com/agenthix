/**
 * What a connection's version must be, given what changed since its snapshot, and the rules every deprecation mark
 * keeps (the spec's *The lifecycle of a piece of a protocol*):
 *
 *   /** @deprecated since 1.4; stops working in 3.0. Use `runPage` instead. *\/
 *   /** @deprecated since 1.4; stops working in 3.0. Nothing replaces it. *\/
 *
 * Something leaves only after it was deprecated: a type, field or named union member gone from the code must have
 * carried a mark in the committed snapshot. Once the major passes the mark's "since" major, the thing leaves the
 * current code (kept only in the code for peers one major behind); once it reaches the "stops working" version, it is
 * gone from that too.
 */
import { parseProtocolVersion, type ProtocolVersion } from '../../protocol/connection.js'
import { compareSnapshots, levelOf, type Change, type Level } from './compare.js'
import type { Field, Shape, Snapshot } from './shape.js'

export type DeprecationMark = { since: ProtocolVersion; stopsMajor: number; replacement: string | null }

const MARK = /^since (\d+)\.(\d+); stops working in (\d+)\.0\. (?:Use `([^`]+)` instead|(Nothing replaces it))\.$/

export const MARK_FORM = 'since <major>.<minor>; stops working in <major + 2>.0. Use `<replacement>` instead. ' +
  '(or: … Nothing replaces it.)'

export function parseDeprecationMark(text: string): DeprecationMark | { error: string } {
  const m = MARK.exec(text)
  if (!m) return { error: `the mark must read \`${MARK_FORM}\`; it reads \`${text}\`` }
  const since = { major: Number(m[1]), minor: Number(m[2]) }
  const stopsMajor = Number(m[3])
  if (stopsMajor !== since.major + 2) {
    return { error: `deprecated since ${since.major}.${since.minor}, it stops working in ${since.major + 2}.0, two majors on, not ${stopsMajor}.0` }
  }
  return { since, stopsMajor, replacement: m[4] ?? null }
}

/** Every deprecation mark in a snapshot, with where it is. */
export function marksIn(snapshot: Snapshot): { at: string; mark: string }[] {
  const out: { at: string; mark: string }[] = []
  const walk = (at: string, s: Shape) => {
    if ('fields' in s) {
      for (const [name, f] of Object.entries(s.fields) as [string, Field][]) {
        if (f.deprecated !== undefined) out.push({ at: `${at}.${name}`, mark: f.deprecated })
        walk(`${at}.${name}`, f.type)
      }
      if (s.index) walk(`${at}[${s.index.key}]`, s.index.value)
    } else if ('union' in s) s.union.forEach(m => walk(at, m))
    else if ('intersection' in s) s.intersection.forEach(m => walk(at, m))
    else if ('array' in s) walk(`${at}[]`, s.array)
    else if ('tuple' in s) s.tuple.forEach((m, i) => walk(`${at}[${i}]`, m))
  }
  for (const [name, e] of Object.entries(snapshot.types)) {
    if (e.deprecated !== undefined) out.push({ at: name, mark: e.deprecated })
    walk(name, e.shape)
  }
  return out
}

export type Verdict = {
  connection: string
  changes: Change[]
  needed: Level
  /** Each rule broken, in words that say what must change. Empty when the version and marks are right. */
  problems: string[]
}

/**
 * `before` is the committed snapshot; `now` what the code declares; `previousMajor` what the code kept for peers one
 * major behind declares, if any.
 */
export function judge(
  before: Snapshot, now: Snapshot, previousMajor: Snapshot | null = null, methodMaps: ReadonlySet<string> = new Set(),
): Verdict {
  const name = now.connection
  const problems: string[] = []
  const was = parseProtocolVersion(before.version)
  const is = parseProtocolVersion(now.version)
  if (!was || !is) {
    return { connection: name, changes: [], needed: 'none', problems: [`${name}: the version must be major.minor (snapshot ${before.version}, code ${now.version})`] }
  }
  const changes = compareSnapshots(before, now, methodMaps)
  const needed = levelOf(changes)
  const v = (p: ProtocolVersion) => `${p.major}.${p.minor}`

  if (is.major < was.major || (is.major === was.major && is.minor < was.minor)) {
    problems.push(`${name}: the version went back from ${v(was)} to ${v(is)}`)
  } else if (needed === 'major' && is.major === was.major) {
    problems.push(`${name}: ${describe(changes, 'major')} — a breaking change, so the major must move: the version must become ${was.major + 1}.0 (it is ${v(is)})`)
  } else if (needed === 'minor' && v(is) === v(was)) {
    problems.push(`${name}: ${describe(changes, 'minor')} — an addition, so the minor must move: the version must become ${was.major}.${was.minor + 1} (it is ${v(is)})`)
  }

  for (const c of changes) {
    if (c.removedMark === null) {
      problems.push(`${name}: ${c.at} was removed without being deprecated first: it must carry an \`@deprecated\` mark for at least one minor, and leave only at a later major`)
    }
  }
  for (const c of changes) {
    if (c.newMark === undefined) continue
    const m = parseDeprecationMark(c.newMark)
    if (!('error' in m) && v(m.since) !== v(is)) {
      problems.push(`${name}: ${c.at} is newly deprecated, so its mark names the version it ships in: since ${v(is)}, not ${v(m.since)}`)
    }
  }
  for (const { at, mark } of marksIn(now)) {
    const m = parseDeprecationMark(mark)
    if ('error' in m) {
      problems.push(`${name}: ${at}: ${m.error}`)
    } else if (is.major >= m.stopsMajor) {
      problems.push(`${name}: ${at} stopped working in ${m.stopsMajor}.0: it must be gone, and peers still on ${m.since.major}.x refused`)
    } else if (is.major > m.since.major) {
      problems.push(`${name}: ${at} has been deprecated since ${v(m.since)} and the major is now ${is.major}: it must leave the current code, kept only in the code for peers on ${m.since.major}.x`)
    }
  }
  for (const { at, mark } of previousMajor ? marksIn(previousMajor) : []) {
    const m = parseDeprecationMark(mark)
    if (!('error' in m) && is.major >= m.stopsMajor) {
      problems.push(`${name}: ${at}, in the code for the previous major, stopped working in ${m.stopsMajor}.0: it must be gone, and peers still on ${m.since.major}.x refused`)
    }
  }
  return { connection: name, changes, needed, problems }
}

/**
 * What stops a deliberate reset: the lead's step before a first release, which records the current shapes as a new
 * baseline instead of judging them against the committed snapshot. It is allowed only at `1.0`, with nothing
 * deprecated, since a baseline every later version counts from carries nothing on its way out.
 */
export function resetProblems(now: Snapshot): string[] {
  const name = now.connection
  const problems = now.version === '1.0' ? [] : [`${name}: a reset records 1.0, and the version is ${now.version}`]
  for (const { at } of marksIn(now)) problems.push(`${name}: ${at} still carries a deprecation mark: a reset baseline has none`)
  return problems
}

function describe(changes: Change[], level: Level): string {
  const of = changes.filter(c => c.level === level)
  const shown = of.slice(0, 8).map(c => `${c.at} ${c.what}`).join('; ')
  return of.length > 8 ? `${shown}; and ${of.length - 8} more` : shown
}
