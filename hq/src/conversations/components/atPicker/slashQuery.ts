/**
 * The pure parts of the message box's `/` picker (skills spec part 5, *Picking a skill*): where a `/` being typed at the
 * start of the message ends, and the skills it lists — narrowed on name and description, in groups by where each comes
 * from. One skill per message, so only the first word of the message opens it: a `/` later in a sentence ("and/or",
 * `src/app`) stays text.
 */
import type { PickerItem } from './atQuery'
import type { AtQuery } from './atQuery'

/** At most this much typed after the `/`; a name is never longer. */
export const SLASH_MAX_FRAGMENT = 64

/** The `/…` that is the whole text before the caret: a `/` at the very start, then no space up to the caret. */
export function slashQueryAt(text: string, caret: number | null): AtQuery | null {
  if (caret === null || caret > text.length) return null
  const match = /^\/(\S*)$/.exec(text.slice(0, caret))
  if (!match || match[1].length > SLASH_MAX_FRAGMENT) return null
  return { start: 0, end: caret, fragment: match[1] }
}

/** How a picked skill reads in the message: `/name`, where it was typed. */
export const skillMark = (name: string): string => `/${name}`

/** Whether the text still begins with the picked skill's mark as a word of its own; if not, the skill is no longer picked. */
export function holdsSkill(text: string, name: string): boolean {
  const mark = skillMark(name)
  return text.startsWith(mark) && (text.length === mark.length || /\s/.test(text[mark.length]))
}

/** The person's words: the text without the mark of the skill picked. */
export function withoutSkill(text: string, name: string | null): string {
  return name && holdsSkill(text, name) ? text.slice(skillMark(name).length).trim() : text.trim()
}

/** What listConversationSkills answers for one skill. */
export type SkillRow = {
  name: string
  title: string
  description: string
  source: 'builtin' | 'every-agent' | 'this-agent' | 'place' | 'yours'
  sourceName: string
  detail: string
}

export type SkillGroup = { id: string; heading: string; items: PickerItem[] }

const ORDER: SkillRow['source'][] = ['builtin', 'every-agent', 'this-agent', 'place', 'yours']

/** Name and description hold what was typed, ignoring case; a name that starts with it comes first in its group. */
export function narrowSkills(rows: SkillRow[], fragment: string): SkillRow[] {
  const f = fragment.trim().toLowerCase()
  if (!f) return rows
  const starts = (r: SkillRow) => r.title.toLowerCase().startsWith(f) || r.name.toLowerCase().startsWith(f)
  const holds = (r: SkillRow) => starts(r) || [r.title, r.name, r.description].some(s => s.toLowerCase().includes(f))
  return rows.filter(holds).sort((a, b) => Number(starts(b)) - Number(starts(a)))
}

/** The picker's groups: built in, the organisation's, this agent's, the place's, then the person's own. */
export function skillGroups(rows: SkillRow[], fragment: string): SkillGroup[] {
  const shown = narrowSkills(rows, fragment)
  const groups: SkillGroup[] = []
  for (const source of ORDER) {
    for (const row of shown.filter(r => r.source === source)) {
      const id = `${source}:${row.sourceName}`
      let group = groups.find(g => g.id === id)
      if (!group) groups.push(group = { id, heading: row.sourceName, items: [] })
      group.items.push({ id: `skill:${row.name}`, reference: row.name, label: row.title, detail: row.description || row.detail })
    }
  }
  return groups
}

export const skillItems = (groups: SkillGroup[]): PickerItem[] => groups.flatMap(g => g.items)
