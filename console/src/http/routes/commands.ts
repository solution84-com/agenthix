/**
 * The closed set of operations, passed to a machine as signed commands (spec §6). The request is checked with the
 * same parser the host service uses, so the API cannot carry anything the closed set does not. A command that ends
 * within a few seconds answers at once; a longer one answers 202 with its id, to be read at `/commands/:id`.
 */
import { Router, type Response } from 'express'
import { parseHostRequest, type HostRequest } from '@agenthix/core'
import { plannedSubject } from '../../activity'
import type { CommandRun } from '../commandRuns'
import type { ConsoleContext } from '../app'
import { listedAs } from '../../state/hosts'
import { actorOf } from './fleet'

const INLINE_WAIT_MS = 20_000

export function commandRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  const run = async (res: Response, fingerprint: string, request: HostRequest) => {
    const host = ctx.hosts.byFingerprint(fingerprint)
    if (!host) {
      res.status(404).json({ error: 'not_found', message: 'That machine is not connected to this Fleet Console.' })
      return
    }
    const by = actorOf(res)
    const started = ctx.runs.start(by.userId, fingerprint, request.op, ctx.commands.send(fingerprint, request, by))
    // Recorded when asked, whatever the machine answers: what a fleet admin asked of a machine is the record.
    if (request.op !== 'figures.read' && request.op !== 'logs.read' && request.op !== 'backup.list') {
      const scheduled = request.op === 'schedule' ? request.change.op : undefined
      const subject = request.op === 'schedule' ? plannedSubject(listedAs(host), request) : listedAs(host)
      await ctx.activity.command(by.userId, request.op, subject, scheduled)
    }
    await ctx.runs.settle(started, INLINE_WAIT_MS)
    respond(res, ctx.runs.read(started.id, by.userId)!)
  }

  r.post('/hosts/:fingerprint/commands', async (req, res) => {
    const parsed = parseHostRequest((req.body as Record<string, unknown> | undefined)?.request)
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.refusal.code, message: parsed.refusal.message })
      return
    }
    if (parsed.request.op === 'backup.exportRead' || parsed.request.op === 'backup.exportDone') {
      res.status(400).json({ error: 'malformed', message: 'An export is downloaded from its own page, with Download the export.' })
      return
    }
    const restore = parsed.request.op === 'schedule' ? parsed.request.change : parsed.request
    if (restore.op === 'backup.restore') {
      res.status(400).json({ error: 'malformed', message: "A night is restored from the machine's backups, with Restore…, which asks for the machine's name." })
      return
    }
    await run(res, req.params.fingerprint, parsed.request)
  })

  r.get('/hosts/:fingerprint/figures', async (req, res) => {
    await run(res, req.params.fingerprint, { op: 'figures.read' })
  })

  r.get('/hosts/:fingerprint/logs', async (req, res) => {
    const q = req.query
    const parsed = parseHostRequest({
      op: 'logs.read',
      target: q.target ?? 'site',
      ...(typeof q.service === 'string' ? { service: q.service } : {}),
      ...(typeof q.since === 'string' ? { since: q.since } : {}),
      ...(typeof q.limit === 'string' ? { limit: Number(q.limit) } : {}),
    })
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.refusal.code, message: parsed.refusal.message })
      return
    }
    await run(res, req.params.fingerprint, parsed.request)
  })

  r.get('/commands/:id', (req, res) => {
    const found = ctx.runs.read(req.params.id, actorOf(res).userId)
    if (!found) {
      res.status(404).json({ error: 'not_found', message: 'No such command.' })
      return
    }
    respond(res, found)
  })

  return r
}

export function respond(res: Response, run: CommandRun): void {
  res.status(run.state === 'pending' ? 202 : 200).json({ command: run })
}
