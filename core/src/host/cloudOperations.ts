/**
 * The operations only Agenthix Cloud's controller may ask, and only of a machine enrolled with Cloud. Host management
 * keeps these on the machine for an organisation's own machines (operations.ts): the backup location, admin links,
 * turning remote access on. On a machine Cloud runs, Agenthix is the machine admin, so its controller may ask them;
 * from anyone else, or on any other machine, they are refused. The host service on hq's machine passes the `site.*`,
 * `account.*` and `organisation.*` operations to hq.
 *
 * Every request travels sealed inside a `HostEnvelope`, like the Fleet Console's.
 */
import type { HostRequest, HostResults } from './operations.js'
import type { CloudOrganisationConnection } from './cloud.js'
import { isCloudClientId, isCloudOrganisationId, isCloudPublicKey } from '../cloud/connection.js'
import { cloudHqAddressOf } from '../cloud/hqAddress.js'

/** A maintenance window as Cloud sets it: the machine runs in UTC, the owner sets it in their own IANA zone. */
export type CloudMaintenanceWindow = { day: number | null; startMinute: number; endMinute: number; timeZone: string }

export type CloudOnlyRequest =
  /**
   * Backups go to an S3-compatible store under the machine's own prefix, with credentials that last 7 days at most
   * and carry a session token. Asked again, only the credentials are replaced. `key` (base64url, 32 bytes) is the
   * location's key, the same each time for an organisation.
   */
  | {
      op: 'backup.location.set'
      endpoint: string; bucket: string; prefix: string; region: string
      accessKeyId: string; secretAccessKey: string; sessionToken: string; expiresAt: string
      key: string
    }
  | { op: 'upgrades.set'; auto: boolean; window: CloudMaintenanceWindow }
  /** Cloud resizes the server itself: runs pause and services stop cleanly until `resize.finish`. */
  | { op: 'resize.prepare' }
  | { op: 'resize.finish' }
  /** A key made on the machine, which never leaves it; the answer is a certificate request for `name` alone. */
  | { op: 'remoteAccess.csr'; name: string }
  /** `allow`: each an IPv4 `/32` or IPv6 `/64`, at most 20. It stops by itself at `until`. Asked again, all is replaced. */
  | { op: 'remoteAccess.on'; name: string; port: number; certificate: string; until: string; allow: string[] }
  | { op: 'remoteAccess.off' }
  /** A TOTP secret (RFC 6238, SHA-1, 6 digits, 30 s, base32) and the SHA-256 hex of 10 recovery codes, unclaimed until the first remote sign-in. */
  | { op: 'remoteAccess.authenticator.add'; id: string; secret: string; recoveryCodeHashes: string[]; claimBefore: string }
  /** hq accepts the site's credential by its SHA-256 hash only; repeating it for the same machine changes nothing. */
  | { op: 'site.register'; machineId: string; siteName: string; credentialHash: string }
  | { op: 'site.unregister'; executionSiteId: string }
  /** `ref` is Cloud's random name for the link, never its secret, kept with the account the link makes. */
  | { op: 'account.firstLink'; ref: string }
  | { op: 'account.resetLink'; username: string }
  | { op: 'account.adminInvite' }
  /**
   * Connecting an hq Cloud runs, with no code to approve (adr-0135): `organisation.key` answers hq's connection key,
   * made if it has none, and hq's address; Cloud registers both for the organisation it runs hq for, the address as
   * the only place its sign-ins come back to (cloud/hqAddress.ts); `organisation.connect` then has hq sign for a token
   * with that key, and keep the connection only once Cloud gives one.
   */
  | { op: 'organisation.key' }
  | { op: 'organisation.connect'; cloudOrganisationId: string; name: string }

export type CloudOnlyOperation = CloudOnlyRequest['op']

export const CLOUD_ONLY_OPERATIONS = [
  'backup.location.set', 'upgrades.set', 'resize.prepare', 'resize.finish',
  'remoteAccess.csr', 'remoteAccess.on', 'remoteAccess.off', 'remoteAccess.authenticator.add',
  'site.register', 'site.unregister', 'account.firstLink', 'account.resetLink', 'account.adminInvite',
  'organisation.key', 'organisation.connect',
] as const satisfies readonly CloudOnlyOperation[]

/** A one-time link, https only. Never logged. */
export type CloudLink = { link: string; expiresAt: string }

export type FirstAdminMadeWith = { kind: 'firstLink'; ref: string } | { kind: 'other' }

export type CloudOnlyResults = {
  'backup.location.set': { expiresAt: string }
  'upgrades.set': { auto: boolean; window: CloudMaintenanceWindow }
  'resize.prepare': { state: 'paused' }
  'resize.finish': { state: 'started' }
  'remoteAccess.csr': { csr: string }
  'remoteAccess.on': { on: true; until: string }
  'remoteAccess.off': { on: false }
  'remoteAccess.authenticator.add': { added: boolean }
  'site.register': { executionSiteId: string }
  'site.unregister': { removed: boolean }
  'account.firstLink':
    | CloudLink
    | { state: 'hasAccounts'; accounts: number; firstAdmin: { madeAt: string; madeWith: FirstAdminMadeWith } }
  'account.resetLink': CloudLink
  'account.adminInvite': CloudLink
  /**
   * `publicKey` as hq sends it when it asks for a connection itself; `clientId` is the id Cloud registers it under;
   * `hqAddress` is in `cloudHqAddressOf`'s form.
   */
  'organisation.key': { publicKey: string; clientId: string; hqAddress: string }
  'organisation.connect': CloudOrganisationConnection
}

/** What Cloud's controller may send: everything the Fleet Console may, and the operations above. */
export type CloudRequest = HostRequest | CloudOnlyRequest
export type CloudResults = HostResults & CloudOnlyResults

/** The operations above that the host service on hq's machine passes to hq. */
export type HqCloudOperation =
  | 'site.register' | 'site.unregister' | 'account.firstLink' | 'account.resetLink' | 'account.adminInvite'
  | 'organisation.key' | 'organisation.connect'

export type HqCloudRequest<O extends HqCloudOperation = HqCloudOperation> = Extract<CloudOnlyRequest, { op: O }>

type FieldCheck = (v: string) => boolean
const pattern = (re: RegExp): FieldCheck => v => re.test(v)

const ID = pattern(/^[A-Za-z0-9._:-]{1,128}$/)
const SITE_NAME = pattern(/^[^\p{Cc}]{1,64}$/u)
const HASH = pattern(/^[0-9a-fA-F]{64}$/)
const REF = pattern(/^[A-Za-z0-9_-]{1,128}$/)
const USERNAME = pattern(/^[^\s\p{Cc}]{1,128}$/u)
const ORGANISATION_NAME = pattern(/^[^\p{Cc}]{1,200}$/u)

/** Each operation's fields, in order: the order hq's control socket takes them as arguments. */
export const HQ_CLOUD_FIELDS = {
  'site.register': { machineId: ID, siteName: SITE_NAME, credentialHash: HASH },
  'site.unregister': { executionSiteId: ID },
  'account.firstLink': { ref: REF },
  'account.resetLink': { username: USERNAME },
  'account.adminInvite': {},
  'organisation.key': {},
  'organisation.connect': { cloudOrganisationId: isCloudOrganisationId, name: ORGANISATION_NAME },
} as const satisfies { [O in HqCloudOperation]: Record<Exclude<keyof HqCloudRequest<O>, 'op'>, FieldCheck> }

export type HqCloudParse<O extends HqCloudOperation> = { ok: true; request: HqCloudRequest<O> } | { ok: false; field: string }

/**
 * Either side: one of these operations' fields, each a string with no space around it that matches its rule. The
 * credential hash is lowercased. `field` names the first that is missing or not valid.
 */
export function parseHqCloudRequest<O extends HqCloudOperation>(op: O, fields: Record<string, unknown>): HqCloudParse<O> {
  const request: Record<string, string> = { op }
  for (const [name, check] of Object.entries(HQ_CLOUD_FIELDS[op] as Record<string, FieldCheck>)) {
    const v = fields[name]
    if (typeof v !== 'string' || v.trim() !== v || !check(v)) return { ok: false, field: name }
    request[name] = name === 'credentialHash' ? v.toLowerCase() : v
  }
  return { ok: true, request: request as HqCloudRequest<O> }
}

/** Either side: hq's answer to `organisation.key`. Null when the key, the client id or the address is not one. */
export function parseOrganisationKeyResult(v: unknown): CloudOnlyResults['organisation.key'] | null {
  const d = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  const hqAddress = cloudHqAddressOf(d?.hqAddress)
  if (!d || !isCloudPublicKey(d.publicKey) || !isCloudClientId(d.clientId) || !hqAddress) return null
  return { publicKey: d.publicKey, clientId: d.clientId, hqAddress }
}
