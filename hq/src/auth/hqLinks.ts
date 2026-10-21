/**
 * Every link into hq that someone sends to someone else — an invitation, a
 * password reset, the first-admin link — is built from hq's configured address
 * (`HQ_URL`, which reaches the server as `WASP_WEB_CLIENT_URL`), never from the
 * address the sender's browser happens to use.
 */
import { getSiteClientUrl } from '../server/siteConfig'
import { hqAddressProblem } from '../shared/connectSite'

export function hqAddress(): string {
  return getSiteClientUrl().replace(/\/+$/, '')
}

const link = (path: string) => `${hqAddress()}${path}`

export const invitationLink = (token: string) => link(`/invite/${encodeURIComponent(token)}`)
export const passwordResetLink = (token: string) => link(`/reset-password/${encodeURIComponent(token)}`)

/** True when hq's address opens only on hq's own machine, so a link built from it will not work for anyone else. */
export function addressWorksOnlyHere(): boolean {
  return hqAddressProblem(hqAddress()) !== null
}
