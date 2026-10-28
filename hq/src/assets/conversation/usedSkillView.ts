/**
 * A used skill as the panel beside the thread shows it, and a run's work steps with each used skill named as people
 * read it (spec part 5 *Seeing it used*). Both go through `usedSkillOrigin`, so the access check is made every time
 * the skill is named or opened, never once for the run (security review M6). Content comes from hq's records by
 * digest, never from the site.
 */
import { chooseFileKind, looksLikeText, TEXT_SNIFF_BYTES, type RunSkillUse, type WorkStep } from '@agenthix/core'
import { readContent } from '../content'
import { SKILL_FILE } from '../skillFile'
import { usedSkillOrigin, usedSkillLabel, type UsedSkillDeps, type UsedSkillOrigin } from './usedSkillOrigin'
import { usedSkillsOf } from './usedSkillRecord'
import type { UsedSkillFileView, UsedSkillStepView, UsedSkillView } from './usedSkillTypes'

/** The view, or null when the viewer may not see it (or there is no such file in it). */
export async function usedSkillView(deps: UsedSkillDeps, viewerId: string, use: RunSkillUse, path?: string): Promise<UsedSkillView | null> {
  const origin = await usedSkillOrigin(deps, viewerId, use)
  if (!origin) return null
  const view: UsedSkillView = {
    name: use.name, level: origin.level, title: origin.title, where: origin.where, version: origin.version,
    identity: origin.identity, path: origin.path, fingerprint: origin.fingerprint, publisher: origin.publisher,
    newer: origin.newer, kept: null, openHref: origin.level === 'installed' || origin.level === 'built-in' ? '/library' : null,
  }
  if (!origin.digest) return view
  const files = await readContent(origin.digest, deps.db)
  const wanted = path ?? SKILL_FILE
  const opened = files.find(f => f.path === wanted) ?? (path === undefined ? files[0] : undefined)
  if (!opened) return path === undefined ? view : null
  view.kept = {
    files: files.map((f): UsedSkillFileView => {
      const kind = chooseFileKind(f.path, looksLikeText(f.content.subarray(0, TEXT_SNIFF_BYTES)))
      return { path: f.path, size: f.content.length, kind: kind.kind, contentType: kind.contentType, ...(kind.language ? { language: kind.language } : {}) }
    }),
    opened: { path: opened.path, base64: opened.content.toString('base64') },
  }
  return view
}

/**
 * A run's steps as lines, with a used skill named by its person-facing name, where it came from and its version, and
 * pointing at the skill, when the viewer may see it. Otherwise the step stays as it was, with the staged name.
 */
export async function usedSkillSteps(deps: UsedSkillDeps, viewerId: string, steps: WorkStep[], record: unknown): Promise<UsedSkillStepView[]> {
  const used = usedSkillsOf(record)
  const origins = new Map<string, Promise<UsedSkillOrigin | null>>()
  return Promise.all(steps.map(async (s): Promise<UsedSkillStepView> => {
    const text = [s.verb, s.text].filter(Boolean).join(' ')
    const name = s.target?.type === 'skill' ? s.target.name : null
    const use = name ? used.get(name) : undefined
    if (!name || !use) return { text }
    if (!origins.has(name)) origins.set(name, usedSkillOrigin(deps, viewerId, use))
    const origin = await origins.get(name)!
    return origin ? { text: usedSkillLabel(origin), skill: { name } } : { text }
  }))
}
