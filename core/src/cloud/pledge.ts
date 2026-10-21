/**
 * Whether a person whose Agenthix account is linked to an hq has signed the Responsible AI Pledge, which hq asks so
 * the pledge card on Home fits them and Settings shows their signature (pre-release spec part D). What the connection
 * (./connection.ts) carries once it is made:
 *
 * - hq posts `{ subject }` as JSON to `CLOUD_PLEDGE_STATUS_PATH` with a bearer access token it signed for, naming the
 *   account by the `sub` its link holds. Cloud answers only for an account linked to that hq (one that signed in to it
 *   through Cloud), and `404` for any other, so an hq can learn nothing of people it has no link for.
 * - The answer is shown to that person alone, whether or not their signature is public.
 * - hq never asks for someone without a link, nor while it is not connected.
 *
 * Signing happens on Cloud, at `CLOUD_PLEDGE_SIGN_PATH`; a signer's page, with their badge, is `cloudPledgeSignerPage`.
 */
import { cloudEndpoint, type CloudUrl } from './connection.js'
import { isCloudSubject } from './signIn.js'

export const CLOUD_PLEDGE_STATUS_PATH = '/connect/pledge/status'
export const CLOUD_PLEDGE_SIGN_PATH = '/pledge/sign'
/** The pledge's own page on the website, which hq links to when it knows nothing of the person. */
export const PLEDGE_PAGE_URL = 'https://agenthix.com/responsible-ai'

export type CloudPledgeStatusRequest = { subject: string }

export type CloudPledgeStatus = {
  /** The version of the pledge anyone signing now signs. */
  current_version: number
  /** The person's signature while it stands; null when they never signed, or withdrew. */
  signature: { version: number; signer_id: string } | null
  /** True when their last act was withdrawing. */
  withdrawn: boolean
}

const SIGNER_ID = /^[A-Za-z0-9_-]{1,64}$/

const isVersion = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10_000

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Cloud's side: the request's body. */
export function parseCloudPledgeStatusRequest(v: unknown): CloudPledgeStatusRequest | null {
  const d = record(v)
  return d && isCloudSubject(d.subject) ? { subject: d.subject } : null
}

/** hq's side: Cloud's answer. Null when it is not the shape, or a signature names a version after the current one. */
export function parseCloudPledgeStatus(v: unknown): CloudPledgeStatus | null {
  const d = record(v)
  if (!d || !isVersion(d.current_version) || typeof d.withdrawn !== 'boolean') return null
  if (d.signature === null) return { current_version: d.current_version, signature: null, withdrawn: d.withdrawn }
  const s = record(d.signature)
  if (!s || !isVersion(s.version) || s.version > d.current_version || typeof s.signer_id !== 'string' || !SIGNER_ID.test(s.signer_id)) return null
  if (d.withdrawn) return null
  return { current_version: d.current_version, signature: { version: s.version, signer_id: s.signer_id }, withdrawn: false }
}

export function cloudPledgeSignUrl(base: CloudUrl): string {
  return cloudEndpoint(base, CLOUD_PLEDGE_SIGN_PATH)
}

/** A signer's page on Cloud, with their badge. */
export function cloudPledgeSignerPage(base: CloudUrl, signerId: string): string {
  return cloudEndpoint(base, `/pledge/s/${encodeURIComponent(signerId)}`)
}
