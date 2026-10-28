/**
 * The checks that run as a person edits (board U3b, E5; spec part 2 *Validation*, R8): the Agent Skills rules for the
 * name and description, every file SKILL.md names being in the skill, and header keys a run drops flagged. The server
 * runs the same rules on every save (`validation.ts`) and refuses an error; these show first, so a save isn't the
 * first a person hears of one. Warnings never stop a save.
 */
import { isAssetName } from '@agenthix/core'
import { readSkillMd } from '../../skillFile'
import { BODY_LINES_WARNING, DESCRIPTION_MAX, KEPT_WHEN_RUN } from '../../validation'
import { SKILL_FILE_NAME, textOf, type EditorFile } from './editorFiles'

export type EditorCheck = { level: 'ok' | 'warning' | 'error'; text: string }

/** Folders the Agent Skills format lays out; a path under one of these in SKILL.md is a file the skill names. */
const KNOWN_FOLDERS = ['scripts', 'references', 'assets', 'templates']
const TRAILING = /[.,;:!?)\]}'"`>]+$/

/** The files a SKILL.md body points to, as written: paths under a folder of the skill, and relative links. */
export function namedFiles(body: string, folders: readonly string[]): string[] {
  const named = new Set<string>()
  const roots = new Set([...KNOWN_FOLDERS, ...folders])
  const clean = (raw: string) => raw.replace(TRAILING, '').replace(/^\.\//, '')
  for (const m of body.matchAll(/(?<![\w:/.~-])((?:[\w.-]+\/)+[\w.-]+)/g)) {
    const path = clean(m[1]!)
    const first = path.split('/')[0]!
    if (roots.has(first) && /\.[A-Za-z0-9]+$/.test(path) && !path.includes('..')) named.add(path)
  }
  for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1]!.split('#')[0]!
    if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.startsWith('//') || target.includes('..')) continue
    const path = clean(target)
    if (/\.[A-Za-z0-9]+$/.test(path)) named.add(path)
  }
  return [...named].sort()
}

export function checkSkill(name: string, files: readonly EditorFile[]): EditorCheck[] {
  const checks: EditorCheck[] = []
  const skill = files.find(f => f.path === SKILL_FILE_NAME)
  const text = skill ? textOf(skill.bytes) : null
  if (!skill || text === null) {
    return [{ level: 'error', text: `A skill needs a ${SKILL_FILE_NAME}: the file agents read. Add one.` }]
  }
  const md = readSkillMd(text)
  const errors: string[] = []
  if (!isAssetName(name)) errors.push(`The name \u201c${name}\u201d must be 1 to 64 lowercase letters, digits and single hyphens.`)
  if (md.headerError) errors.push(`${SKILL_FILE_NAME} can’t be read: ${md.headerError}.`)
  else if (!md.header) errors.push(`${SKILL_FILE_NAME} needs front matter, between two --- lines, with a description.`)
  else {
    const description = md.header.description
    if (typeof description !== 'string' || description.trim() === '') errors.push('The description is empty: say what the skill does and when to use it.')
    else if (description.trim().length > DESCRIPTION_MAX) errors.push(`The description is ${description.trim().length} characters; at most ${DESCRIPTION_MAX}.`)
    if (md.header.name !== undefined && typeof md.header.name !== 'string') errors.push(`${SKILL_FILE_NAME}’s name must be text.`)
  }
  for (const e of errors) checks.push({ level: 'error', text: e })
  if (errors.length === 0) checks.push({ level: 'ok', text: 'Name and description fit the Agent Skills rules' })

  const present = new Set(files.map(f => f.path))
  const folders = [...new Set(files.filter(f => f.path.includes('/')).map(f => f.path.split('/')[0]!))]
  const named = namedFiles(md.body, folders)
  const missing = named.filter(p => !present.has(p))
  if (missing.length) {
    for (const p of missing) checks.push({ level: 'error', text: `${SKILL_FILE_NAME} names ${p}, which isn’t in the skill. Add it or take the mention out.` })
  } else if (named.length) {
    checks.push({ level: 'ok', text: `Every file this skill names exists: ${named.join(', ')}` })
  }

  if (md.header) {
    if (typeof md.header.name === 'string' && md.header.name.trim() !== name) {
      checks.push({ level: 'warning', text: `${SKILL_FILE_NAME} calls itself \u201c${md.header.name.trim()}\u201d; it runs as ${name}.` })
    }
    for (const key of Object.keys(md.header)) {
      if (!(KEPT_WHEN_RUN as readonly string[]).includes(key)) checks.push({ level: 'warning', text: `${key} in the header is ignored when run` })
    }
  }
  const lines = md.body.split('\n').length
  if (lines > BODY_LINES_WARNING) checks.push({ level: 'warning', text: `${SKILL_FILE_NAME} is ${lines} lines long; agents follow a skill best under ${BODY_LINES_WARNING}.` })
  return checks
}

export const hasError = (checks: readonly EditorCheck[]): boolean => checks.some(c => c.level === 'error')
