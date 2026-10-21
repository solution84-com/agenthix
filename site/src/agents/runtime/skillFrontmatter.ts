/**
 * The SKILL.md a run is given for a staged skill: its body as written, under
 * front matter Agenthix rebuilds rather than copies.
 *
 * A harness reads more from a skill's front matter than its name and
 * description. Claude Code (2.1.x) runs a skill's `hooks` as commands for as
 * long as the skill is active, widens tools with `allowed-tools`, switches the
 * model with `model` and `effort`, runs the skill in a subagent with `context`
 * and `agent`, and reads plugin keys (`mcpServers`, `settings`, `agents`, …)
 * besides. None of that passes the tool gate, and skills in a boundary's files
 * are written by agents, so only keys that describe the skill are kept: the
 * name (rewritten to the staged one, as a skill's name must match its folder),
 * the description and when to use it, the argument hint, and the two flags
 * that only narrow who may invoke it. Every value is written back quoted, so
 * nothing in it can open another key or end the front matter early.
 */
import { frontMatterString } from './opencode/skillDescription'

const BOM = String.fromCharCode(0xfeff)
const STRING_KEYS = ['description', 'when_to_use', 'argument-hint'] as const
const FLAG_KEYS = ['disable-model-invocation', 'user-invocable'] as const

/**
 * A YAML double-quoted scalar (JSON's escapes are YAML's), with every `---`
 * broken up: Claude Code ends front matter at the first `---` it meets,
 * wherever it is on the line.
 */
function quoted(value: string): string {
  return JSON.stringify(value).replace(/-(?=--)/g, '\\u002d')
}

function flagOf(header: string[], key: string): boolean | undefined {
  const pattern = new RegExp(`^(?:${key}|"${key}"|'${key}')[ \\t]*:[ \\t]*(true|false)[ \\t]*(?:#.*)?$`)
  for (const line of header) {
    const match = line.match(pattern)
    if (match) return match[1] === 'true'
  }
  return undefined
}

/** The front matter's lines and the text after it, byte for byte; null when there is none, or it is not closed. */
function split(text: string): { header: string[]; body: string } | null {
  const pieces = text.split(/(\r\n|\r|\n)/)
  const lines = pieces.filter((_, i) => i % 2 === 0)
  if (lines[0]?.trimEnd() !== '---') return null
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---')
  if (close === -1) return null
  return { header: lines.slice(1, close), body: pieces.slice(2 * close + 1).join('') }
}

export function stagedSkillMd(skillMd: string, name: string): string {
  const text = skillMd.startsWith(BOM) ? skillMd.slice(BOM.length) : skillMd
  const parts = split(text)
  const header = [`name: ${name}`]
  if (parts) {
    for (const key of STRING_KEYS) {
      const value = frontMatterString(text, key)
      if (value !== undefined) header.push(`${key}: ${quoted(value)}`)
    }
    for (const key of FLAG_KEYS) {
      const value = flagOf(parts.header, key)
      if (value !== undefined) header.push(`${key}: ${value}`)
    }
  }
  // Without closed front matter the whole text is the body, never reinterpreted.
  return `---\n${header.join('\n')}\n---${parts ? parts.body : `\n\n${text}`}`
}
