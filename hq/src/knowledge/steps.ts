/**
 * What a knowledge call tells the conversation's work step (agent knowledge spec, part 5, C1–C3): the page a change
 * made and the versions *See change* and *Undo* open, the levels a search covered, the platform guide's page a read
 * used. Told through the reach's `onStep`, which only a conversation's turn sets; a run's reach has none.
 */
import { checkPageChange, titleFromPageName, type KnowledgeChangeResult, type KnowledgeStepView } from '@agenthix/core'
import type { KnowledgeReach, Level } from './reach'

type SiteLevel = Extract<Level, { kind: 'org' | 'place' }>
type Done = Extract<KnowledgeChangeResult, { outcome: 'done' }>

/** What the call asked for, which a step's one line is made from. */
export type ChangeAsked =
  | { tool: 'write'; content: string }
  /** `content`: the page after the edit, when it was read back for its title. */
  | { tool: 'edit'; old_string: string; new_string: string; content?: string }
  | { tool: 'delete' }

const ONE_LINE = 80

function clip(text: string): string {
  const line = text.split(/\r?\n/).map(l => l.trim()).find(l => l !== '') ?? ''
  return line.length > ONE_LINE ? `${line.slice(0, ONE_LINE - 1)}…` : line
}

function summaryOf(asked: ChangeAsked, result: Done): string {
  if (asked.tool === 'delete') return 'Deleted: it can be restored from Recently deleted for 30 days'
  if (asked.tool === 'write') return result.change === 'created' ? 'New page' : 'The whole page rewritten'
  const now = clip(asked.new_string)
  return now ? `Now says "${now}"` : `Removed "${clip(asked.old_string)}"`
}

function titleOf(page: string, asked: ChangeAsked): string {
  const content = asked.tool === 'delete' ? undefined : asked.content
  if (content === undefined) return titleFromPageName(page)
  return checkPageChange(page, content).summary.title || titleFromPageName(page)
}

export function tellChange(reach: KnowledgeReach, level: SiteLevel, page: string, result: Done, version: string | undefined, asked: ChangeAsked): void {
  if (!reach.onStep) return
  reach.onStep({
    kind: 'knowledge_change',
    level: level.name,
    owner: { ownerType: level.owner.ownerType, ownerId: level.owner.ownerId },
    page,
    title: titleOf(page, asked),
    change: result.change,
    ...(version && result.change !== 'deleted' ? { versionId: version } : {}),
    ...(result.previousVersionId ? { previousVersionId: result.previousVersionId } : {}),
    summary: summaryOf(asked, result),
  })
}

/** The levels a search covered; the lead's tools put each one's name as shown. */
export function tellSearch(reach: KnowledgeReach, levels: readonly Level[]): void {
  reach.onStep?.({ kind: 'knowledge_search', levels: levels.map(l => l.name), names: levels.map(l => l.name) })
}

export function tellPlatformPage(reach: KnowledgeReach, page: string, title: string | undefined): void {
  reach.onStep?.({ kind: 'platform_page', page, title: title || titleFromPageName(page) })
}

export type { KnowledgeStepView }
