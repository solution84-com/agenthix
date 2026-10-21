/**
 * hq's connection to Agenthix Cloud, wired to the database and to Cloud's address, and the console link's methods for
 * it. Who may do what is decided here: reading the state needs the fleet admin role; connecting and disconnecting need
 * the fleet admin role and the organisation admin role together, since the connection is the organisation's.
 */
import { prisma } from 'wasp/server'
import { configuredCloudUrl, parseCloudBaseUrl, type CloudOrganisationConnection, type CloudUrl } from '@agenthix/core'
import { hqAbout } from '../fleet/consoleFacts'
import { recordActivity } from '../fleet/activity'
import { ConsoleRefusal, type ConsoleServices } from '../fleet/consoleMethods'
import { CloudBusyError, CloudCallError, cloudClient } from './cloudClient'
import { CloudConnection, CloudConnectionError } from './cloudConnection'
import { cloudConnectionStore, cloudKeyStore } from './cloudStores'
import { CloudSignIn } from './cloudSignIn'
import { SignInFlows } from './signInFlows'
import { cloudLinkStore, linkedAccountsAffected, makeBrowserSession, passwordIsRight, tellLinkedPeopleSignInEnds } from './cloudAccounts'
import { askCloudToEmail, type DowntimeChange } from './downtimeEmail'
import { hqAddress } from '../auth/hqLinks'
import { platformFacts } from './platformFacts'
import { platformFactsStore } from './platformFactsStore'
import { PledgeStatuses } from './pledgeStatus'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Cloud')

/** `CLOUD_URL`, or Cloud's own address. One that is not https (or http to this machine) is refused at use. */
export function cloudBaseUrl(env: NodeJS.ProcessEnv = process.env): CloudUrl | null {
  return parseCloudBaseUrl(configuredCloudUrl(env))
}

/** Set by the host service on a machine Agenthix Cloud runs (`host/src/compose/projects.ts`). */
export function runByCloud(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HQ_RUN_BY_CLOUD === 'true'
}

const BAD_URL = 'CLOUD_URL is not an https address, so HQ does not know where Agenthix Cloud is.'

let instance: CloudConnection | null = null

/** The one connection this hq has; null when Cloud's address is not usable. */
export function cloudConnection(): CloudConnection | null {
  if (instance) return instance
  const base = cloudBaseUrl()
  if (!base) return null
  instance = new CloudConnection({
    client: cloudClient(base, fetch, Date.now, message => logger.warn(message)),
    connections: cloudConnectionStore,
    keys: cloudKeyStore,
    about: hqAbout,
    onConnected: (c, byUserId) => recordActivity({ byUserId, action: 'cloud.connected', subject: c.name, at: new Date(), announce: true }),
    onDisconnected: (c, byUserId) => recordActivity({ byUserId, action: 'cloud.disconnected', subject: c.name, at: new Date(), announce: true }),
    onEnding: tellLinkedPeopleSignInEnds,
  })
  return instance
}

/**
 * Cloud connecting an hq it runs (adr-0135), asked over hq's control socket by the host service. Refused anywhere the
 * host service has not told hq that Cloud runs its machine.
 */
export async function cloudConnectionKey(): Promise<{ publicKey: string; clientId: string; hqAddress: string }> {
  return (await connectionCloudMayMake()).keyForCloud()
}

export async function connectByCloud(organisation: { cloudOrganisationId: string; name: string }): Promise<CloudOrganisationConnection> {
  return (await connectionCloudMayMake()).connectedByCloud(organisation)
}

async function connectionCloudMayMake(): Promise<CloudConnection> {
  if (!runByCloud()) throw new CloudConnectionError('Agenthix Cloud does not run this HQ, so it connects only when an admin approves it.')
  const c = cloudConnection()
  if (!c) throw new CloudConnectionError(BAD_URL)
  return c
}

let pledgeStatuses: PledgeStatuses | null = null

/** Whether a person with a linked account signed the Responsible AI Pledge, asked of Cloud and kept for a while. */
export function cloudPledgeStatuses(): PledgeStatuses {
  pledgeStatuses ??= new PledgeStatuses({
    connection: cloudConnection,
    subjectOf: async userId => {
      const base = cloudBaseUrl()
      const link = await prisma.cloudAccountLink.findUnique({ where: { userId }, select: { issuer: true, subject: true } })
      return link && base && link.issuer === base.origin ? link.subject : null
    },
  })
  return pledgeStatuses
}

let signIn: CloudSignIn | null = null

/** Signing in with an Agenthix account, over the connection. */
export function cloudSignIn(): CloudSignIn {
  signIn ??= new CloudSignIn({
    connection: cloudConnection,
    base: cloudBaseUrl(),
    hqAddress,
    links: cloudLinkStore,
    flows: new SignInFlows(),
    passwordIsRight,
    makeSession: makeBrowserSession,
  })
  return signIn
}

/** A scheduled change was kept: when connected, Cloud is asked to email the members it affects the day before. */
export function emailAboutScheduledChange(change: DowntimeChange): Promise<boolean> {
  return askCloudToEmail(change, { connection: cloudConnection, linkedAccountsAffected })
}

const ACTIVE = { deactivatedAt: null, erasedAt: null } as const

async function mustBeFleetAdmin(userId: string): Promise<void> {
  if (!(await prisma.user.count({ where: { id: userId, fleetAdmin: true, ...ACTIVE } }))) {
    throw new ConsoleRefusal('not_allowed', 'Only a fleet admin sees HQ\'s connection to Agenthix Cloud.')
  }
}

async function mustBeOrganisationAdmin(userId: string): Promise<void> {
  const count = await prisma.user.count({ where: { id: userId, fleetAdmin: true, ...ACTIVE, settings: { role: 'ADMIN' } } })
  if (!count) throw new ConsoleRefusal('not_allowed', 'Only an organisation admin who is also a fleet admin connects HQ to Agenthix Cloud or disconnects it.')
}

function usable(): CloudConnection {
  const c = cloudConnection()
  if (!c) throw new ConsoleRefusal('failed', BAD_URL)
  return c
}

async function refusingFailures<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof CloudBusyError) throw new ConsoleRefusal('rate_limited', err.message)
    if (err instanceof CloudCallError || err instanceof CloudConnectionError) throw new ConsoleRefusal('failed', err.message)
    throw err
  }
}

const facts = platformFacts(platformFactsStore)

export function cloudConsoleServices(): Pick<ConsoleServices, 'cloud.state' | 'cloud.connect' | 'cloud.disconnect' | 'cloud.askCount' | 'cloud.offers' | 'cloud.dismissOffer'> {
  return {
    'cloud.state': async ({ byUserId }) => {
      await mustBeFleetAdmin(byUserId)
      const c = cloudConnection()
      return { ...(c ? await c.state() : { connection: null, connecting: null, lastAttempt: null, problem: null }), runByCloud: runByCloud() }
    },
    'cloud.connect': async ({ byUserId }) => {
      await mustBeOrganisationAdmin(byUserId)
      return { connecting: await refusingFailures(() => usable().connect(byUserId)) }
    },
    'cloud.disconnect': async ({ byUserId }) => {
      await mustBeOrganisationAdmin(byUserId)
      if (runByCloud()) throw new ConsoleRefusal('not_allowed', 'HQ runs on Agenthix Cloud, so its connection to Cloud stays while Cloud runs it.')
      return { disconnected: await refusingFailures(() => usable().disconnect(byUserId)) }
    },
    'cloud.askCount': async ({ byUserId }) => {
      await mustBeFleetAdmin(byUserId)
      return { count: await facts.askCount() }
    },
    'cloud.offers': async ({ byUserId }) => {
      await mustBeFleetAdmin(byUserId)
      return { dismissed: await facts.dismissed(byUserId) }
    },
    'cloud.dismissOffer': async ({ byUserId, offer }) => {
      await mustBeFleetAdmin(byUserId)
      return { dismissed: await facts.dismiss(byUserId, offer) }
    },
  }
}
