/**
 * A place's knowledge, as the Knowledge tool lists it: every file under
 * `knowledge/` but its index, newest first, titled and summarised from the
 * index's line for it when there is one.
 *
 * Agents are told to keep `knowledge/INDEX.md` with one line per topic file,
 * and nothing fixes how that line is written (the knowledge convention, still to
 * be settled, decides the format, and tags with it). So the parser reads the shapes agents write — a Markdown
 * link, or a file name, then the summary — and a line it cannot tie to a file
 * inside `knowledge/` says nothing rather than something guessed. Pure: the
 * listing and the index's text come from the site.
 */
import path from 'node:path'
import type { OwnerFolderFile } from '@agenthix/core'

export const KNOWLEDGE_INDEX_FILE = 'INDEX.md'

export type KnowledgeIndexLine = {
  /** Null when the line names the file without giving it a title. */
  title: string | null
  summary: string
}

/** A type alias, not an interface: a query's result must be a plain JSON object to Wasp. */
export type KnowledgeTopic = {
  path: string
  title: string
  summary: string
  /** Always empty until the knowledge convention settles how tags are stored. */
  tags: string[]
  modifiedAt: string
}

const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/
const LINK = /\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/
const NAMED_FILE = /^`?([^\s`]+\.[A-Za-z0-9]+)`?(?=[\s:—–-]|$)/
const SEPARATOR = /^\s*(?:[—–:-]\s*)?/

/** A link address as a path relative to `knowledge/`, or null for anything that is not one. */
function knowledgePath(address: string): string | null {
  let target = address.split('#')[0]!.split('?')[0]!
  try {
    target = decodeURIComponent(target)
  } catch {
    return null
  }
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.includes('\\')) return null
  const normalised = path.posix.normalize(target)
  if (normalised === '.' || normalised === '..' || normalised.startsWith('../')) return null
  return normalised
}

export function parseKnowledgeIndex(text: string): Map<string, KnowledgeIndexLine> {
  const lines = new Map<string, KnowledgeIndexLine>()
  for (const raw of text.split(/\r?\n/)) {
    const marker = LIST_MARKER.exec(raw)
    if (!marker) continue
    const line = raw.slice(marker[0].length).trim()

    let entry: { file: string | null; title: string | null; rest: string } | null = null
    const link = LINK.exec(line)
    if (link) {
      entry = { file: knowledgePath(link[2]!), title: link[1]!.trim(), rest: line.slice(link.index + link[0].length) }
    } else {
      const named = NAMED_FILE.exec(line)
      if (named) entry = { file: knowledgePath(named[1]!), title: null, rest: line.slice(named[0].length) }
    }
    if (!entry?.file || lines.has(entry.file)) continue
    lines.set(entry.file, { title: entry.title, summary: entry.rest.replace(SEPARATOR, '').trim() })
  }
  return lines
}

export function knowledgeTopics(files: OwnerFolderFile[], indexText: string | null): KnowledgeTopic[] {
  const index = indexText ? parseKnowledgeIndex(indexText) : new Map<string, KnowledgeIndexLine>()
  return files
    .filter(file => file.path !== KNOWLEDGE_INDEX_FILE)
    .map(file => {
      const line = index.get(file.path)
      return {
        path: file.path,
        title: line?.title ?? path.posix.basename(file.path),
        summary: line?.summary ?? '',
        tags: [],
        modifiedAt: file.modifiedAt,
      }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path))
}
