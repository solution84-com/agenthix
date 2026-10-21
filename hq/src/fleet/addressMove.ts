/**
 * The control-socket command `address-move <address>` (host-management spec §13): the host service on hq's machine
 * runs it just before it stops hq to move it to a new address. hq tells every connected site, host service and the
 * Fleet Console the new address over the connection each already has, and tells everyone in hq. Each switches only
 * once the new address passes the move check, and keeps the old one until then. Given hq's own address, it calls a
 * move off: those told stop waiting, and everyone is told hq stays where it is.
 */
import { prisma } from 'wasp/server'
import type { CommandResult } from '../auth/machine/hqMachineCommands'
import { hqAddress } from '../auth/hqLinks'
import { siteChannelRegistry } from '../sites/channel'
import { tellSitesNewAddress, type SitesTold } from '../sites/channel/addressNotice'
import { relayHub } from './index'
import { notificationsChanged } from '../server/personEvents'

export type AddressMoveDeps = {
  ownAddress: () => string
  tellSites: (address: string) => Promise<SitesTold>
  tellRelay: (address: string) => { hosts: number; console: boolean }
  /** Sites (the default one aside) and machines hq knows, connected or not. */
  totals: () => Promise<{ sites: number; hosts: number }>
  /** Everyone in hq, in a notification; how many. */
  tellPeople: (notice: { title: string; body: string }) => Promise<number>
}

const USAGE = 'Usage: address-move <address>, the address HQ moves to (http:// or https://, a host and perhaps a port)'
const ADDRESS = /^https?:\/\/[^/\s?#]+$/i

export type AddressMoveData = {
  address: string
  cancelled: boolean
  sites: { told: number; online: number; of: number }
  hosts: { told: number; of: number }
  console: boolean
  people: number
}

export async function addressMoveCommand(args: string[], deps: AddressMoveDeps = liveDeps()): Promise<CommandResult> {
  const address = args[0]?.trim()
  if (!address || args.length > 1 || !ADDRESS.test(address)) return { ok: false, error: USAGE, code: 'usage' }
  const own = deps.ownAddress()
  const cancelled = address.toLowerCase() === own.toLowerCase()
  const [sites, totals] = await Promise.all([deps.tellSites(address), deps.totals()])
  const relay = deps.tellRelay(address)
  const people = await deps.tellPeople(cancelled
    ? { title: 'HQ did not move', body: `HQ stays at ${own}. Nothing changed.` }
    : {
        title: 'HQ is moving to a new address',
        body: `HQ stops for a few minutes and starts again at ${address}; open it there from now on. Nothing is lost, and sites follow by themselves.`,
      })
  const data: AddressMoveData = {
    address, cancelled,
    sites: { ...sites, of: totals.sites },
    hosts: { told: relay.hosts, of: totals.hosts },
    console: relay.console,
    people,
  }
  const text = cancelled
    ? `The move is called off: HQ stays at ${own}. ${sites.told} of ${totals.sites} sites and ${relay.hosts} of ${totals.hosts} host services were told.`
    : `${sites.told} of ${totals.sites} sites and ${relay.hosts} of ${totals.hosts} host services were told HQ moves to ${address}${relay.console ? ', and the Fleet Console' : ''}. Each switches once the new address passes its check.`
  return { ok: true, text, data }
}

function liveDeps(): AddressMoveDeps {
  return {
    ownAddress: hqAddress,
    tellSites: async address => {
      const own = await prisma.executionSite.findFirst({ where: { isDefault: true }, select: { siteId: true } })
      return tellSitesNewAddress(siteChannelRegistry, address, own?.siteId ?? null)
    },
    tellRelay: address => relayHub.tellAddress(address),
    totals: async () => ({
      sites: await prisma.executionSite.count({ where: { revokedAt: null, isDefault: false } }),
      hosts: await prisma.relayHost.count({ where: { disconnectedAt: null, credentialHash: { not: null } } }),
    }),
    tellPeople: async notice => {
      const people = await prisma.user.findMany({ where: { deactivatedAt: null, erasedAt: null }, select: { id: true } })
      if (people.length === 0) return 0
      await prisma.notification.createMany({ data: people.map(p => ({ userId: p.id, type: 'hq_address_move', ...notice })) })
      notificationsChanged(people.map(p => p.id))
      return people.length
    },
  }
}
