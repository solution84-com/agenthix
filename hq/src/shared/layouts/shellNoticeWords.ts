/** What every screen says while hq is read-only for a move (host-management spec §13; the HQ board's *hq read-only while it moves*). */
import { clockIn } from '../../sites/scheduled/noticeWords'

export function readOnlyNotice(since: string, zone: string): { title: string; body: string } {
  return {
    title: 'HQ is read-only while it moves to a new machine',
    body: `The move started at ${clockIn(new Date(since), zone)}. You can read everything, but changes you make now would not be kept. ` +
      'HQ will say when the new one is ready. Fleet admins carry on in the Fleet Console where it runs; it follows HQ to the new address.',
  }
}

/** The scheduled changes of a place: a project's page shows its own, Home shows those to hq itself, other screens none. */
export function placeOf(pathname: string): { project: string } | { home: true } | null {
  if (pathname === '/') return { home: true }
  const [first, key] = pathname.split('/').filter(Boolean)
  return first === 'projects' && key ? { project: key } : null
}
