/**
 * Provenance (spec part 2 *Provenance*, D19; security review M5). A copy's based-on list is written once, when the
 * copy is made: the original's list, then the original as one line recorded by hq. Nothing rewrites a line
 * afterwards; people may only add stated credits. hq holds the list in its own records (`AssetVersion.basedOn`),
 * never reading it back from a file anyone could edit.
 *
 * A line shows as *verified* only when hq wrote it in this organisation, holds it in a version it made here, and still
 * holds the original at that version with that fingerprint. Every other line is *stated*, by whoever stated it: a
 * line read from a package is that package's signer's statement, whatever its `recorded` field says. Pure.
 */
import { BASED_ON_MAX_LINES, type BasedOnLine } from '@agenthix/core'

const STATED_MAX = 200
const CONTROL = /[\u0000-\u001f\u007f]/

/** A line as hq holds it: core's line, and for a stated one, who stated it. */
export type HeldLine = BasedOnLine & { statedBy?: string }

export type ShownLine = HeldLine & { shown: 'verified' | 'stated' }

export class ProvenanceError extends Error {}

const day = (at: Date) => at.toISOString().slice(0, 10)

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** The list a version holds, read back from its JSON column; anything not shaped like a line is left out. */
export function heldLines(raw: unknown): HeldLine[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((l): l is HeldLine => {
    if (!l || typeof l !== 'object') return false
    const line = l as Record<string, unknown>
    return typeof line.skill === 'string' && typeof line.copied === 'string' && (line.recorded === 'hq' || line.recorded === 'stated')
  })
}

export type Original = {
  identity: string
  version: string
  digest: string
  basedOn: unknown
  /** The original came from a package, so every line it brought is its signer's statement. */
  fromPackage?: boolean
  publisher?: string
}

/** The list a new copy is given. */
export function copyLines(original: Original, at: Date): HeldLine[] {
  const inherited = heldLines(original.basedOn).map(l =>
    original.fromPackage ? { ...l, recorded: 'stated' as const, statedBy: l.statedBy ?? original.publisher } : l)
  if (inherited.length + 1 > BASED_ON_MAX_LINES) {
    throw new ProvenanceError(`${original.identity} already credits ${inherited.length} sources, and a copy can credit at most ${BASED_ON_MAX_LINES}. Nothing was changed.`)
  }
  return [...inherited, { skill: original.identity, version: original.version, fingerprint: original.digest, copied: day(at), recorded: 'hq' }]
}

export type StatedInput = { skill: unknown; version?: unknown; copied?: unknown }

/** A credit a person adds for a source hq never saw. */
export function statedLine(input: StatedInput, statedBy: string, at: Date): HeldLine {
  const text = (v: unknown, what: string): string => {
    const t = typeof v === 'string' ? v.trim() : ''
    if (!t || t.length > STATED_MAX || CONTROL.test(t)) throw new ProvenanceError(`Say ${what} in one line of 1 to ${STATED_MAX} characters. Nothing was changed.`)
    return t
  }
  const line: HeldLine = { skill: text(input.skill, 'what it is based on'), copied: day(at), recorded: 'stated', statedBy }
  if (input.version !== undefined && input.version !== null && input.version !== '') line.version = text(input.version, 'its version')
  if (input.copied !== undefined && input.copied !== null && input.copied !== '') {
    if (typeof input.copied !== 'string' || !isCalendarDate(input.copied)) throw new ProvenanceError('The date it was copied is a day, YYYY-MM-DD. Nothing was changed.')
    line.copied = input.copied
  }
  return line
}

/** How each line shows. `holds` gives the fingerprint of the version hq holds for an identity, or null. */
export function markLines(
  lines: HeldLine[],
  version: { madeHere: boolean; publisher: string },
  holds: (identity: string, version: string) => string | null,
): ShownLine[] {
  return lines.map(l => {
    const verified = version.madeHere && l.recorded === 'hq' && !!l.version && !!l.fingerprint && holds(l.skill, l.version) === l.fingerprint
    if (verified) return { ...l, shown: 'verified' as const }
    return { ...l, shown: 'stated' as const, statedBy: version.madeHere ? l.statedBy : version.publisher }
  })
}
