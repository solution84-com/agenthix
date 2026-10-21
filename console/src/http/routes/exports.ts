import { Router } from 'express'
import { isExportId } from '@agenthix/core'
import type { ConsoleContext } from '../app'
import type { ExportDownloads } from '../../exports/downloads'
import { clearedSessionCookie, readCookie, SESSION_COOKIE, sessionOf } from '../guards'
import { actorOf } from './fleet'

/**
 * *Download the export* (exports/downloads.ts), behind the session: a one-time link for this session, and how the
 * download it started went.
 */
export function exportRoutes(ctx: ConsoleContext, downloads: ExportDownloads): Router {
  const r = Router()

  r.post('/hosts/:fingerprint/exports/:exportId/download', (req, res) => {
    const host = ctx.hosts.byFingerprint(req.params.fingerprint)
    if (!host) {
      res.status(404).json({ error: 'not_found', message: 'That machine is not connected to this Fleet Console.' })
      return
    }
    if (!isExportId(req.params.exportId)) {
      res.status(400).json({ error: 'malformed', message: 'That is not an export.' })
      return
    }
    const { downloadId, link } = downloads.begin(sessionOf(res), actorOf(res), host.fingerprint, host.machineName, req.params.exportId)
    res.status(201).json({ downloadId, href: `/api/export-downloads/file/${link}` })
  })

  r.get('/export-downloads/:downloadId', (req, res) => {
    const download = downloads.status(req.params.downloadId, actorOf(res).userId)
    if (!download) {
      res.status(404).json({ error: 'not_found', message: 'No such download.' })
      return
    }
    res.json({ download })
  })

  return r
}

/**
 * The file itself, which the browser fetches by itself and so without the CSRF header: the one-time link stands in
 * for it, with the cookie of the session it was made for, and the role checked again with hq.
 */
export function exportFileRoutes(ctx: ConsoleContext, downloads: ExportDownloads): Router {
  const r = Router()

  r.get('/export-downloads/file/:link', async (req, res) => {
    const link = req.params.link
    const idHash = downloads.sessionOf(link)
    if (!idHash) {
      res.status(404).json({ error: 'not_found', message: 'This download link was used already, or is more than a minute old. Download the export again.' })
      return
    }
    const session = ctx.sessions.findByCookie(readCookie(req, SESSION_COOKIE), idHash)
    if (!session) {
      res.status(401).json({ error: 'signed_out', message: 'Sign in with your HQ account.' })
      return
    }
    if (!(await ctx.roles.stillHolds(session))) {
      res.setHeader('Set-Cookie', clearedSessionCookie)
      res.status(401).json({ error: 'not_fleet_admin', message: 'This account no longer holds the fleet admin role.' })
      return
    }
    const pending = downloads.take(link)
    if (!pending) {
      res.status(404).json({ error: 'not_found', message: 'This download link was used already. Download the export again.' })
      return
    }
    await downloads.send(pending, res)
  })

  return r
}
