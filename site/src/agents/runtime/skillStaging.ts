/**
 * Skills staged for one run (adr-0084, spec part 1 *The levels*, security review M2). Each skill is staged under
 * `<source>-<slug>`, or `workspace-<n>-<slug>`, from the bytes `runSkillSources` read and checked, never from the
 * folder again, so what was checked is what the run gets. Every staged name is unique within the run: two skills that
 * would share one name stage neither, and both are recorded as refused. The staged SKILL.md's front matter is rebuilt
 * (skillFrontmatter.ts): its `name` matches its directory, as skill names must, and keys that would run commands or
 * change the harness's behaviour are left out. Nothing here throws out of `stageSkills`: a skill that cannot be
 * staged is refused, never a failed run.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { SkillSource } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { isModelInvocable, isUserInvocable, stagedSkillMd } from './skillFrontmatter'
import { runSkillSources, type RunSkillInputs, type SkillCandidate, type SkillOrigin, type SkillRefusal } from './skillSources'
import { SKILL_FILE } from './skillTree'

const logger = new Logger('SkillStaging')

export type { RunSkillInputs } from './skillSources'

/**
 * `userInvocable`: the skill doesn't set `user-invocable: false`, so a person may pick it; `modelInvocable`: it doesn't
 * set `disable-model-invocation: true`, so the model may load it with its skill tool (pickedSkill.ts).
 */
export type StagedSkill = {
  source: SkillSource; slug: string; name: string; fingerprint: string; userInvocable: boolean; modelInvocable: boolean
} & SkillOrigin

export type StagingResult = { staged: StagedSkill[]; refused: SkillRefusal[] }

const CLASH = 'another skill in this run would have the same name'

async function writeSkill(candidate: SkillCandidate, destSkillsDir: string): Promise<void> {
  const dest = path.join(destSkillsDir, candidate.name)
  await fs.mkdir(dest, { recursive: true })
  for (const file of candidate.files) {
    const to = path.join(dest, ...file.path.split('/'))
    await fs.mkdir(path.dirname(to), { recursive: true })
    const content = file.path === SKILL_FILE ? stagedSkillMd(file.content.toString('utf-8'), candidate.name) : file.content
    await fs.writeFile(to, content)
  }
}

export async function stageSkills(inputs: RunSkillInputs | null, destSkillsDir: string): Promise<StagingResult> {
  const { candidates, refused } = await runSkillSources(inputs)
  const byName = new Map<string, SkillCandidate[]>()
  for (const c of candidates) byName.set(c.name, [...(byName.get(c.name) ?? []), c])

  const staged: StagedSkill[] = []
  for (const candidate of candidates) {
    const { source, slug, name, fingerprint, origin } = candidate
    if ((byName.get(name)?.length ?? 0) > 1) {
      refused.push({ source, name, fingerprint, origin, reason: CLASH })
      continue
    }
    try {
      await writeSkill(candidate, destSkillsDir)
      const skillMd = candidate.files.find(f => f.path === SKILL_FILE)?.content.toString('utf-8') ?? ''
      staged.push({ source, slug, name, fingerprint, userInvocable: isUserInvocable(skillMd), modelInvocable: isModelInvocable(skillMd), ...origin })
    } catch (err) {
      logger.warn(`skill ${name} could not be staged: ${(err as Error).message}`)
      await fs.rm(path.join(destSkillsDir, name), { recursive: true, force: true }).catch(() => {})
      refused.push({ source, name, fingerprint, origin, reason: 'it could not be written for the run' })
    }
  }
  for (const r of refused) logger.warn(`skill ${r.name ?? r.origin.path ?? r.origin.identity ?? r.source} not staged: ${r.reason}`)
  return { staged, refused }
}
