import { HttpError } from 'wasp/server'
import type { GetSkillLibrary, GetInstalledSkillVersions } from 'wasp/server/operations'
import { parseSemVer } from '@agenthix/core'
import { listLibrarySkills, listShelfSkills, type LibrarySkillRow } from './skillsLibraryService'

type GetSkillLibraryArgs = { scope: 'PLATFORM' | 'ORG'; orgId?: string }

/** Everyone in the organisation reads the Library. */
export const getSkillLibrary: GetSkillLibrary<GetSkillLibraryArgs, LibrarySkillRow[]> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return listLibrarySkills(args?.scope === 'ORG' ? 'ORG' : 'PLATFORM')
}

/** The shelf's version of each named skill, as the whole number an agent's copy records (its major version). */
export const getInstalledSkillVersions: GetInstalledSkillVersions<{ slugs: string[] }, Record<string, number>> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const wanted = new Set(Array.isArray(args?.slugs) ? args.slugs : [])
  if (wanted.size === 0) return {}
  const shelf = await listShelfSkills()
  return Object.fromEntries(shelf.filter(s => wanted.has(s.slug)).map(s => [s.slug, parseSemVer(s.version)?.major ?? 1]))
}
