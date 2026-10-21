/**
 * hq's side of host management (host-management spec §4 C3 and C8): the host link, the console link and the relay
 * between them, wired to the database. Started beside the site channel, on the same http server.
 */
import type { Server as HttpServer } from 'node:http'
import { fingerprintOf } from '@agenthix/core/host-crypto'
import { RelayHub } from './relay/relayHub'
import { attachHostLink } from './relay/hostLinkServer'
import { attachConsoleLink } from './relay/consoleLinkServer'
import { ConsoleRefusal, consoleRequestHandler, type ConsoleServices } from './consoleMethods'
import { authenticateHost, connectedHosts, disconnectHost, keepSilenceFacts, knownHost, touchHost } from './hosts'
import { acceptJoin, claimJoin, endJoin, endJoinsOpenedBefore, openJoin, recordJoinRequest } from './joins'
import { authenticateConsole, redeemConsoleCode } from './consoleCredential'
import { checkSignIn } from './signInCheck'
import { registerSite, removeSite } from './siteCredentials'
import { grantFleetAdmin, listFleetAdmins, revokeFleetAdmin, type RoleChange } from './fleetAdminRole'
import { recordConsoleActivity } from './activity'
import { activityPage, dismissFleetNotice, findAccount, fleetNotices } from './fleetRecord'
import { reconcileMachineNotices, startMachineNotices } from '../sites/machineNotices'
import { moveSite, openTransfer } from './siteMove'
import { hqAbout, siteLoads } from './consoleFacts'
import { cloudConsoleServices } from '../cloud'
import {
  acceptHandover, claimHandover, closeHandover, completeHandover, completeHandoverWithCredential, handoverCertificates,
  issueHandoverCredential, openHandover, recordHandoverAsk,
} from './handover'

export const relayHub = new RelayHub({ knownHost })

function roleChanged(change: RoleChange): boolean {
  if (!change.ok) throw new ConsoleRefusal(change.code, change.message)
  return change.changed
}

export function consoleServices(hub: RelayHub): ConsoleServices {
  return {
    'signIn.check': ({ username, password }) => checkSignIn(username, password),
    'join.open': params => openJoin(params),
    'join.close': async ({ joinId }) => ({ closed: await endJoin(hub, joinId, 'CLOSED') }),
    'join.accept': ({ joinId, acceptance }) => acceptJoin(hub, joinId, acceptance),
    'join.refuse': async ({ joinId }) => ({ refused: await endJoin(hub, joinId, 'REFUSED') }),
    'host.list': async () => ({
      hosts: (await connectedHosts()).map(h => {
        const since = hub.onlineSince(h.hostId)
        return {
          hostId: h.hostId,
          fingerprint: h.fingerprint,
          machineName: h.machineName,
          online: since !== null,
          since: (since ?? h.lastSeenAt ?? h.joinedAt).toISOString(),
          ...(h.leftAt ? { leftAt: h.leftAt.toISOString() } : {}),
        }
      }),
    }),
    'host.disconnect': async ({ hostId }) => {
      // The credential first: once it is gone a reconnect is refused, so closing the link cannot race one back in.
      const disconnected = await disconnectHost(hostId)
      hub.revokeHost(hostId)
      // A machine removed is no longer one fleet admins are asked about.
      void reconcileMachineNotices()
      return { disconnected }
    },
    'site.register': params => registerSite(params),
    'site.remove': params => removeSite(params),
    'fleetAdmin.grant': async ({ userId, byUserId }) => ({ granted: roleChanged(await grantFleetAdmin(userId, { userId: byUserId })) }),
    'fleetAdmin.revoke': async ({ userId, byUserId }) => ({ revoked: roleChanged(await revokeFleetAdmin(userId, { userId: byUserId })) }),
    'fleetAdmin.list': async () => ({ admins: await listFleetAdmins() }),
    'activity.record': async params => {
      if (!(await recordConsoleActivity({ ...params, at: new Date(params.at) }))) throw new ConsoleRefusal('not_found', 'No one in HQ has that account.')
      return { recorded: true }
    },
    'handover.open': params => openHandover(params),
    // The answer is passed only if the new Fleet Console is still waiting for it; hq reads none of it.
    'handover.accept': async ({ handoverId, acceptance }) => ({
      passed: (await acceptHandover(handoverId, acceptance.identity)) && hub.passHandover(handoverId, acceptance),
    }),
    'handover.close': async ({ handoverId }) => ({ closed: await closeHandover(handoverId) }),
    'transfer.open': params => openTransfer(hub, params),
    'transfer.close': async ({ transferId }) => ({ closed: hub.transfers.close(transferId) }),
    'site.move': params => moveSite(params),
    'hq.about': () => hqAbout(),
    'site.loads': () => siteLoads(),
    'activity.list': ({ byUserId, after }) => activityPage(byUserId, after),
    'notices.list': ({ byUserId }) => fleetNotices(byUserId),
    'notices.dismiss': ({ byUserId, noticeId }) => dismissFleetNotice(byUserId, noticeId),
    'account.find': ({ byUserId, username }) => findAccount(byUserId, username),
    // A notification preference only: it decides hq's *not heard from* notice, and gives no authority over anything.
    'host.silenceFacts': async facts => {
      const kept = await keepSilenceFacts(facts)
      if (kept) void reconcileMachineNotices()
      return { kept }
    },
    // hq's connection to Agenthix Cloud: hq decides who may connect it (cloud/index.ts).
    ...cloudConsoleServices(),
  }
}

export function startFleetLinks(server: HttpServer): void {
  // A transfer that outlived its time, or fell silent, is dropped by hq's own clock.
  setInterval(() => relayHub.transfers.sweep(), 30_000).unref()
  startMachineNotices(relayHub)
  attachHostLink(server, {
    hub: relayHub,
    authenticateHost,
    claimJoin: lookup => claimJoin(lookup),
    recordJoinRequest: (joinId, request) => recordJoinRequest(joinId, request),
    fingerprintOf,
    touchHost: hostId => touchHost(hostId),
    handoverCertificates: () => handoverCertificates(),
  })
  attachConsoleLink(server, {
    hub: relayHub,
    authenticateConsole: presented => authenticateConsole(presented),
    redeemConsoleCode: lookup => redeemConsoleCode(lookup),
    claimHandover: lookup => claimHandover(lookup),
    recordHandoverAsk: (handoverId, identity) => recordHandoverAsk(handoverId, identity),
    issueHandoverCredential: (handoverId, certificate) => issueHandoverCredential(handoverId, certificate),
    completeHandover: handoverId => completeHandover(handoverId),
    completeHandoverWithCredential: presented => completeHandoverWithCredential(presented),
    handleRequest: consoleRequestHandler(consoleServices(relayHub)),
    consoleStarted: async at => { await endJoinsOpenedBefore(relayHub, at) },
  })
}
