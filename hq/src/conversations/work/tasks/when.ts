/**
 * The three asks of create_task (workers and results spec, Results): do it now, do it later with no date, or do it
 * at a time. The lead reads which from the person's words, and asks when they leave it open.
 */
export type TaskWhen = { kind: 'now' } | { kind: 'later' } | { kind: 'at'; at: string }

export const WHEN_DESCRIPTION =
  '"now", "later", or an ISO 8601 time (2026-10-20T09:00), read in the person\'s timezone unless `timezone` names ' +
  'one. If the person did not say when, ask them before calling this.'

/** What the reply to a task made "later" says: where it is, and that it has no agent when none was named. */
export function laterLine(column: string | undefined, agentAssigned: boolean): string {
  const where = column ? `the ${column} column` : 'the backlog'
  return `It's in ${where} until someone starts it.${agentAssigned ? '' : ' No agent is assigned to it yet, so it cannot run until someone names one.'}`
}

export function readWhen(value: string): TaskWhen {
  const v = value.trim()
  if (v.toLowerCase() === 'now') return { kind: 'now' }
  if (v.toLowerCase() === 'later') return { kind: 'later' }
  return { kind: 'at', at: v }
}
