/**
 * A machine's nights, and *Restore…* on one (spec §12): the list is the machine's own sealed answer to `backup.list`;
 * a restore goes only through here, with the machine's name typed to confirm, and is recorded with the night it goes
 * back to, as the machine listed it — never words the screen sent.
 */
import { Router, type Response } from 'express'
import { parseHostRequest, type BackupListed, type HostRequest, type HostResults } from '@agenthix/core'
import type { ConsoleContext } from '../app'
import type { PinnedHost } from '../../state/hosts'
import { listedAs } from '../../state/hosts'
import { HostCommandError } from '../../hosts/commands'
import { timeInRecord } from '../../activity'
import { actorOf } from './fleet'
import { respond } from './commands'

const INLINE_WAIT_MS = 20_000

type Listing = { ok: true; listing: HostResults['backup.list'] } | { ok: false; status: number; error: string; message: string }

async function listOf(ctx: ConsoleContext, host: PinnedHost, res: Response): Promise<Listing> {
  try {
    const answer = await ctx.commands.send(host.fingerprint, { op: 'backup.list' }, actorOf(res))
    if (answer.ok && answer.op === 'backup.list') return { ok: true, listing: answer.result as HostResults['backup.list'] }
    return { ok: false, status: 409, error: answer.ok ? 'failed' : answer.refusal.code, message: answer.ok ? 'The machine gave another answer.' : answer.refusal.message }
  } catch (err) {
    const message = err instanceof HostCommandError || err instanceof Error ? err.message : 'The machine did not answer.'
    return { ok: false, status: 502, error: 'no_answer', message }
  }
}

const sameName = (typed: unknown, name: string) => typeof typed === 'string' && typed.trim().toLowerCase() === name.toLowerCase()

/** `office-server: back to the night of 2026-10-14`, or at a time, as planned maintenance reads. */
export function restoreSubject(machine: string, night: string, at: string | null): string {
  return at ? `${machine}: restore to the night of ${night}, at ${timeInRecord(at)}` : `${machine}: back to the night of ${night}`
}

export function backupRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  r.get('/hosts/:fingerprint/backups', async (req, res) => {
    const host = ctx.hosts.byFingerprint(req.params.fingerprint)
    if (!host) {
      res.status(404).json({ error: 'not_found', message: 'That machine is not connected to this Fleet Console.' })
      return
    }
    const listed = await listOf(ctx, host, res)
    if (!listed.ok) {
      res.status(listed.status).json({ error: listed.error, message: listed.message })
      return
    }
    res.json(listed.listing)
  })

  r.post('/hosts/:fingerprint/restore', async (req, res) => {
    const host = ctx.hosts.byFingerprint(req.params.fingerprint)
    if (!host) {
      res.status(404).json({ error: 'not_found', message: 'That machine is not connected to this Fleet Console.' })
      return
    }
    const body = (req.body ?? {}) as Record<string, unknown>
    if (!sameName(body.confirmName, host.machineName)) {
      res.status(400).json({ error: 'malformed', message: `Type the machine's name, ${host.machineName}, to confirm.` })
      return
    }
    const source = body.from === 'location' ? { from: 'location', backupId: body.backupId, key: body.key } : { from: 'machine', backupId: body.backupId }
    const change = { op: 'backup.restore', target: host.hqMachine ? 'hq' : 'site', source }
    const at = typeof body.at === 'string' ? body.at : null
    const parsed = parseHostRequest(at ? { op: 'schedule', at, change } : change)
    if (!parsed.ok) {
      const message = at && body.from === 'location'
        ? 'A copy in the backup location is restored now, with its key; only a night kept on the machine can be restored at a time.'
        : parsed.refusal.message
      res.status(400).json({ error: parsed.refusal.code, message })
      return
    }
    const listed = await listOf(ctx, host, res)
    if (!listed.ok) {
      res.status(listed.status).json({ error: listed.error, message: listed.message })
      return
    }
    const backup: BackupListed | undefined = listed.listing.backups.find(b => b.id === body.backupId)
    if (!backup || (body.from === 'location' ? !backup.inLocation : !backup.onMachine)) {
      res.status(404).json({ error: 'not_found', message: `That backup is no longer ${body.from === 'location' ? 'in the backup location' : `on ${host.machineName}`}. Choose another night.` })
      return
    }
    const by = actorOf(res)
    const request: HostRequest = parsed.request
    const started = ctx.runs.start(by.userId, host.fingerprint, request.op, ctx.commands.send(host.fingerprint, request, by))
    await ctx.activity.command(by.userId, request.op, restoreSubject(listedAs(host), backup.night, at), at ? 'backup.restore' : undefined)
    await ctx.runs.settle(started, INLINE_WAIT_MS)
    respond(res, ctx.runs.read(started.id, by.userId)!)
  })

  return r
}
