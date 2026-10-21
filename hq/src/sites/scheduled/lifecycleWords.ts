/**
 * What members read of a suspension, a resumption or an erase (host-management spec §15, diagram 9), where the
 * general words of `noticeWords.ts` would mislead: HQ's erase with a date is a countdown to everyone, one at once
 * is not announced ahead; a site's erase is not announced ahead either, and once it starts HQ says the site has
 * gone; a suspension lasts until someone resumes it, not "about a minute". Pure, so each wording is tested.
 */
import { SCHEDULED_CHANGE_PAUSE_LEAD_MS, type ScheduledChangeUpdate } from '@agenthix/core'
import { clockIn, dayIn, whenIn, type ChangeFacts, type NoticeText } from './noticeWords'

/** A change set to run within this of being scheduled was asked for "now": nothing is announced ahead of it. */
export const AT_ONCE_MS = 60_000

/** Whether the change was asked for at once, from its time and when the notice that scheduled it was made. */
export const atOnce = (at: Date, sentAt: Date) => at.getTime() - sentAt.getTime() < AT_ONCE_MS

/** The updates of these changes members read even though the general words say nothing on them. */
export function speaksOn(f: Pick<ChangeFacts, 'kind' | 'siteName'>, update: ScheduledChangeUpdate): boolean {
  return f.kind === 'erase' && f.siteName !== null && update === 'started'
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const subject = (f: Pick<ChangeFacts, 'siteName'>) => f.siteName ?? 'HQ'

/**
 * The notice for a suspension, resumption or erase: the words, null to tell no one, or undefined where the
 * general words serve (a cancellation of a suspension, a failure, a missed change).
 */
export function lifecycleNoticeText(
  update: ScheduledChangeUpdate, f: ChangeFacts, projects: string[], zone: string, now: boolean,
): NoticeText | null | undefined {
  const scheduled = update === 'scheduled' || update === 'changed'
  if (f.kind === 'erase') {
    if (f.siteName === null) {
      if (scheduled) {
        return now ? null : {
          title: 'HQ will be erased',
          body: `This HQ will be erased on ${whenIn(f.at, zone)} by a fleet admin. Export what you need, or ask them to cancel.`,
        }
      }
      if (update === 'cancelled') return { title: 'Erase cancelled', body: `HQ will not be erased on ${dayIn(f.at, zone)}. Nothing changes.` }
      return undefined
    }
    if (scheduled && now) return null
    if (update === 'started') {
      const theirs = projects.length ? ` ${list(projects)} ran there, and ${projects.length === 1 ? 'does' : 'do'} not run any more.` : ''
      return {
        title: `${f.siteName} has gone`,
        body: `${f.siteName} was erased from its machine, so nothing runs there now.${theirs} If its work is needed, a fleet admin can bring it back within 30 days.`,
      }
    }
    return undefined
  }
  if (f.kind === 'suspend' && scheduled) {
    const pauseAt = clockIn(new Date(f.at.getTime() - SCHEDULED_CHANGE_PAUSE_LEAD_MS), zone)
    const runs = f.siteName
      ? `${projects.length ? list(projects) : 'Runs there'} ${projects.length === 1 ? 'pauses' : 'pause'}${now ? '' : ` from ${pauseAt}`} until it is resumed.`
      : `${now ? 'No' : `From ${pauseAt} no`} new runs start, and agents already working pause until it is resumed.`
    const when = now ? 'now' : `on ${whenIn(f.at, zone)}`
    return {
      title: now ? `${subject(f)} is suspended` : `${subject(f)} will be suspended`,
      body: `${subject(f)}${f.siteName ? ', where your work runs,' : ''} ${now ? 'is' : 'will be'} suspended ${when}: it stops, and nothing is lost. ${runs} You don’t need to do anything.`,
    }
  }
  if (f.kind === 'resume' && scheduled) {
    return { title: `${subject(f)} starts again`, body: `${subject(f)} starts again ${now ? 'now' : `on ${whenIn(f.at, zone)}`}. Runs that were paused carry on. You don’t need to do anything.` }
  }
  return undefined
}
