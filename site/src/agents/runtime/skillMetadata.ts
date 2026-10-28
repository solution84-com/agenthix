/**
 * What a scan reports from a skill's `SKILL.md` (spec part 4, F3 and FV2): its name and description, and the
 * `version` and `identity` hq writes under `metadata` when it publishes a place's skill or copies an installed one in.
 * Read, never trusted: each value is bounded, and a scan only reports it for hq to show.
 */
import { frontMatterString } from './opencode/skillDescription'

const BOM = String.fromCharCode(0xfeff)
const MAX_NAME = 200
const MAX_DESCRIPTION = 1024
const MAX_META = 200

export type SkillMdSummary = { name: string; description: string; version?: string; identity?: string }

function header(text: string): string[] | null {
  const lines = (text.startsWith(BOM) ? text.slice(BOM.length) : text).split(/\r\n|\r|\n/)
  if (lines[0]?.trimEnd() !== '---') return null
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---')
  return close === -1 ? null : lines.slice(1, close)
}

function scalar(raw: string): string | undefined {
  const value = raw.replace(/\s+#.*$/, '').trim()
  const unquoted = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value
  return unquoted === '' || unquoted.length > MAX_META ? undefined : unquoted
}

/** `metadata.version` and `metadata.identity`, from a `metadata:` block of plain or quoted values. */
function metadataOf(lines: string[]): { version?: string; identity?: string } {
  const at = lines.findIndex(l => /^metadata[ \t]*:[ \t]*(?:#.*)?$/.test(l))
  if (at === -1) return {}
  const found: { version?: string; identity?: string } = {}
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '') continue
    if (!/^[ \t]/.test(line)) break
    const match = line.match(/^[ \t]+(version|identity)[ \t]*:(.*)$/)
    if (match && found[match[1] as 'version' | 'identity'] === undefined) {
      const value = scalar(match[2])
      if (value !== undefined) found[match[1] as 'version' | 'identity'] = value
    }
  }
  return found
}

export function summariseSkillMd(text: string): SkillMdSummary {
  const lines = header(text)
  return {
    name: (frontMatterString(text, 'name') ?? '').slice(0, MAX_NAME),
    description: (frontMatterString(text, 'description') ?? '').slice(0, MAX_DESCRIPTION),
    ...(lines ? metadataOf(lines) : {}),
  }
}
