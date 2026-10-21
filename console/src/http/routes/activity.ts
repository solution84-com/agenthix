/**
 * What fleet admins did, and what each is told (spec §7, §10): both are hq's, asked over the link on behalf of the
 * person signed in, whom hq answers only while they hold the role. Each answer is parsed field by field.
 */
import { Router } from 'express'
import { parseFleetActivityPage, parseFleetNotices } from '@agenthix/core'
import type { ConsoleContext } from '../app'
import { sessionOf } from '../guards'
import { askNewerHq, notUnderstood } from './newerHq'
import { noticeTarget } from './noticeTarget'

const ID = /^[A-Za-z0-9_-]{1,64}$/

export function activityRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  r.get('/activity', async (req, res) => {
    const after = req.query.after
    if (after !== undefined && (typeof after !== 'string' || !ID.test(after))) {
      res.status(400).json({ error: 'malformed', message: 'That is not a page of the record.' })
      return
    }
    const byUserId = sessionOf(res).user.id
    const answer = await askNewerHq(res, () => ctx.link.call('activity.list', after ? { byUserId, after } : { byUserId }))
    if (answer === undefined) return
    const page = parseFleetActivityPage(answer)
    if (!page) return notUnderstood(res)
    res.json(page)
  })

  r.get('/notices', async (_req, res) => {
    const answer = await askNewerHq(res, () => ctx.link.call('notices.list', { byUserId: sessionOf(res).user.id }))
    if (answer === undefined) return
    const notices = parseFleetNotices(answer)
    if (!notices) return notUnderstood(res)
    // Each notice opens what it is about; hq knows a machine by its id, the screens by its fingerprint.
    const fleet = { hosts: ctx.hosts.list(), moveOf: (fp: string) => ctx.moves.of(fp), lastMoveOf: (fp: string) => ctx.moves.lastOf(fp) }
    res.json({
      notices: notices.map(n => {
        const { hostId, ...rest } = n
        return { ...rest, fingerprint: hostId ? ctx.hosts.byHostId(hostId)?.fingerprint ?? null : null, target: noticeTarget(n, fleet) }
      }),
    })
  })

  r.post('/notices/:id/dismiss', async (req, res) => {
    const noticeId = req.params.id
    if (!ID.test(noticeId)) {
      res.status(400).json({ error: 'malformed', message: 'No such notice.' })
      return
    }
    const answer = await askNewerHq(res, () => ctx.link.call('notices.dismiss', { byUserId: sessionOf(res).user.id, noticeId }))
    if (answer === undefined) return
    res.json({ dismissed: answer.dismissed === true })
  })

  return r
}
