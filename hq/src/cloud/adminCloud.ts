/**
 * Connecting hq to Agenthix Cloud and disconnecting it, by an organisation admin, in setup and on the AI page (models
 * from one place, part 2). The same device approval as before (`CloudConnection`): hq asks Cloud for a short code, the
 * admin approves it on Cloud's page, and hq waits. Every connection and disconnection is recorded and announced to
 * every admin by the connection's own hooks (`cloud/index.ts`).
 */
import { HttpError } from 'wasp/server'
import type { ConnectHqToCloud, DisconnectHqFromCloud, GetHqCloudConnection } from 'wasp/server/operations'
import type { CloudConnecting, HqCloudState } from '@agenthix/core'
import { isOrgAdmin } from '../projects/membership'
import { requireFeature } from '../features/requireFeature'
import { CloudBusyError, CloudCallError } from './cloudClient'
import { CloudConnectionError } from './cloudConnection'
import { cloudConnection, runByCloud } from '.'

/**
 * Whether hq can call Agenthix Cloud's models and voice. Not yet: they wait for the hosted side (part 6), so Cloud
 * connects as a provider that reads *not available yet* and setup's Cloud card cannot be chosen.
 */
export const CLOUD_AI_AVAILABLE = false

export type HqCloudConnection = HqCloudState & { aiAvailable: boolean }

const BAD_URL = 'CLOUD_URL is not an https address, so HQ does not know where Agenthix Cloud is.'

async function asOrgAdmin(context: { user?: { id: string } | null }): Promise<string> {
  if (!context.user) throw new HttpError(401)
  if (!(await isOrgAdmin(context.user.id))) throw new HttpError(403, 'Only an organisation admin connects HQ to Agenthix Cloud or disconnects it.')
  return context.user.id
}

function usable() {
  const c = cloudConnection()
  if (!c) throw new HttpError(409, BAD_URL)
  return c
}

async function answering<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof CloudBusyError) throw new HttpError(429, err.message)
    if (err instanceof CloudCallError || err instanceof CloudConnectionError) throw new HttpError(409, err.message)
    throw err
  }
}

export const getHqCloudConnection: GetHqCloudConnection<void, HqCloudConnection> = async (_args, context) => {
  await requireFeature('cloud')
  await asOrgAdmin(context)
  const c = cloudConnection()
  const state = c ? await c.state() : { connection: null, connecting: null, lastAttempt: null, problem: null }
  return { ...state, runByCloud: runByCloud(), aiAvailable: CLOUD_AI_AVAILABLE }
}

export const connectHqToCloud: ConnectHqToCloud<void, { connecting: CloudConnecting }> = async (_args, context) => {
  await requireFeature('cloud')
  const userId = await asOrgAdmin(context)
  return { connecting: await answering(() => usable().connect(userId)) }
}

export const disconnectHqFromCloud: DisconnectHqFromCloud<void, { disconnected: boolean }> = async (_args, context) => {
  await requireFeature('cloud')
  const userId = await asOrgAdmin(context)
  if (runByCloud()) throw new HttpError(409, 'HQ runs on Agenthix Cloud, so its connection to Cloud stays while Cloud runs it.')
  return { disconnected: await answering(() => usable().disconnect(userId)) }
}
