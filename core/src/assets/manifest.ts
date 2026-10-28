/**
 * A Library package's manifest, `package.json`, in format 2 (adr-0157, adr-0158; spec part 2 *Identity* and
 * *Provenance*, part 3 *The protocol* 1). It is read from untrusted packages, so every field is checked and bounded,
 * and only the fields below come out. Format 1 is not read: nothing is carried forward before the first release.
 *
 * `publisher` is the package's claim. It is covered by the signature (`signedStatement`) and is never trusted on its
 * own: hq installs under the verified signer, and refuses a claim to any other publisher.
 *
 * `basedOn` is the copy's dated provenance, written once when the copy is made. A line with `recorded: 'hq'` claims hq
 * wrote it; only hq's own records can make it show as verified, never this field (security review M5).
 */
import { ASSET_KINDS, isAssetKind, isAssetName, parseAssetIdentity, type AssetKind } from './identity.js'
import { isAssetFingerprint } from './fingerprint.js'
import { isSemVer } from './semver.js'

export const ASSET_MANIFEST_FILE = 'package.json'
export const ASSET_MANIFEST_FORMAT = 2

export const DESCRIPTION_MAX_LENGTH = 1024
export const LICENCE_MAX_LENGTH = 200
export const SUITED_TO_MAX = 10
export const BASED_ON_MAX_LINES = 50
const STATED_SKILL_MAX_LENGTH = 200
const STATED_VERSION_MAX_LENGTH = 40

export type BasedOnLine = {
  /** `publisher/name` for a line hq wrote; for a stated credit, whatever names the source. */
  skill: string
  version?: string
  fingerprint?: string
  /** The day the copy was made, `YYYY-MM-DD`. */
  copied: string
  recorded: 'hq' | 'stated'
}

export type AssetManifest = {
  format: typeof ASSET_MANIFEST_FORMAT
  kind: AssetKind
  publisher: string
  name: string
  description: string
  version: string
  basedOn: BasedOnLine[]
  licence: string | null
  /** An offered asset's hint for the picker (developer, product, qa…): a hint, never a lock. */
  suitedTo: string[]
}

export class AssetManifestError extends Error {}

const fail = (message: string): never => { throw new AssetManifestError(`package.json: ${message}`) }
const CONTROL = /[\u0000-\u001f\u007f]/

function line(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string') return fail(`"${what}" must be text`)
  const text = value.trim()
  if (text === '' || text.length > max || CONTROL.test(text)) return fail(`"${what}" is one line of 1 to ${max} characters`)
  return text
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function parseBasedOnLine(raw: unknown, at: string): BasedOnLine {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(`"${at}" must be an object`)
  const l = raw as Record<string, unknown>
  if (l.recorded !== 'hq' && l.recorded !== 'stated') return fail(`"${at}.recorded" is "hq" or "stated"`)
  if (!isCalendarDate(l.copied)) return fail(`"${at}.copied" is a date, YYYY-MM-DD`)
  if (l.recorded === 'hq') {
    if (!parseAssetIdentity(l.skill)) return fail(`"${at}.skill" is publisher/name`)
    if (!isSemVer(l.version)) return fail(`"${at}.version" is a SemVer version`)
    if (!isAssetFingerprint(l.fingerprint)) return fail(`"${at}.fingerprint" is 64 lowercase hex characters`)
    return { skill: l.skill as string, version: l.version, fingerprint: l.fingerprint, copied: l.copied, recorded: 'hq' }
  }
  const out: BasedOnLine = { skill: line(l.skill, `${at}.skill`, STATED_SKILL_MAX_LENGTH), copied: l.copied, recorded: 'stated' }
  if (l.version !== undefined) out.version = line(l.version, `${at}.version`, STATED_VERSION_MAX_LENGTH)
  if (l.fingerprint !== undefined) {
    if (!isAssetFingerprint(l.fingerprint)) return fail(`"${at}.fingerprint" is 64 lowercase hex characters`)
    out.fingerprint = l.fingerprint
  }
  return out
}

function parseSuitedTo(raw: unknown): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > SUITED_TO_MAX || !raw.every(isAssetName) || new Set(raw).size !== raw.length) {
    return fail(`"suitedTo" is a list of at most ${SUITED_TO_MAX} different lowercase words`)
  }
  return [...raw]
}

/** Checks a manifest read from a package, which is untrusted, field by field. Throws `AssetManifestError`. */
export function parseAssetManifest(raw: unknown): AssetManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('it must be an object')
  const m = raw as Record<string, unknown>
  if (m.format !== ASSET_MANIFEST_FORMAT) return fail(`this hq reads package format ${ASSET_MANIFEST_FORMAT}`)
  if (!isAssetKind(m.kind)) return fail(`"kind" is one of ${ASSET_KINDS.join(', ')}`)
  if (!isAssetName(m.publisher)) return fail('"publisher" is 1 to 64 lowercase letters, digits and single hyphens')
  if (!isAssetName(m.name)) return fail('"name" is 1 to 64 lowercase letters, digits and single hyphens')
  if (!isSemVer(m.version)) return fail('"version" is a SemVer version, major.minor.patch')
  if (typeof m.description !== 'string' || m.description.trim() === '' || m.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    return fail(`"description" is 1 to ${DESCRIPTION_MAX_LENGTH} characters`)
  }
  if (m.basedOn !== undefined && (!Array.isArray(m.basedOn) || m.basedOn.length > BASED_ON_MAX_LINES)) {
    return fail(`"basedOn" is a list of at most ${BASED_ON_MAX_LINES} lines`)
  }
  const basedOn = ((m.basedOn ?? []) as unknown[]).map((l, i) => parseBasedOnLine(l, `basedOn[${i}]`))
  return {
    format: ASSET_MANIFEST_FORMAT,
    kind: m.kind,
    publisher: m.publisher,
    name: m.name,
    description: m.description.trim(),
    version: m.version,
    basedOn,
    licence: m.licence === undefined || m.licence === null ? null : line(m.licence, 'licence', LICENCE_MAX_LENGTH),
    suitedTo: parseSuitedTo(m.suitedTo),
  }
}
