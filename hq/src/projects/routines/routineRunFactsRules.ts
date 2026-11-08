/**
 * What the Routines screens add to hq's routine runs from the sites (the Routines design keys 1, 5, 7): what each run
 * cost, and today's runs and spending. hq records each firing; its cost is in the site's rows of the run's session
 * (one session per firing, so an approval's further run counts toward the same firing). Pure.
 */
import type { RunRow, SiteSilence } from '@agenthix/core'
import { calculateCost } from '../../shared/utils/aiMetrics'

export type RoutineRunFacts = {
  /** Each routine run's cost in dollars, by its id; left out while its site has reported none. */
  cost: Record<string, number>
  today: { ran: number; running: number; spent: number }
}

export type RoutineRunFactsArgs = {
  /** One project's routines; or one routine's (`routineId`); or, with neither, every one the person may read. */
  projectId?: string
  routineId?: string
  /** The runs a routine's page lists, newest first. */
  runs?: number
  /** The viewer's midnight, as an ISO time: "today" is theirs. */
  todayFrom: string
}

export type RoutineRunFactsResult = RoutineRunFacts & {
  /** Each routine's instructions in a line or two, by its id, for its card's "What it does". */
  about: Record<string, string>
  unanswered: SiteSilence[]
}

export type FactsRun = { id: string; sessionId: string | null; state: string; startedAt: Date }

const going = (state: string) => state === 'STARTING' || state === 'RUNNING'

export function factsOf(runs: FactsRun[], rows: Pick<RunRow, 'sessionId' | 'usage' | 'model'>[], todayFrom: Date): RoutineRunFacts {
  const bySession = new Map<string, number>()
  for (const row of rows) {
    if (!row.usage) continue
    bySession.set(row.sessionId, (bySession.get(row.sessionId) ?? 0) + calculateCost(row.usage, row.model))
  }
  const cost: Record<string, number> = {}
  const today = { ran: 0, running: 0, spent: 0 }
  const seen = new Set<string>()
  for (const r of runs) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    const c = r.sessionId ? bySession.get(r.sessionId) : undefined
    if (c !== undefined) cost[r.id] = c
    if (going(r.state)) today.running++
    if (r.state !== 'SKIPPED' && r.startedAt.getTime() >= todayFrom.getTime()) {
      today.ran++
      today.spent += c ?? 0
    }
  }
  return { cost, today }
}

/** How much of the instructions a card's two lines can show. */
const ABOUT_CHARS = 240

/** The instructions as one line of words: Markdown's marks and line breaks dropped, cut to what a card shows. */
export function aboutOf(instructions: string): string {
  const words = instructions.replace(/[#>*_`~\[\]]|^\s*[-+]\s+|^\s*\d+\.\s+/gm, '').replace(/\s+/g, ' ').trim()
  return words.length > ABOUT_CHARS ? `${words.slice(0, ABOUT_CHARS - 1)}…` : words
}
