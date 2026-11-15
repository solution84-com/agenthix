/**
 * hq's connection to Agenthix Cloud, wired to the database and to Cloud's address, and the console link's methods for
 * it. Who may do what is decided here: reading the state needs the fleet admin role; connecting and disconnecting are
 * the organisation admin's alone, in hq's admin area (adminCloud.ts), since the connection is the organisation's.
 */
import { prisma } from 'wasp/server'
import { configuredCloudUrl, parseCloudBaseUrl, type CloudOrganisationConnection, type CloudUrl } from '@agenthix/core'
import { hqAbout } from '../fleet/consoleFacts'
import { recordActivity } from '../fleet/activity'
import { ConsoleRefusal, type ConsoleServices } from '../fleet/consoleMethods'
import { cloudClient } from './cloudClient'
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
import { setCloudProviderState } from '../providers/health'
import { supplyCloudProvider } from '../providers/write'
import { CLOUD_FLAG, cloudFeatureOn } from './flag'
import { notAvailable } from '../features/requireFeature'

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

// The same words as providers/write.ts gives a newly added Agenthix Cloud provider.
const CLOUD_NOT_AVAILABLE = 'Agenthix Cloud does not offer models and voice to this HQ yet.'

/**
 * An organisation admin's connection adds Agenthix Cloud as a provider (or brings back one that was disconnected). A
 * connection Cloud made on a machine it runs, or one made from hq's machine, adds it through its own paths. Never
 * fails the connection.
 */
async function provideCloudAfterConnect(byUserId: string | null): Promise<void> {
  if (!byUserId) return
  try {
    const { provider } = await supplyCloudProvider({ kind: 'organisation_admin', userId: byUserId })
    if (provider.state === 'disconnected') await setCloudProviderState('not_available', CLOUD_NOT_AVAILABLE)
  } catch (err) {
    logger.warn(`Agenthix Cloud not added as a provider: ${err instanceof Error ? err.message : String(err)}`)
  }
}

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
    onConnected: async (c, byUserId) => {
      await recordActivity({ byUserId, action: 'cloud.connected', subject: c.name, at: new Date(), announce: true })
      await provideCloudAfterConnect(byUserId)
    },
    onDisconnected: async (c, byUserId) => {
      await recordActivity({ byUserId, action: 'cloud.disconnected', subject: c.name, at: new Date(), announce: true })
      await setCloudProviderState('disconnected', 'HQ is not connected to Agenthix Cloud.')
    },
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

/** A scheduled change was kept: when Cloud is on and connected, Cloud is asked to email the members it affects the day before. */
export async function emailAboutScheduledChange(change: DowntimeChange): Promise<boolean> {
  if (!(await cloudFeatureOn())) return false
  return askCloudToEmail(change, { connection: cloudConnection, linkedAccountsAffected })
}

const ACTIVE = { deactivatedAt: null, erasedAt: null } as const

/** First in each of the console link's Cloud methods: refused, doing nothing, while Agenthix Cloud is off. */
async function mustBeOn(): Promise<void> {
  if (!(await cloudFeatureOn())) throw new ConsoleRefusal('not_found', notAvailable(CLOUD_FLAG).message)
}

async function mustBeFleetAdmin(userId: string): Promise<void> {
  if (!(await prisma.user.count({ where: { id: userId, fleetAdmin: true, ...ACTIVE } }))) {
    throw new ConsoleRefusal('not_allowed', 'Only a fleet admin sees HQ\'s connection to Agenthix Cloud.')
  }
}

const facts = platformFacts(platformFactsStore)

export function cloudConsoleServices(): Pick<ConsoleServices, 'cloud.state' | 'cloud.askCount' | 'cloud.offers' | 'cloud.dismissOffer'> {
  return {
    'cloud.state': async ({ byUserId }) => {
      await mustBeOn()
      await mustBeFleetAdmin(byUserId)
      const c = cloudConnection()
      return { ...(c ? await c.state() : { connection: null, connecting: null, lastAttempt: null, problem: null }), runByCloud: runByCloud() }
    },
    'cloud.askCount': async ({ byUserId }) => {
      await mustBeOn()
      await mustBeFleetAdmin(byUserId)
      return { count: await facts.askCount() }
    },
    'cloud.offers': async ({ byUserId }) => {
      await mustBeOn()
      await mustBeFleetAdmin(byUserId)
      return { dismissed: await facts.dismissed(byUserId) }
    },
    'cloud.dismissOffer': async ({ byUserId, offer }) => {
      await mustBeOn()
      await mustBeFleetAdmin(byUserId)
      return { dismissed: await facts.dismiss(byUserId, offer) }
    },
  }
}
