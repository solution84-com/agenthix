import { durationText } from './taskGroups'

/** One row of a task's activity as HQ answers it: what happened, who did it by name ("You" for the reader), when. */
export interface TaskActivityRowLike {
  id: string
  kind: string
  by: 'person' | 'agent' | 'hq'
  name: string | null
  runId: string | null
  detail: unknown
  createdAt: string | Date
}

/** Names the activity's ids carry: its rows keep ids, and a name is read when it is shown. */
export interface ActivityNames {
  board?: (boardId: string) => string | null | undefined
  /** A column's label on its board; the stored name when left out. */
  column?: (boardId: string, column: string) => string | null | undefined
  agent?: (agentId: string) => string | null | undefined
}

export type ActivityIcon = 'created' | 'edited' | 'moved' | 'assigned' | 'started' | 'finished' | 'failed' | 'stopped' | 'approved' | 'denied' | 'comment' | 'archived'

export interface ActivityLine {
  id: string
  icon: ActivityIcon
  text: string
  at: string | Date
  /** The tab the line opens: a run's line opens Runs at it, a comment's line opens Comments. */
  opens?: { tab: 'runs'; runId: string } | { tab: 'comments'; commentId: string }
}

type Place = { boardId: string; column: string | null }
type Detail = {
  fields?: string[]; from?: Place; to?: Place; fromAgentId?: string | null; toAgentId?: string | null
  number?: number | null; startedBy?: string; reason?: string | null; commentId?: string; parentId?: string | null
}

const FIELD: Record<string, string> = {
  title: 'the title', description: 'the description', priority: 'the priority', labels: 'the labels',
  modelChoice: 'the model', workspaceId: 'the workspace', planStart: 'the plan', planFinish: 'the plan',
  isEpic: 'whether it is an epic', epicId: 'its epic', milestoneId: 'its milestone',
}

const STARTER: Record<string, string> = { schedule: 'on schedule', pulse: 'by automation' }

function list(words: string[]): string {
  if (words.length <= 1) return words[0] ?? 'it'
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

const firstLine = (text: string) => text.trim().split('\n')[0].trim()

/**
 * A task's activity as lines (T0, the Activity tab), in the order given (HQ answers newest first): one line per thing
 * that happened, in words, with the run's or comment's tab it opens.
 */
export function activityLines(rows: TaskActivityRowLike[], names: ActivityNames = {}): ActivityLine[] {
  const started = new Map<string, { at: Date; number: number | null }>()
  for (const r of rows) {
    if (r.kind === 'RUN_STARTED' && r.runId) started.set(r.runId, { at: new Date(r.createdAt), number: (r.detail as Detail)?.number ?? null })
  }
  const col = (p: Place) => (p.column === null ? 'Backlog' : names.column?.(p.boardId, p.column) ?? p.column)
  const board = (id: string) => names.board?.(id) ?? 'another board'
  const agent = (id: string | null | undefined) => (id ? names.agent?.(id) ?? 'an agent' : 'an agent')

  return rows.map(r => {
    const d = (r.detail ?? {}) as Detail
    const who = r.name ?? 'HQ'
    const whoAfter = who === 'You' ? 'you' : who
    const number = d.number ?? (r.runId ? started.get(r.runId)?.number : null) ?? null
    const run = number ? `Run ${number}` : 'A run'
    const runAfter = number ? `Run ${number}` : 'a run'
    const opensRun = r.runId ? { opens: { tab: 'runs' as const, runId: r.runId } } : {}
    const reason = d.reason ? ` · ${firstLine(d.reason)}` : ''
    const line = (icon: ActivityIcon, text: string, extra: Partial<ActivityLine> = {}): ActivityLine => ({ id: r.id, icon, text, at: r.createdAt, ...extra })
    switch (r.kind) {
      case 'CREATED': return line('created', `${who} created it`)
      case 'EDITED': return line('edited', `${who} changed ${list([...new Set((d.fields ?? []).map(f => FIELD[f] ?? f))])}`)
      case 'MOVED': {
        if (!d.from || !d.to) return line('moved', `${who} moved it`)
        if (d.from.boardId === d.to.boardId) return line('moved', `${who} moved it from ${col(d.from)} to ${col(d.to)}`)
        return line('moved', `${who} moved it to the board ${board(d.to.boardId)} · ${col(d.to)}`)
      }
      case 'ASSIGNED':
        if (!d.toAgentId) return line('assigned', `${who} unassigned ${agent(d.fromAgentId)}`)
        return line('assigned', `${agent(d.toAgentId)} was assigned${r.name ? ` by ${whoAfter}` : ''}`)
      case 'RUN_STARTED': {
        const by = r.name ? ` by ${whoAfter}` : d.startedBy && STARTER[d.startedBy] ? ` ${STARTER[d.startedBy]}` : ''
        return line('started', `${run} started${by}`, opensRun)
      }
      case 'RUN_FINISHED': {
        const from = r.runId ? started.get(r.runId) : undefined
        const took = from ? ` · ${durationText(new Date(r.createdAt).getTime() - from.at.getTime())}` : ''
        return line('finished', `${run} finished${took}`, opensRun)
      }
      case 'RUN_FAILED': return line('failed', `${run} failed${reason}`, opensRun)
      case 'RUN_STOPPED': return line('stopped', r.name ? `${who} stopped ${runAfter}${reason}` : `${run} stopped${reason}`, opensRun)
      case 'APPROVED': return line('approved', `${who} approved what ${runAfter} asked for`, opensRun)
      case 'DENIED': return line('denied', `${who} denied what ${runAfter} asked for`, opensRun)
      case 'COMMENTED': {
        const opens = d.commentId ? { opens: { tab: 'comments' as const, commentId: d.commentId } } : {}
        return line('comment', d.parentId ? `${who} replied to a comment` : `${who} commented`, opens)
      }
      case 'ARCHIVED': return line('archived', `${who} archived it`)
      case 'UNARCHIVED': return line('archived', `${who} took it out of the archive`)
      default: return line('edited', `${who} changed it`)
    }
  })
}
