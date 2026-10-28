/**
 * A skill's `SKILL.md`, read the way the Agent Skills format writes it: YAML front matter between two `---` lines,
 * then the body. Read from untrusted packages, so the YAML is parsed with aliases bounded and duplicate keys refused.
 */
import { parse } from 'yaml'
import type { PackageFile } from '../library/packages/packageZip'

export const SKILL_FILE = 'SKILL.md'
const BOM = String.fromCharCode(0xfeff)

export type SkillMd = {
  /** The front matter as a mapping; null when there is none, it isn't closed, or it isn't a mapping. */
  header: Record<string, unknown> | null
  /** Why the front matter couldn't be read, when it is there but broken. */
  headerError: string | null
  body: string
}

export function readSkillMd(text: string): SkillMd {
  const clean = text.startsWith(BOM) ? text.slice(BOM.length) : text
  const lines = clean.split(/\r\n|\r|\n/)
  if (lines[0]?.trimEnd() !== '---') return { header: null, headerError: null, body: clean }
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---')
  if (close === -1) return { header: null, headerError: 'its front matter is never closed with ---', body: clean }
  const body = lines.slice(close + 1).join('\n').replace(/^\n+/, '')
  try {
    const parsed: unknown = parse(lines.slice(1, close).join('\n'), { maxAliasCount: 10, uniqueKeys: true })
    if (parsed === null || parsed === undefined) return { header: {}, headerError: null, body }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return { header: null, headerError: 'its front matter is not a list of keys', body }
    return { header: parsed as Record<string, unknown>, headerError: null, body }
  } catch (err) {
    return { header: null, headerError: `its front matter is not valid YAML (${err instanceof Error ? err.message.split('\n')[0] : 'unreadable'})`, body }
  }
}

export function skillMdOf(files: PackageFile[]): SkillMd | null {
  const file = files.find(f => f.path === SKILL_FILE)
  return file ? readSkillMd(file.content.toString('utf-8')) : null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** What a person reads as the skill's name: its title in SKILL.md (`name` when it isn't the identity, else the first heading), else the identity's name. */
export function skillTitle(md: SkillMd | null, name: string): string {
  const own = text(md?.header?.name)
  if (own && own !== name) return own.slice(0, 200)
  const heading = md?.body.match(/^#[ \t]+(.+)$/m)?.[1]?.trim()
  return heading ? heading.slice(0, 200) : name
}

export function skillDescription(md: SkillMd | null): string {
  return text(md?.header?.description) ?? ''
}

/** A version in the front matter (`version`, or `metadata.version`): SemVer as written, or a whole number N as N.0.0. */
export function skillMdVersion(md: SkillMd | null): string | null {
  const meta = md?.header?.metadata
  const raw = md?.header?.version ?? (meta && typeof meta === 'object' ? (meta as Record<string, unknown>).version : undefined)
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return `${raw}.0.0`
  if (typeof raw === 'string' && /^(0|[1-9][0-9]{0,8})$/.test(raw.trim())) return `${raw.trim()}.0.0`
  return typeof raw === 'string' ? raw.trim() : null
}
