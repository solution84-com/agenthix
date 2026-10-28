/**
 * The one check every skill passes on every save, upload and install (spec part 2 *Validation*, R8), against the
 * Agent Skills rules: a name of 1–64 lowercase letters, digits and single hyphens; a `SKILL.md` whose front matter
 * reads and holds a description of 1–1024 characters; files a disk stores exactly as listed, within the package size.
 * Warnings never refuse: a body over 500 lines, and front matter keys a run drops (`skillFrontmatter.ts` on the site
 * keeps only the keys below), which are *ignored when run*. Installing grants no capability (R10), so nothing here
 * is a permission.
 */
import { checkAssetFileList, isAssetName, PACKAGE_MAX_BYTES } from '@agenthix/core'
import type { PackageFile } from '../library/packages/packageZip'
import { SKILL_FILE, skillMdOf } from './skillFile'

export const DESCRIPTION_MAX = 1024
export const BODY_LINES_WARNING = 500
/** The front matter a run keeps; everything else is dropped when the skill is staged. */
export const KEPT_WHEN_RUN = ['name', 'description', 'when_to_use', 'argument-hint', 'disable-model-invocation', 'user-invocable'] as const

export type Validation = { errors: string[]; warnings: string[] }

/** `files` are relative to the skill's own folder; a `package.json` beside `SKILL.md` is the package's manifest. */
export function validateSkill(name: string, files: PackageFile[]): Validation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!isAssetName(name)) errors.push(`The name “${name}” must be 1 to 64 lowercase letters, digits and single hyphens.`)
  const problems = checkAssetFileList(files.map(f => f.path))
  if (problems.length) errors.push(`Its files can't be stored as listed: ${problems.map(p => p.path).slice(0, 3).join(', ')}.`)
  const total = files.reduce((sum, f) => sum + f.content.length, 0)
  if (total > PACKAGE_MAX_BYTES) errors.push(`Its files are ${total} bytes; the limit is ${PACKAGE_MAX_BYTES}.`)

  const md = skillMdOf(files)
  if (!md) {
    errors.push(`It has no ${SKILL_FILE}.`)
    return { errors, warnings }
  }
  if (md.headerError) errors.push(`${SKILL_FILE} can't be read: ${md.headerError}.`)
  else if (!md.header) errors.push(`${SKILL_FILE} needs front matter with a description.`)
  else {
    const description = md.header.description
    if (typeof description !== 'string' || description.trim() === '') errors.push(`${SKILL_FILE} needs a description: what the skill does and when to use it.`)
    else if (description.trim().length > DESCRIPTION_MAX) errors.push(`${SKILL_FILE}'s description is ${description.trim().length} characters; at most ${DESCRIPTION_MAX}.`)
    const own = md.header.name
    if (own !== undefined && typeof own !== 'string') errors.push(`${SKILL_FILE}'s name must be text.`)
    else if (typeof own === 'string' && own.trim() !== name) warnings.push(`${SKILL_FILE} calls itself “${own.trim()}”; it runs as ${name}.`)
    for (const key of Object.keys(md.header)) {
      if (!(KEPT_WHEN_RUN as readonly string[]).includes(key)) warnings.push(`“${key}” in ${SKILL_FILE} is ignored when run.`)
    }
  }
  const lines = md.body.split('\n').length
  if (lines > BODY_LINES_WARNING) warnings.push(`${SKILL_FILE} is ${lines} lines long; agents follow a skill best under ${BODY_LINES_WARNING}.`)
  return { errors, warnings }
}
