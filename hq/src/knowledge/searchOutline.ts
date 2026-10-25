/**
 * `search_knowledge` with an empty pattern (K1): each level's sections and tags, from the itemiser on the sites and
 * from the guide's own index, so an agent can see how a place lays its knowledge out before it searches. Held to the
 * same 8,000 characters; the most used tags first.
 */
import type { KnowledgeDeps } from './deps'
import { levelSearchNote } from './messages'
import { withDeadline } from './deadline'
import type { Level } from './reach'
import { KNOWLEDGE_SEARCH_MAX_CHARS } from '../server/controlplane/knowledgeToolSchemas'
import { platformGuideMissingMessage, platformGuideNotice } from './platformGuide'

const MAX_TAGS_SHOWN = 60

function sectionsLine(sections: { path: string; pageCount: number }[]): string {
  if (!sections.length) return '  sections: none (every page is at the top)'
  return `  sections: ${sections.map(s => `${s.path} (${s.pageCount})`).join(', ')}`
}

async function outlineOne(deps: KnowledgeDeps, level: Level): Promise<string[]> {
  if (level.kind === 'platform') {
    const pages = deps.guide.outline()
    if (!pages) return [`[platform: ${platformGuideMissingMessage()}]`]
    const sections = new Map<string, number>()
    for (const p of pages) {
      const at = p.name.lastIndexOf('/')
      if (at > 0) sections.set(p.name.slice(0, at), (sections.get(p.name.slice(0, at)) ?? 0) + 1)
    }
    return [
      `platform: ${pages.length} pages. [${platformGuideNotice()}]`,
      sectionsLine([...sections].map(([path, pageCount]) => ({ path, pageCount }))),
      '  tags: none (the guide\'s pages have none); also platform:tools.md and platform:glossary.md',
    ]
  }
  const answer = await withDeadline(deps.sites.list(level.owner, deps.searchTimeLimitMs), deps.searchTimeLimitMs)
  if (answer === 'timeout') return [levelSearchNote(level.name, 'timeout')]
  if (!answer.ok) return [levelSearchNote(level.name, answer.why)]
  const pages = answer.value.pages ?? []
  const tags = new Map<string, number>()
  for (const p of pages) for (const t of p.tags) tags.set(t, (tags.get(t) ?? 0) + 1)
  const ranked = [...tags].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const shown = ranked.slice(0, MAX_TAGS_SHOWN).map(([t, n]) => `${t} (${n})`).join(', ')
  const more = ranked.length > MAX_TAGS_SHOWN ? `, and ${ranked.length - MAX_TAGS_SHOWN} more` : ''
  return [
    `${level.name}: ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}${answer.value.truncated ? ' (the listing stopped at its bound)' : ''}`,
    sectionsLine(answer.value.sections ?? []),
    `  tags: ${shown || 'none'}${more}`,
  ]
}

export async function outlineLevels(deps: KnowledgeDeps, levels: Level[]): Promise<string> {
  const blocks = await Promise.all(levels.map(l => outlineOne(deps, l).catch(() => [levelSearchNote(l.name, 'failed')])))
  const text = blocks.map(b => b.join('\n')).join('\n')
  if (text.length <= KNOWLEDGE_SEARCH_MAX_CHARS) return text
  const note = '\n[Cut at 8,000 characters. Search one level with scope, or a section with path.]'
  return text.slice(0, KNOWLEDGE_SEARCH_MAX_CHARS - note.length) + note
}
