/**
 * The words a Workroom shows (the Workroom design): costs, how long a run has gone, why a task waits, what a Needs-you
 * bar says and offers, the counts above the cards, and every greyed control's reason. Pure, so they are tested alone.
 */
import type { NeedsPersonReason } from '@agenthix/core'
import type { WorkroomAgent, WorkroomCounts, WorkroomLineWhy, WorkroomRing } from './workroomTypes'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "$0", "<$0.01", "$0.44": tokens priced, so an estimate. */
export function costText(dollars: number): string {
  if (dollars <= 0) return '$0'
  if (dollars < 0.01) return '<$0.01'
  return `$${dollars.toFixed(2)}`
}

/** "20 s", "6 min", "2 h": how long a run has gone. */
export function elapsedText(since: string | null, now: Date): string | null {
  if (!since) return null
  const s = Math.max(0, Math.round((now.getTime() - new Date(since).getTime()) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h`
}

/** "9 min ago", "just now", "3 h ago". */
export function agoText(at: string, now: Date): string {
  const m = Math.floor((now.getTime() - new Date(at).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)} h ago`
}

export function clockText(at: string): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Why a task in line waits, ending with what starts it. `short` is the phone's. */
export function lineWhyText(why: WorkroomLineWhy, short = false): string {
  switch (why.kind) {
    case 'next': return why.after && !short ? `next, after ${why.after}` : 'next'
    case 'after': return short ? 'after the one above' : `after ${why.title}`
    case 'startsAt': return short ? `starts at ${clockText(why.at)}` : `starts at ${clockText(why.at)} (Run at…)`
    case 'siteBusy': return short ? 'its site is busy' : `next · every run at once on ${why.siteName ?? 'its site'} is busy; starts when one ends`
    case 'siteAway': return short ? 'its site isn’t answering' : `next · starts when ${why.siteName ?? 'its site'} answers again`
    case 'branch': return short ? 'waits for a branch' : "next · waits for the project's other runs to finish, as it works on a branch"
  }
}

/** What a Needs-you bar says it waits for, as the ring's words say it. */
export function needWords(reason: NeedsPersonReason): string {
  switch (reason) {
    case 'approval': return 'needs your okay'
    case 'answer': return 'asked you something'
    case 'limit': return 'reached its limit'
    case 'access': return 'needs someone to stand in'
    case 'failed': return 'failed'
  }
}

/** The bar's one answer. */
export function needAction(reason: NeedsPersonReason): string {
  switch (reason) {
    case 'answer': return 'Answer'
    case 'failed': return 'Run again'
    default: return 'Review'
  }
}

/** The ring's words after the agent's name: "2 runs at work", "asked a question". */
export function ringDetail(a: Pick<WorkroomAgent, 'now' | 'needs' | 'line'>, ring: WorkroomRing): string | null {
  switch (ring) {
    case 'RUNNING': return a.now.length > 1 ? `${a.now.length} runs at work` : 'at work'
    case 'NEEDS_YOU': return needWords(a.needs.find(n => n.reason !== 'failed')?.reason ?? 'answer')
    case 'FAILED': return 'a run failed'
    case 'WAITING': return `${plural(a.line.length, 'task')} in line`
    default: return null
  }
}

/** What is paused waiting for the person (an okay, an answer): Now lists these. A failure is finished: only its bar shows it. */
export function pausedNeeds(a: Pick<WorkroomAgent, 'needs'>): WorkroomAgent['needs'] {
  return a.needs.filter(n => n.reason !== 'failed')
}

/** The card under the band when nothing is at work, paused or in line: one band and one line. */
export function quietLine(a: WorkroomAgent, opts: { nothingYet: boolean; mine: boolean }): string | null {
  if (a.now.length > 0 || a.line.length > 0 || pausedNeeds(a).length > 0) return null
  if (opts.nothingYet && !opts.mine) {
    return a.ready > 0
      ? `${plural(a.ready, 'task')} ready. Start runs them one at a time, in rank order.`
      : `No task is ready: none in a To do column with ${a.name}.`
  }
  if (a.needs.length === 0 && a.finishedToday === 0) return opts.mine ? 'Nothing today' : 'Nothing needs you, nothing running, nothing in line.'
  if (opts.mine) return a.finishedToday > 0 ? `Nothing at work or in line · ${a.finishedToday} finished today` : 'Nothing of yours at work or in line.'
  return 'Nothing at work or in line.'
}

export function startTitle(a: Pick<WorkroomAgent, 'name' | 'ready'>): string {
  return a.ready > 0
    ? `Runs ${a.name}’s ${plural(a.ready, 'ready task')}, after a confirm`
    : `No task is ready for ${a.name}`
}

export function stopTitle(a: Pick<WorkroomAgent, 'name' | 'now' | 'line'>): string {
  if (a.now.length === 0 && a.line.length === 0) return 'Nothing is running'
  return a.line.length > 0
    ? `Stops ${a.name}’s runs; its waiting ${a.line.length === 1 ? 'task goes' : 'tasks go'} back to Not started`
    : `Stops ${a.name}’s runs`
}

export type CountCard = 'needs' | 'running' | 'waiting' | 'finished' | 'spent'

/** The counts above the cards: Needs you (a filter), Running, Waiting, Finished today, Spent today. */
export function countCards(c: WorkroomCounts, opts: { across?: boolean; needsAgents?: number } = {}) {
  const needsDetail = c.needsYou === 0 ? null : opts.across
    ? `${plural(opts.needsAgents ?? 0, 'agent')} · show only them`
    : [c.needsAsking ? plural(c.needsAsking, 'task') : null, c.needsFailed ? `${c.needsFailed} failed` : null, 'show only them']
        .filter(Boolean).join(' · ')
  const runningDetail = c.running === 0 ? null : opts.across
    ? `in ${plural(c.runningProjects, 'project')}`
    : [c.runningTasks ? plural(c.runningTasks, 'task') : null, c.runningReplies ? plural(c.runningReplies, 'reply', 'replies') : null].filter(Boolean).join(' · ')
  return [
    { key: 'needs' as const, label: 'Needs you', count: String(c.needsYou), detail: needsDetail },
    { key: 'running' as const, label: 'Running', count: String(c.running), detail: runningDetail },
    { key: 'waiting' as const, label: 'Waiting', count: String(c.waiting), detail: null },
    { key: 'finished' as const, label: 'Finished today', count: String(c.finishedToday), detail: null },
    { key: 'spent' as const, label: 'Spent today', count: costText(c.spentToday), detail: 'tokens, estimated' },
  ]
}

export { localMidnight } from '../../shared/utils/localMidnight'
