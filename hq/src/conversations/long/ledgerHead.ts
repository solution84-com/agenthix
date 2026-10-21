/**
 * The ledger as the compaction block's head (long conversations spec, The ledger): structured by kind, a closed
 * operation one line, and bounded at about LEDGER_HEAD_MAX_TOKENS — past it, the oldest closed operations go first,
 * then the oldest approvals, then the oldest of anything else. Pure: the same entries always give the same text.
 */
import { LEDGER_HEAD_MAX_TOKENS, type LedgerEntry, type LedgerEntryKind } from '../../shared/conversations/protocol'
import { estimateTokens } from './windows'

/** An entry as the ledger keeps it: `closed` for an operation that ended, or an obligation the lead marked done. */
export type KeptEntry = LedgerEntry & { closed?: boolean }

export const ENTRY_MAX_CHARS = 400
export const CLOSED_LINE_MAX_CHARS = 120

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

function clip(text: string, max: number): string {
  const line = oneLine(text)
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}

export function entryText(entry: KeptEntry): string {
  return entry.closed ? clip(entry.text, CLOSED_LINE_MAX_CHARS) : clip(entry.text, ENTRY_MAX_CHARS)
}

/** Which entries go first when the head is over its budget: lower drops sooner, then older. */
function dropRank(entry: KeptEntry): number {
  if (entry.closed) return 0
  if (entry.kind === 'approval') return 1
  return 2
}

/** The entries the head keeps, in the order they were recorded, each with its text trimmed to its line. */
export function boundedHead(entries: readonly KeptEntry[], maxTokens = LEDGER_HEAD_MAX_TOKENS): KeptEntry[] {
  const trimmed = entries.map(e => ({ ...e, text: entryText(e) }))
  let total = trimmed.reduce((sum, e) => sum + estimateTokens(e.text) + 4, 0)
  if (total <= maxTokens) return trimmed
  const dropOrder = trimmed.map((e, i) => ({ e, i })).sort((a, b) => dropRank(a.e) - dropRank(b.e) || a.i - b.i)
  const dropped = new Set<number>()
  for (const { e, i } of dropOrder) {
    if (total <= maxTokens) break
    dropped.add(i)
    total -= estimateTokens(e.text) + 4
  }
  return trimmed.filter((_, i) => !dropped.has(i))
}

const HEADINGS: Record<LedgerEntryKind, string> = {
  'open-operation': 'Work started here',
  decision: 'Decisions',
  approval: 'Approvals given',
  obligation: 'What you said you would do',
  keep: 'What the person asked you to keep',
}
const ORDER: readonly LedgerEntryKind[] = ['open-operation', 'obligation', 'decision', 'approval', 'keep']

/** The head as the lead reads it; null when the ledger holds nothing. */
export function ledgerHeadText(head: readonly KeptEntry[]): string | null {
  if (head.length === 0) return null
  const sections: string[] = []
  for (const kind of ORDER) {
    const of = head.filter(e => e.kind === kind)
    if (of.length === 0) continue
    const lines = of.map(e => {
      if (kind === 'open-operation') return `- ${e.closed ? 'Ended' : 'Open'}: ${e.text}${e.operationId ? ` [${e.operationId}]` : ''}`
      return `- ${e.closed ? 'Done: ' : ''}${e.text} [${e.id}]`
    })
    sections.push(`${HEADINGS[kind]}:\n${lines.join('\n')}`)
  }
  return sections.join('\n')
}
