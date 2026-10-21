/**
 * Skill types and frontmatter parsing. Active skills are package content
 * (see `packages/skillFiles.ts`).
 */

export interface SkillEntry {
  slug: string
  name: string
  description: string
  content: string  // full SKILL.md text including frontmatter
  version: number
  installedFrom: string | null  // Skill DB id — null for custom skills
}

export interface InstallableSkill {
  id: string
  slug: string
  name: string
  description: string
  assetPath: string
  version: number
  scope: string
  orgId: string | null
}

/** Extract name, description, and provenance fields from YAML frontmatter in a SKILL.md string. */
export function parseFrontmatter(content: string): {
  name: string
  description: string
  version: number
  installedFrom: string | null
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { name: 'Unnamed', description: '', version: 1, installedFrom: null }
  const fm = match[1]
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? 'Unnamed'
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ''
  const version = parseInt(fm.match(/^version:\s*(\d+)$/m)?.[1] ?? '1', 10)
  const installedFrom = fm.match(/^installed_from:\s*(.+)$/m)?.[1]?.trim() ?? null
  return { name, description, version, installedFrom }
}
