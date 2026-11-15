/**
 * Core's `SITE_RESTORE_RENEW_PATH`: the database and the live connections behind `siteRestore.ts`'s rules (adr-0119).
 */
import { prisma } from 'wasp/server'
import type { SiteRestoreRenewApi } from 'wasp/server/api'
import { SITE_RESTORE_MACHINE_HEADER, type JoinPurpose } from '@agenthix/core'
import { credentialMatches, hashCredential } from '../sites/credentials'
import { siteChannelRegistry } from '../sites/channel'
import { contentChannelRegistry } from '../sites/content'
import { authenticateHost } from './hosts'
import { recordActivity } from './activity'
import { relayHub } from './index'
import { renewRestoredSite, type CommitOutcome, type SiteRestoreDeps } from './siteRestore'

/** How long after a fleet admin confirmed the machine its restore may renew the site: a large backup takes a while. */
export const RESTORE_JOIN_WINDOW_MS = 24 * 60 * 60_000

async function siteByCredential(credential: string) {
  const row = await prisma.executionSite.findFirst({
    where: { credentialHash: hashCredential(credential), isDefault: false, relayHostId: { not: null }, status: { not: 'REVOKED' } },
    select: { id: true, siteId: true, label: true, credentialHash: true, relayHostId: true },
  })
  return row?.credentialHash && credentialMatches(credential, row.credentialHash) ? { ...row, credentialHash: row.credentialHash } : null
}

async function restoreJoinOf(hostId: string, now: Date) {
  const join = await prisma.relayJoin.findFirst({
    where: { relayHostId: hostId, state: 'ACCEPTED', createdAt: { gt: new Date(now.getTime() - RESTORE_JOIN_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, purpose: true },
  })
  const purpose = join?.purpose as JoinPurpose | null | undefined
  return join && purpose?.kind === 'restoreSite' ? { joinId: join.id, executionSiteId: purpose.siteId } : null
}

async function commit(p: { executionSiteId: string; expectedHash: string; newHash: string; hostId: string; joinId: string; label: string }): Promise<CommitOutcome> {
  return prisma.$transaction(async tx => {
    // The same lock as registering and moving a site: a machine carries at most one (ADR-0108).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('site-register', 0))`
    const site = await tx.executionSite.findUnique({ where: { id: p.executionSiteId }, select: { credentialHash: true, status: true } })
    if (!site || site.status === 'REVOKED' || site.credentialHash !== p.expectedHash) return { ok: false, reason: 'changed' } as const
    const carried = await tx.executionSite.findFirst({
      where: { relayHostId: p.hostId, status: { not: 'REVOKED' }, id: { not: p.executionSiteId } }, select: { label: true },
    })
    if (carried) return { ok: false, reason: 'carries', label: carried.label } as const
    if (await tx.executionSite.count({ where: { credentialHash: p.newHash } })) return { ok: false, reason: 'inUse' } as const
    // The code's confirmation is spent: one restore per code.
    const spent = await tx.relayJoin.updateMany({ where: { id: p.joinId, state: 'ACCEPTED' }, data: { state: 'USED' } })
    if (spent.count !== 1) return { ok: false, reason: 'changed' } as const
    await tx.executionSite.update({
      where: { id: p.executionSiteId },
      data: {
        credentialHash: p.newHash, relayHostId: p.hostId, label: p.label,
        // The old machine's copy is refused from now on, and told why (`replacedSiteAt`).
        replacedCredentialHash: p.expectedHash, replacedAt: new Date(),
      },
    })
    return { ok: true } as const
  })
}

export function siteRestoreDeps(now = () => new Date()): SiteRestoreDeps {
  return {
    siteByCredential,
    hostByCredential: async credential => {
      const peer = await authenticateHost(credential)
      if (!peer) return null
      const row = await prisma.relayHost.findUnique({ where: { id: peer.hostId }, select: { machineName: true } })
      return row ? { hostId: peer.hostId, machineName: row.machineName } : null
    },
    restoreJoinOf: hostId => restoreJoinOf(hostId, now()),
    machineName: async hostId => (await prisma.relayHost.findUnique({ where: { id: hostId }, select: { machineName: true } }))?.machineName ?? null,
    commit,
    siteConnected: siteId => siteChannelRegistry.isOnline(siteId) || contentChannelRegistry.current(siteId) !== null,
    hostOnline: hostId => relayHub.isHostOnline(hostId),
    closeSite: siteId => {
      siteChannelRegistry.closeForRotation(siteId)
      contentChannelRegistry.closeForRotation(siteId)
    },
    announce: ({ label, machine }) => recordActivity({
      byUserId: null,
      action: 'site.restored',
      subject: label.toLowerCase() === machine.toLowerCase()
        ? `${label} now runs on a new machine of the same name`
        : `${label} now runs on ${machine}, and is named ${machine}`,
      at: now(),
      announce: true,
    }),
  }
}

const bearer = (v: string | undefined) => (v?.startsWith('Bearer ') ? v.slice('Bearer '.length).trim() : '')

export const siteRestoreRenewHandler: SiteRestoreRenewApi = async (req, res) => {
  const machine = req.headers[SITE_RESTORE_MACHINE_HEADER.toLowerCase()]
  const reply = await renewRestoredSite({
    siteCredential: bearer(req.headers.authorization),
    machineCredential: typeof machine === 'string' ? machine.trim() : '',
    body: req.body,
  }, siteRestoreDeps())
  res.status(reply.status).json(reply.body)
}
