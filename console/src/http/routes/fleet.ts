import { Router, type Response } from 'express'
import { formatFingerprint, type HostActor, type SiteLoad } from '@agenthix/core'
import { disconnectHost } from '../../hosts/disconnect'
import { listedAs, notifiesIfSilent, type PinnedHost } from '../../state/hosts'
import { sessionOf } from '../guards'
import type { ConsoleContext } from '../app'

export function actorOf(res: Response): HostActor & { kind: 'fleetAdmin' } {
  const { user } = sessionOf(res)
  return { kind: 'fleetAdmin', userId: user.id, name: user.name }
}

export function fleetRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  const moveOf = (fingerprint: string) => {
    const m = ctx.moves.of(fingerprint)
    if (!m) return null
    return { moveId: m.moveId, role: m.from === fingerprint ? 'sending' : 'receiving', siteName: m.siteName, state: m.state, at: m.at }
  }

  const endedMoveOf = (fingerprint: string) => {
    const m = ctx.moves.endedTo(fingerprint)
    return m ? { moveId: m.moveId, siteName: m.siteName, state: m.state } : null
  }

  /**
   * The runs of the site a machine carries, as hq last heard them: hq's default site on the machine this Fleet Console
   * knows carries hq, any other by the id hq gave it when it was registered.
   */
  const agentsOf = (h: PinnedHost, loads: SiteLoad[] | null) => {
    const load = loads?.find(l => (h.hqMachine === true && l.isDefault) || (h.executionSiteId !== null && l.executionSiteId === h.executionSiteId))
    return load ? { running: load.running, maxAtOnce: load.maxAtOnce, reportedAt: load.reportedAt } : null
  }

  const hostView = (h: PinnedHost, loads: SiteLoad[] | null) => {
    const p = ctx.presence.of(h.fingerprint)
    return {
      fingerprint: h.fingerprint,
      fingerprintShort: formatFingerprint(h.fingerprint),
      hostId: h.hostId,
      machineName: h.machineName,
      siteName: h.siteName,
      hqMachine: h.hqMachine === true,
      siteRegistered: h.executionSiteId !== null,
      connectedAt: h.connectedAt,
      online: p.online,
      since: p.since,
      // Disconnected on the machine itself: not switched off, and waiting to be removed (spec §6).
      leftByItself: p.leftAt !== null,
      leftAt: p.leftAt,
      // Whether the fleet admins are told when it stops answering; always for hq's machine (hosts/silence.ts).
      notifyIfSilent: notifiesIfSilent(h),
      // It said it stops on purpose, and has not answered since.
      stoppedAt: ctx.silence.stoppedAt(h.fingerprint),
      figures: p.figures,
      figuresAt: p.figuresAt,
      agents: agentsOf(h, loads),
      scheduled: p.scheduled,
      // *Waiting to receive office*, or the site on it moving away (move/moves.ts).
      move: moveOf(h.fingerprint),
      // The last move to it ended without happening: it carries no site, and can take the next move.
      endedMove: endedMoveOf(h.fingerprint),
    }
  }

  r.get('/fleet', async (_req, res) => {
    // Figures missing or old are asked for now and shown at the next read; the answer is not waited for.
    ctx.figures.refreshStale(actorOf(res))
    const [hq, loads, hqRelay] = await Promise.all([ctx.hqFacts.hq(), ctx.hqFacts.siteLoads(), ctx.hqFacts.hqRelay()])
    res.json({
      console: {
        machineName: ctx.machineName,
        version: ctx.version,
        fingerprintShort: formatFingerprint(ctx.consoleFingerprint),
        hq: ctx.link.state,
      },
      // The organisation's name and HQ's address, for the words on the screen; null when hq has not said.
      hq,
      // hq's own relay, as it last reported; null when hq has none or does not say.
      hqRelay,
      hosts: ctx.hosts.list().map(h => hostView(h, loads)),
      // Disconnected here, and listed until a fleet admin removes them from the list (spec §6).
      disconnected: ctx.hosts.disconnected.list(),
    })
  })

  r.get('/hosts/:fingerprint', async (req, res) => {
    const host = ctx.hosts.byFingerprint(req.params.fingerprint)
    if (!host) {
      res.status(404).json({ error: 'not_found', message: 'That machine is not connected to this Fleet Console.' })
      return
    }
    res.json({ host: hostView(host, await ctx.hqFacts.siteLoads()) })
  })

  r.post('/hosts/:fingerprint/disconnect', async (req, res) => {
    const result = await disconnectHost(ctx, req.params.fingerprint, actorOf(res))
    if (!result.done) {
      res.status(result.status).json({ error: result.status === 404 ? 'not_found' : 'conflict', message: result.message })
      return
    }
    res.json({ disconnected: true })
  })

  /** *Notify the fleet admins if this machine stops answering*, on the machine's page. Not asked of hq's machine. */
  r.put('/hosts/:fingerprint/notify', async (req, res) => {
    const notify = (req.body as Record<string, unknown> | undefined)?.notify
    if (typeof notify !== 'boolean') {
      res.status(400).json({ error: 'malformed', message: 'Say whether to notify the fleet admins, true or false.' })
      return
    }
    const host = ctx.hosts.byFingerprint(req.params.fingerprint)
    if (!host) {
      res.status(404).json({ error: 'not_found', message: 'That machine is not connected to this Fleet Console.' })
      return
    }
    if (host.hqMachine) {
      res.status(409).json({ error: 'conflict', message: "HQ's machine is always told about: when it stops answering, HQ is down." })
      return
    }
    if (notifiesIfSilent(host) !== notify) {
      ctx.hosts.update(host.fingerprint, { notifyIfSilent: notify })
      // hq raises the one notice about a silent machine, so it is told the setting (hosts/silence.ts).
      void ctx.silence.sync()
      await ctx.activity.record(actorOf(res).userId, 'machine.notifySet',
        `${listedAs(host)}: ${notify ? 'notify' : 'do not notify'} the fleet admins if it stops answering`, false)
    }
    res.json({ host: hostView(ctx.hosts.byFingerprint(host.fingerprint)!, await ctx.hqFacts.siteLoads()) })
  })

  r.delete('/fleet/disconnected/:id', (req, res) => {
    if (!ctx.hosts.disconnected.dismiss(req.params.id)) {
      res.status(404).json({ error: 'not_found', message: 'That machine is no longer listed.' })
      return
    }
    res.status(204).end()
  })

  return r
}
