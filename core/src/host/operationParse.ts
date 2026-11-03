/**
 * The one place a host service checks what a controller asked before acting on it. Anything outside the closed set
 * is refused, and what is inside it is rebuilt field by field, so a request never carries a field the host service
 * did not expect into the code that acts on it.
 */
import { parseHostCeilings } from './figures.js'
import type { HostTarget } from './figures.js'
import type { BackupSource, ChangeRequest, HostRefusal, HostRequest, PublishedPortChoice } from './operations.js'
import { isFingerprint, type HostIdentity } from './envelope.js'
import { isTransferId } from './transfer.js'
import { isExportId } from './exportDownload.js'
import { isPublishedVersion } from './versions.js'
import { normalisePreviewDomain } from './previews.js'

export type ParsedHostRequest = { ok: true; request: HostRequest } | { ok: false; refusal: HostRefusal }

const MAX_TEXT = 512

class Malformed extends Error {}

function fail(what: string): never {
  throw new Malformed(`The request's ${what} is missing or not valid.`)
}

const str = (v: unknown, what: string): string =>
  typeof v === 'string' && v.trim() && v.length <= MAX_TEXT ? v.trim() : fail(what)
const optStr = (v: unknown, what: string): string | undefined => (v === undefined ? undefined : str(v, what))
/** A certificate chain or a private key in PEM: longer than any other field, and never trimmed or echoed. */
const pem = (v: unknown, what: string, max: number): string =>
  typeof v === 'string' && v.trim() && v.length <= max && v.includes('-----BEGIN ') ? v : fail(what)
const target = (v: unknown): HostTarget => (v === 'hq' || v === 'site' ? v : fail('target'))
const version = (v: unknown): string => (typeof v === 'string' && isPublishedVersion(v) ? v : fail('version'))
// `dev` installs the images built on the machine; a host service that is not a development build refuses it there.
const installVersion = (v: unknown): string => (v === 'dev' ? v : version(v))
/** A port when given: a whole number from 1 to 65535. The host service checks the range it allows when it uses it. */
const optPort = (v: unknown, what: string): number | undefined =>
  v === undefined ? undefined : typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535 ? v : fail(what)
/** The ports a request for hq names, only those given; a request for anything else names none. */
function ports(r: Record<string, unknown>, forHq: boolean): PublishedPortChoice {
  if (!forHq) return r.hqPort === undefined && r.consolePort === undefined ? {} : fail("HQ's port")
  const hqPort = optPort(r.hqPort, "HQ's port")
  const consolePort = optPort(r.consolePort, "Fleet Console's port")
  return { ...(hqPort === undefined ? {} : { hqPort }), ...(consolePort === undefined ? {} : { consolePort }) }
}
const exportId = (v: unknown): string => (isExportId(v) ? v : fail('export'))
const time = (v: unknown, what: string): string =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fail(what)

function record(v: unknown, what: string): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(what)
}

const KEY = /^[A-Za-z0-9_-]{43}$/

function identity(v: unknown): HostIdentity & { role: 'host' } {
  const i = record(v, 'peer identity')
  if (i.role !== 'host' || typeof i.signingKey !== 'string' || !KEY.test(i.signingKey) ||
    typeof i.sealingKey !== 'string' || !KEY.test(i.sealingKey)) fail('peer identity')
  return { role: 'host', signingKey: i.signingKey as string, sealingKey: i.sealingKey as string }
}

function source(v: unknown): BackupSource {
  const s = record(v, 'backup source')
  if (s.from === 'machine') return { from: 'machine', backupId: str(s.backupId, 'backup') }
  if (s.from === 'location') return { from: 'location', backupId: str(s.backupId, 'backup'), key: str(s.key, 'key') }
  if (s.from === 'transfer') return { from: 'transfer', transferId: str(s.transferId, 'transfer') }
  if (s.from === 'joined') return { from: 'joined' }
  return fail('backup source')
}

function change(r: Record<string, unknown>): ChangeRequest | null {
  switch (r.op) {
    case 'upgrade':
      return { op: 'upgrade', target: target(r.target), version: version(r.version) }
    case 'capacity.set': {
      const ceilings = parseHostCeilings(r.ceilings)
      return ceilings ? { op: 'capacity.set', ceilings } : fail('ceilings')
    }
    case 'backup.restore': {
      const to = target(r.target)
      const from = source(r.source)
      // A site restored onto the machine that joined to take its place: a site only.
      if (from.from === 'joined' && to !== 'site') fail('backup source')
      return { op: 'backup.restore', target: to, source: from }
    }
    case 'move': {
      if (r.role !== 'send' && r.role !== 'receive') fail('role')
      const peer = isFingerprint(r.peer) ? r.peer : fail('peer machine')
      const peerIdentity = identity(r.peerIdentity)
      const transferId = isTransferId(r.transferId) ? r.transferId : fail('transfer')
      const peerName = str(r.peerName, "peer machine's name")
      const to = target(r.target)
      const hqAddress = to === 'hq' ? optStr(r.hqAddress, "HQ's address") : r.hqAddress === undefined ? undefined : fail("HQ's address")
      const extra = hqAddress === undefined ? {} : { hqAddress }
      return r.role === 'send'
        ? { op: 'move', role: 'send', target: to, peer, peerIdentity, peerName, transferId, ...extra, ...ports(r, false) }
        : { op: 'move', role: 'receive', target: to, peer, peerIdentity, peerName, transferId, siteName: str(r.siteName, 'site name'), ...extra, ...ports(r, to === 'hq') }
    }
    case 'erase':
      return target(r.target) === 'hq'
        ? { op: 'erase', target: 'hq', confirmAddress: str(r.confirmAddress, 'confirmed address') }
        : { op: 'erase', target: 'site' }
    case 'suspend':
    case 'resume':
      return { op: r.op, target: target(r.target) }
    default:
      return null
  }
}

function request(r: Record<string, unknown>): HostRequest | null {
  switch (r.op) {
    case 'figures.read':
    case 'backup.take':
    case 'backup.list':
      return { op: r.op }
    case 'logs.read': {
      const limit = r.limit
      if (limit !== undefined && !(typeof limit === 'number' && Number.isInteger(limit) && limit > 0)) fail('limit')
      return {
        op: 'logs.read', target: target(r.target), service: optStr(r.service, 'service'),
        since: r.since === undefined ? undefined : time(r.since, 'since'), limit,
      }
    }
    case 'install':
      return target(r.target) === 'hq'
        ? { op: 'install', target: 'hq', version: installVersion(r.version), address: str(r.address, 'address'), ...ports(r, true) }
        : { op: 'install', target: 'site', version: installVersion(r.version), ...ports(r, false) }
    case 'start':
    case 'stop':
    case 'remove':
      return { op: r.op, target: target(r.target) }
    case 'backup.export':
    case 'backup.store':
      return { op: r.op, backupId: str(r.backupId, 'backup') }
    case 'backup.exportRead': {
      const offset = r.offset
      if (!(typeof offset === 'number' && Number.isSafeInteger(offset) && offset >= 0)) fail('place in the export')
      return { op: 'backup.exportRead', exportId: exportId(r.exportId), offset }
    }
    case 'backup.exportDone':
      return { op: 'backup.exportDone', exportId: exportId(r.exportId) }
    case 'backup.fetch':
      return { op: 'backup.fetch', backupId: str(r.backupId, 'backup'), key: str(r.key, 'key') }
    case 'address.set':
      return { op: 'address.set', target: target(r.target), address: str(r.address, 'address') }
    case 'frontDoor.set':
      if (r.on === false) return { op: 'frontDoor.set', on: false }
      if (r.on !== true || r.confirmPorts !== true) fail('confirmation that ports 80 and 443 may be taken')
      if ((r.certificate === undefined) !== (r.privateKey === undefined)) fail('certificate and its private key, which come together')
      return {
        op: 'frontDoor.set', on: true, confirmPorts: true,
        filesHost: optStr(r.filesHost, 'files host'), previewsHost: r.previewsHost === undefined ? undefined : normalisePreviewDomain(str(r.previewsHost, 'preview address')),
        ...(r.certificate === undefined ? {} : { certificate: pem(r.certificate, 'certificate', 64 * 1024), privateKey: pem(r.privateKey, 'private key', 16 * 1024) }),
      }
    case 'previews.set':
      if (r.domain === null) return { op: 'previews.set', domain: null }
      return { op: 'previews.set', domain: normalisePreviewDomain(str(r.domain, 'preview address')) }
    case 'schedule': {
      const inner = change(record(r.change, 'change'))
      // The backup a joining machine holds is restored as the fleet admin confirms it, never at a later time.
      if (inner?.op === 'backup.restore' && inner.source.from === 'joined') fail('change')
      // A copy in the backup location opens only with its key, which is never kept on the machine for later.
      if (inner?.op === 'backup.restore' && inner.source.from === 'location') fail('change')
      return inner ? { op: 'schedule', at: time(r.at, 'time'), change: inner } : fail('change')
    }
    case 'schedule.change':
      return { op: 'schedule.change', changeId: str(r.changeId, 'scheduled change'), at: time(r.at, 'time') }
    case 'schedule.cancel':
      return { op: 'schedule.cancel', changeId: str(r.changeId, 'scheduled change') }
    default:
      return change(r)
  }
}

/** Checks a request against the closed set; anything else is refused, never passed on. */
export function parseHostRequest(data: unknown): ParsedHostRequest {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, refusal: { code: 'malformed', message: 'The request is not one the host service reads.' } }
  }
  try {
    const parsed = request(data as Record<string, unknown>)
    if (parsed) return { ok: true, request: parsed }
    return { ok: false, refusal: { code: 'unknown_operation', message: 'The host service does not do that.' } }
  } catch (err) {
    if (err instanceof Malformed) return { ok: false, refusal: { code: 'malformed', message: err.message } }
    throw err
  }
}
