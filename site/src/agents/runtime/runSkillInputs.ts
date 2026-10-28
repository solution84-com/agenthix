/**
 * The skills a dispatch names beside its packages (core's `installedSkills`, `fileSkills`, `personSkills`, site
 * protocol 1.9 and 1.10), read from the run's context. The context schema passes them through unchecked, so each
 * entry is checked here for its shape and bounds; one that does not fit is left out. Whether its content may be
 * staged is decided at staging (skillSources.ts). An hq before 1.9 names none: the run then stages the platform's
 * skills only.
 */
import { z } from 'zod'
import { PACKAGE_DIGEST_PATTERN, PACKAGE_KEY_PATTERN, PACKAGE_KINDS, type RunContextPayload } from '@agenthix/core'
import type { RunSkillInputs } from './skillSources'
import type { SkillPlace } from '../../packages/placeSkillHomes'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('RunSkillInputs')

/** More than any run is named; past it, entries are left out. */
export const MAX_NAMED_SKILLS = 500

const digest = z.string().regex(PACKAGE_DIGEST_PATTERN)
const text = z.string().min(1).max(512)
const ref = z.object({ kind: z.enum(PACKAGE_KINDS), key: z.string().regex(PACKAGE_KEY_PATTERN), digest })

const installed = z.object({ identity: text, version: text, digest, level: z.enum(['builtin', 'org', 'agent']), ref: ref.optional() })
const file = z.object({ placeId: text, path: text, fingerprint: digest, group: z.enum(['place', 'agent', 'workspace']) })
const person = z.object({ identity: text, version: text, digest, ref: ref.optional() })

function entries<T>(schema: z.ZodType<T>, value: unknown, what: string): T[] {
  if (!Array.isArray(value)) return []
  const kept: T[] = []
  for (const item of value.slice(0, MAX_NAMED_SKILLS)) {
    const parsed = schema.safeParse(item)
    if (parsed.success) kept.push(parsed.data)
    else logger.warn(`a ${what} entry the dispatch named does not fit its shape and is left out`)
  }
  if (value.length > MAX_NAMED_SKILLS) logger.warn(`the dispatch named more than ${MAX_NAMED_SKILLS} ${what} entries; the rest are left out`)
  return kept
}

export function runSkillInputs(ctx: RunContextPayload, place: SkillPlace, agentId: string, personId: string | null): RunSkillInputs | null {
  const raw = ctx as unknown as Record<string, unknown>
  if (raw.installedSkills === undefined && raw.fileSkills === undefined && raw.personSkills === undefined) return null
  return {
    place: { ownerType: place.ownerType, ownerId: place.ownerId },
    agentId,
    personId,
    installed: entries(installed, raw.installedSkills, 'installed skill'),
    files: entries(file, raw.fileSkills, 'skill in files'),
    person: entries(person, raw.personSkills, 'personal skill'),
  }
}
