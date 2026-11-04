/**
 * What a person asks of a live preview through HQ (`livePreview.act`), beyond starting and stopping it: opening one of
 * its apps, a yes to a new or changed service, and a yes to a blocked package's install script. HQ checks the person
 * may (a Member or Admin of the project) before it asks; the site checks the request against its own record.
 *
 * Every request is read closed, field by field (`parseLivePreviewRequest`): a field missing, extra or not its shape
 * is refused.
 */
import { isAppId } from '../relay/previewAddress.js'
import { APP_ENTRIES, type AppEntry } from '../relay/appTickets.js'
import { checkSha256, checkText } from './canonical.js'
import { parseBlockedPackageRef } from '../protocol/branchPackages.js'

export type LivePreviewRequest =
  /** Opening one of the live preview's apps in the workspace view, in a new tab, or renewing its cookie. */
  | { kind: 'app.open'; appId: string; entry: AppEntry }
  /** A yes to a new or changed service: its name and the SHA-256 of its declaration (`serviceDeclarationHash`). */
  | { kind: 'service.start'; service: string; declaration: string }
  /** A yes to one blocked package's install script, named exactly. */
  | { kind: 'package.use'; ecosystem: string; name: string; version: string }

const REQUEST_FIELDS: Record<LivePreviewRequest['kind'], readonly string[]> = {
  'app.open': ['appId', 'entry'],
  'service.start': ['service', 'declaration'],
  'package.use': ['ecosystem', 'name', 'version'],
}

const sameKeys = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k))

/** Throws when a field of the request is not its shape. */
function checkRequest(r: LivePreviewRequest): void {
  switch (r.kind) {
    case 'app.open':
      if (!(APP_ENTRIES as readonly string[]).includes(r.entry)) throw new Error('The app entry is not valid.')
      if (!isAppId(r.appId)) throw new Error('The app id is not valid.')
      return
    case 'service.start':
      checkText(r.service, 'service')
      checkSha256(r.declaration)
      return
    case 'package.use':
      // The same reader as `branch.packageUse`: npm, a registry name and an exact version.
      if (!parseBlockedPackageRef({ ecosystem: r.ecosystem, name: r.name, version: r.version })) throw new Error('The package is not valid.')
  }
}

/** A request as it came off the wire: exactly the fields its kind carries, each its shape; null for anything else. */
export function parseLivePreviewRequest(v: unknown): LivePreviewRequest | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (typeof r.kind !== 'string' || !Object.prototype.hasOwnProperty.call(REQUEST_FIELDS, r.kind)) return null
  const kind = r.kind as LivePreviewRequest['kind']
  const fields = ['kind', ...REQUEST_FIELDS[kind]]
  if (!sameKeys(r, fields)) return null
  for (const f of fields) if (typeof r[f] !== 'string') return null
  try {
    checkRequest(r as LivePreviewRequest)
  } catch {
    return null
  }
  return r as LivePreviewRequest
}
