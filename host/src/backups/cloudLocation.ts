/**
 * The backup location Agenthix Cloud's controller sets (pre-release spec B4), on a machine enrolled with Cloud:
 * an S3-compatible store under the machine's own prefix, reached with credentials that last 7 days at most.
 *
 * The location is kept like a folder one (`backups/location.json`), but its `path` is a marker no folder can be
 * named, so everything that reads a location reads this one through `ctx.backupIO.folder`, which sends the marker
 * to the store (`routedFolder`). The credentials are in `backups/cloud-location.json`, readable by the host
 * service alone, and are never logged, printed or sent anywhere but the store. Only the public half of the
 * location's key is kept, as for a folder.
 */
import type { CloudOnlyRequest } from '@agenthix/core'
import { Refusal } from '../owner/results'
import type { StateFolder } from '../state/folder'
import type { BackupIO } from './io'
import { holderFrom } from './seal'
import { s3ClientFor, s3Folder, type CloudLocationAccess, type S3Like } from './s3Folder'
import { BackupStore } from './store'

/** Not a name any folder can have (a control character): `folderProblem` refuses it, so no person's path is this. */
export const CLOUD_LOCATION_DIR = '/\u0001cloud'

/** How the location is shown to a person: where it came from, never where it is. */
export const CLOUD_LOCATION_LABEL = 'set by Agenthix Cloud'

const CREDENTIALS = ['backups', 'cloud-location.json']
const WEEK_MS = 7 * 24 * 3600_000
/** A little room for clocks that differ, so credentials Cloud made for 7 days are not refused for the difference. */
const CLOCK_SLACK_MS = 10 * 60_000

type Stored = CloudLocationAccess & { expiresAt: string }
export type CloudLocationRequest = Extract<CloudOnlyRequest, { op: 'backup.location.set' }>

function readStored(state: StateFolder): Stored | null {
  const v = state.readJson(...CREDENTIALS) as Partial<Stored> | null
  if (!v) return null
  const fields = ['endpoint', 'bucket', 'prefix', 'region', 'accessKeyId', 'secretAccessKey', 'sessionToken', 'expiresAt'] as const
  return fields.every(f => typeof v[f] === 'string') ? (v as Stored) : null
}

/** What a person is told the location is: its folder, or that Cloud set it. */
export const locationLabel = (location: { path: string; setBy?: string }): string =>
  location.setBy === 'cloud' ? CLOUD_LOCATION_LABEL : location.path

export const isSetByCloud = (location: { setBy?: string } | null): boolean => location?.setBy === 'cloud'

/** The store as a folder, or a Refusal in words when none is set or its credentials have lapsed. */
export function openCloudLocation(state: StateFolder, now: Date, client: (a: CloudLocationAccess) => S3Like = s3ClientFor): BackupIO['folder'] {
  const stored = readStored(state)
  if (!stored) throw new Refusal('not_found', 'No backup location is set for this machine.')
  if (Date.parse(stored.expiresAt) <= now.getTime()) {
    throw new Refusal('conflict', 'Skipped: the credentials Agenthix Cloud gave this machine for its backup location have lapsed. Copies resume when it sends new ones.')
  }
  const folder = s3Folder(client(stored), stored)
  return {
    testWrite: () => folder.testWrite(),
    list: () => folder.list(),
    read: (_dir, name) => folder.read(name),
    write: (_dir, name, bytes) => folder.write(name, bytes),
    remove: (_dir, name) => folder.remove(name),
  }
}

/** `folder`, except that the marker's location is the store; used as `ctx.backupIO.folder`. */
export function routedFolder(local: BackupIO['folder'], cloud: () => BackupIO['folder']): BackupIO['folder'] {
  const to = (dir: string) => (dir === CLOUD_LOCATION_DIR ? cloud() : local)
  return {
    testWrite: dir => to(dir).testWrite(dir),
    list: dir => to(dir).list(dir),
    read: (dir, name) => to(dir).read(dir, name),
    write: (dir, name, bytes) => to(dir).write(dir, name, bytes),
    remove: (dir, name) => to(dir).remove(dir, name),
  }
}

const TEXT = /^[^\u0000-\u001f\u007f]+$/

function secretField(v: unknown, what: string, max = 4096): string {
  if (typeof v !== 'string' || !v || v.length > max || !TEXT.test(v)) throw new Refusal('malformed', `The backup location's ${what} is not one.`)
  return v
}

/** Rebuilds the request field by field. Nothing of a bad one is echoed back: the values are credentials. */
export function parseCloudLocation(r: Record<string, unknown>): CloudLocationRequest {
  const endpoint = secretField(r.endpoint, 'address', 512)
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Refusal('malformed', "The backup location's address is not one.")
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local)) || url.username || url.password) {
    throw new Refusal('malformed', "The backup location's address must be https.")
  }
  const bucket = secretField(r.bucket, 'bucket', 63)
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Refusal('malformed', "The backup location's bucket is not one.")
  const prefix = secretField(r.prefix, 'prefix', 512)
  if (prefix.startsWith('/') || prefix.split('/').some(p => p === '..' || p === '.')) throw new Refusal('malformed', "The backup location's prefix is not one.")
  const key = secretField(r.key, 'key', 64)
  if (Buffer.from(key, 'base64url').length !== 32 || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Refusal('malformed', "The backup location's key is not one.")
  const expiresAt = secretField(r.expiresAt, 'expiry', 40)
  if (Number.isNaN(Date.parse(expiresAt))) throw new Refusal('malformed', "The backup location's expiry is not a time.")
  return {
    op: 'backup.location.set', endpoint, bucket, prefix, region: secretField(r.region, 'region', 64),
    accessKeyId: secretField(r.accessKeyId, 'access key', 256), secretAccessKey: secretField(r.secretAccessKey, 'secret', 256),
    sessionToken: secretField(r.sessionToken, 'session token'), expiresAt, key,
  }
}

/**
 * Points backups at the store, or, when it already does, replaces only the credentials. Every field is checked first;
 * the credentials last 7 days at most and must not already have lapsed.
 */
export function setCloudLocation(state: StateFolder, now: Date, request: CloudLocationRequest): { expiresAt: string } {
  const left = Date.parse(request.expiresAt) - now.getTime()
  if (left <= 0) throw new Refusal('malformed', 'The backup location credentials have already lapsed.')
  if (left > WEEK_MS + CLOCK_SLACK_MS) throw new Refusal('malformed', 'The backup location credentials last longer than 7 days, which is not allowed.')
  const { op: _op, key, ...access } = request
  const publicKey = holderFrom(Buffer.from(key, 'base64url')).publicKey.toString('base64url')
  const store = new BackupStore(state)
  const kept = store.location()
  const before = readStored(state)
  const same = isSetByCloud(kept) && kept?.publicKey === publicKey && before !== null &&
    (['endpoint', 'bucket', 'prefix', 'region'] as const).every(f => before[f] === access[f])
  state.writeJson(CREDENTIALS, access)
  if (!same) store.setLocation({ path: CLOUD_LOCATION_DIR, publicKey, setAt: now.toISOString(), setBy: 'cloud' })
  return { expiresAt: request.expiresAt }
}
