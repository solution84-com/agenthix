/**
 * The knowledge tools' work steps (agent knowledge spec, part 5, C1–C3): *Searched knowledge* naming the places it
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

const ASK: Record<string, string> = { write_knowledge: 'Write page', edit_knowledge: 'Update page', delete_knowledge: 'Delete page' }

/** A knowledge call in a person's words; null for any other tool. Without an outcome, what it set out to do. */
export function knowledgeCallLabel(tool: string, args: Record<string, unknown>, outcome: ToolCallOutcome | null): string | null {
  if (!TOOLS.has(tool)) return null
  const step = outcome?.status === 'done' ? outcome.knowledge : undefined
  const page = named(args.page)
  if (tool === 'search_knowledge') return step?.kind === 'knowledge_search' && step.names.length ? `Searched knowledge · ${listed(step.names)}` : 'Searched knowledge'
  if (tool === 'read_knowledge') {
    if (step?.kind === 'platform_page') return `Looked up the guide · ${step.title}`
    return page.level === 'platform' ? `Looked up the guide · ${page.title}` : `Read page · ${page.title}`
  }
  const ask = `${ASK[tool]} · ${page.title}`
  if (!outcome || outcome.status !== 'done') return ask
  // The service answers a refusal of the gate as text: a change with nothing to show did not happen.
  if (step?.kind !== 'knowledge_change') return `${ask} — didn't work`
  if (step.change === 'deleted') return `Deleted page · ${step.title}`
  return `${step.change === 'created' ? 'Wrote page' : 'Updated page'} · ${step.title}`
}

/** What a step's knowledge calls did, in the order they were asked. */
export function knowledgeOf(outcomes: readonly ToolCallOutcome[]): KnowledgeStepView[] {
  return outcomes.flatMap(o => (o.status === 'done' && o.knowledge ? [o.knowledge] : []))
}
