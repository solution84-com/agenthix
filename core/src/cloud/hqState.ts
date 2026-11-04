/**
 * What the Fleet Console reads of hq's connection to Cloud over the console link (`cloud.state`, `cloud.connect`),
 * checked before a screen shows any of it: a user code that is not one, or a page that is not http or https (http is the loopback stand-in), is not shown.
 */
import type { CloudConnectEnded, CloudConnecting, CloudOrganisationConnection, HqCloudState } from '../host/cloud.js'
import { USER_CODE, isCloudOrganisationId } from './connection.js'

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isTime(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))
}

function isPage(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 2048 && /^https?:\/\/[^\s]+$/.test(v)
}

export function parseCloudConnecting(v: unknown): CloudConnecting | null {
  const d = record(v)
  if (!d || typeof d.userCode !== 'string' || !USER_CODE.test(d.userCode)) return null
  if (!isPage(d.verificationUri) || !isPage(d.verificationUriComplete) || !isTime(d.expiresAt)) return null
  return { userCode: d.userCode, verificationUri: d.verificationUri, verificationUriComplete: d.verificationUriComplete, expiresAt: d.expiresAt }
}

export function parseCloudOrganisationConnection(v: unknown): CloudOrganisationConnection | null {
  const d = record(v)
  if (!d || !isCloudOrganisationId(d.cloudOrganisationId)) return null
  if (typeof d.name !== 'string' || !d.name || d.name.length > 200 || !isTime(d.connectedAt)) return null
  return { cloudOrganisationId: d.cloudOrganisationId, name: d.name, connectedAt: d.connectedAt }
}

const ENDED = new Set<string>(['refused', 'expired', 'failed'])

/** Null when the answer is not the shape: the Fleet Console then shows nothing of it. */
export function parseHqCloudState(v: unknown): HqCloudState | null {
  const d = record(v)
  if (!d) return null
  const connection = d.connection === null ? null : parseCloudOrganisationConnection(d.connection)
  const connecting = d.connecting === null ? null : parseCloudConnecting(d.connecting)
  if ((d.connection !== null && !connection) || (d.connecting !== null && !connecting)) return null
  const lastAttempt = d.lastAttempt === null ? null : typeof d.lastAttempt === 'string' && ENDED.has(d.lastAttempt) ? d.lastAttempt as CloudConnectEnded : undefined
  if (lastAttempt === undefined) return null
  if (typeof d.runByCloud !== 'boolean') return null
  const problem = typeof d.problem === 'string' && d.problem && d.problem.length <= 500 ? d.problem : null
  return { connection, connecting, lastAttempt, runByCloud: d.runByCloud, problem }
}
