/**
 * A run's record of the skills it used (spec part 5 *Seeing it used*), as the site serves it on `run.get`. The record
 * is the site's word, so it is read as hostile: an entry counts only when every field is the shape it should be, and
 * an entry with `refused` set, of any type, was never staged and is never counted as used (security review H3).
 * What it names is only ever a key into hq's own records, which decide what anyone may open (M6).
 */
import { isAssetFingerprint, SKILL_SOURCES, type RunSkillUse, type SkillSource } from '@agenthix/core'

/** More entries than a run could stage are not read past. */
export const USED_SKILLS_READ = 1_000

const STAGED_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const FIELD_MAX = 512

const optional = (v: unknown): string | undefined | null => {
  if (v === undefined) return undefined
  return typeof v === 'string' && v.length > 0 && v.length <= FIELD_MAX ? v : null
}

function useOf(raw: unknown): RunSkillUse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if ('refused' in r && r.refused !== undefined) return null
  if (typeof r.name !== 'string' || !STAGED_NAME.test(r.name)) return null
  if (typeof r.source !== 'string' || !(SKILL_SOURCES as readonly string[]).includes(r.source)) return null
  if (!isAssetFingerprint(r.fingerprint)) return null
  const fields = { identity: optional(r.identity), version: optional(r.version), placeId: optional(r.placeId), path: optional(r.path), personId: optional(r.personId) }
  if (Object.values(fields).some(v => v === null)) return null
  const use: RunSkillUse = { name: r.name, source: r.source as SkillSource, fingerprint: r.fingerprint }
  for (const [key, value] of Object.entries(fields)) if (value) (use as Record<string, unknown>)[key] = value
  return use
}

/** The skills a run used, by staged name. A name recorded twice is not trusted for either entry. */
export function usedSkillsOf(record: unknown): Map<string, RunSkillUse> {
  const used = new Map<string, RunSkillUse>()
  if (!Array.isArray(record)) return used
  const twice = new Set<string>()
  for (const raw of record.slice(0, USED_SKILLS_READ)) {
    const use = useOf(raw)
    if (!use) continue
    if (used.has(use.name)) twice.add(use.name)
    else used.set(use.name, use)
  }
  for (const name of twice) used.delete(name)
  return used
}
