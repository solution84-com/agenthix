import type { GetScheduledChangeNotices } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { scheduledNoticesFor, type MemberNotice } from './memberNotices'

/** The scheduled changes the signed-in person is told of on screen: what is ahead or going on the machines their work runs on. */
export const getScheduledChangeNotices: GetScheduledChangeNotices<void, MemberNotice[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return scheduledNoticesFor(context.user.id)
}
