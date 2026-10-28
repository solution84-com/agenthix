/**
 * What the `/` picker shows of a skill, read from its `SKILL.md`: the name a person reads, the first line of its
 * description, and whether its author kept it for the model (`user-invocable: false`, which Claude Code hides from `/`
 * too). The text is untrusted content, so each part is bounded.
 */
import { readSkillMd, skillDescription, skillTitle } from '../../assets/skillFile'

export type SkillFacts = { title: string; description: string; userInvocable: boolean }

const MAX_DESCRIPTION = 200

function firstLine(description: string): string {
  const first = description.split(/\r\n|\r|\n/)[0]?.trim() ?? ''
  return first.length > MAX_DESCRIPTION ? `${first.slice(0, MAX_DESCRIPTION - 1)}…` : first
}

/**
 * A file skill hq holds no version of, from what the last scan read of its front matter (`PlaceSkill`'s name and
 * description). The scan keeps no `user-invocable`, so it is listed; the site checks a pick against the staged file.
 */
export function scannedFacts(scanned: { name: string; description: string }, fallbackName: string): SkillFacts {
  return { title: scanned.name.trim().slice(0, 200) || fallbackName, description: firstLine(scanned.description), userInvocable: true }
}

export function skillFacts(skillMd: string | null, fallbackName: string): SkillFacts {
  const md = skillMd === null ? null : readSkillMd(skillMd)
  const flag = md?.header?.['user-invocable']
  return {
    title: skillTitle(md, fallbackName),
    description: firstLine(skillDescription(md)),
    userInvocable: !(flag === false || (typeof flag === 'string' && flag.trim().toLowerCase() === 'false')),
  }
}
