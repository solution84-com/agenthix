/**
 * The knowledge tools' work steps (agent knowledge spec, part 5, C1–C3): *Searched Knowledge* naming the places it
 * covered, *Read page*, *Looked up the guide* naming the guide's page, and *Updated page* with what changed — in a
 * person's words, never a tool's name. What each call did travels with its outcome (`ToolCallOutcome.knowledge`) and
 * is kept on the step, for *See change* and *Undo*.
 */
import { titleFromPageName, type KnowledgeStepView } from '@agenthix/core'
import type { ToolCallOutcome } from '../contract'

const TOOLS = new Set(['search_knowledge', 'read_knowledge', 'write_knowledge', 'edit_knowledge', 'delete_knowledge'])

/** Whether a tool is one of the knowledge tools, each of whose calls is a step of its own. */
export function isKnowledgeTool(tool: string): boolean {
  return TOOLS.has(tool)
}

function listed(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** A page's name as the agent gave it (`website-rebuild:processes/release.md`): its level, and its file's name. */
function named(page: unknown): { level: string | null; title: string } {
  if (typeof page !== 'string' || !page.trim()) return { level: null, title: 'a page' }
  const at = page.indexOf(':')
  const rest = at > 0 ? page.slice(at + 1) : page
  return { level: at > 0 ? page.slice(0, at) : null, title: titleFromPageName(rest) || 'a page' }
}

const DOING: Record<string, string> = { write_knowledge: 'Writing a page', edit_knowledge: 'Updating a page', delete_knowledge: 'Deleting a page' }
const ASK: Record<string, string> = { write_knowledge: 'Write a page', edit_knowledge: 'Update a page', delete_knowledge: 'Delete a page' }

/**
 * A knowledge call in a person's words; null for any other tool. Without an outcome, what it is doing ("Searching
 * Knowledge"); refused, what it set out to do, for "Couldn't …"; done, what it did.
 */
export function knowledgeCallLabel(tool: string, args: Record<string, unknown>, outcome: ToolCallOutcome | null): string | null {
  if (!TOOLS.has(tool)) return null
  const step = outcome?.status === 'done' ? outcome.knowledge : undefined
  const page = named(args.page)
  const guide = page.level === 'platform'
  if (tool === 'search_knowledge') {
    if (!outcome) return 'Searching Knowledge'
    if (outcome.status !== 'done') return 'Search Knowledge'
    return step?.kind === 'knowledge_search' && step.names.length ? `Searched Knowledge · ${listed(step.names)}` : 'Searched Knowledge'
  }
  if (tool === 'read_knowledge') {
    if (!outcome) return guide ? `Looking up the guide · ${page.title}` : `Reading a page · ${page.title}`
    if (outcome.status !== 'done') return guide ? `Look up the guide · ${page.title}` : `Read a page · ${page.title}`
    if (step?.kind === 'platform_page') return `Looked up the guide · ${step.title}`
    return guide ? `Looked up the guide · ${page.title}` : `Read page · ${page.title}`
  }
  if (!outcome) return `${DOING[tool]} · ${page.title}`
  const ask = `${ASK[tool]} · ${page.title}`
  if (outcome.status !== 'done') return ask
  // The service answers a refusal of the gate as text: a change with nothing to show did not happen.
  if (step?.kind !== 'knowledge_change') return `Couldn't ${ask.charAt(0).toLowerCase()}${ask.slice(1)}`
  if (step.change === 'deleted') return `Deleted page · ${step.title}`
  return `${step.change === 'created' ? 'Wrote page' : 'Updated page'} · ${step.title}`
}

/** What a step's knowledge calls did, in the order they were asked. */
export function knowledgeOf(outcomes: readonly ToolCallOutcome[]): KnowledgeStepView[] {
  return outcomes.flatMap(o => (o.status === 'done' && o.knowledge ? [o.knowledge] : []))
}
