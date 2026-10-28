/**
 * A library package (every screen reviewed spec §3, Library): one item — an
 * agent, a board, a skill or a team template — as one ZIP that records where it
 * came from, its version and its publisher, so a marketplace can later deliver
 * the same packages. Every kind has one layout:
 *
 *   <name>/
 *     package.json   ← this manifest
 *     …              ← the kind's own files:
 *                       agent  agent.json, instructions.md, skills/<slug>/…
 *                       board  board.json ({ name, description, columns })
 *                       skill  SKILL.md and the skill's other files
 *                       team   template.json, agents/<handle>/agent.json, skills/<slug>/SKILL.md
 *
 * An agent's package is the agent archive Organisation › Agents already
 * exports, with this manifest beside its agent.json. Pure: no server imports.
 */
export const PACKAGE_MANIFEST_FILE = 'package.json'
export const PACKAGE_FORMAT = 1

export const PACKAGE_KINDS = ['agent', 'board', 'skill', 'team'] as const
export type PackageKind = (typeof PACKAGE_KINDS)[number]

export const PACKAGE_SOURCES = ['built_in', 'made_here', 'marketplace'] as const
export type PackageSource = (typeof PACKAGE_SOURCES)[number]

export type PackageManifest = {
  format: number
  kind: PackageKind
  name: string
  description: string
  source: PackageSource
  /** As the publisher numbers it ("2.1"). */
  version: string
  publisher: string | null
}

/** The database's LibrarySource, as Prisma names it. */
export type LibrarySource = 'BUILT_IN' | 'MADE_HERE' | 'MARKETPLACE'

export const BUILT_IN_PUBLISHER = 'Agenthix'

const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/

export class PackageManifestError extends Error {}

function text(value: unknown, what: string, max: number, required: boolean): string {
  if (value === undefined || value === null) {
    if (required) throw new PackageManifestError(`package.json: "${what}" is required`)
    return ''
  }
  if (typeof value !== 'string') throw new PackageManifestError(`package.json: "${what}" must be text`)
  const trimmed = value.trim()
  if (required && trimmed === '') throw new PackageManifestError(`package.json: "${what}" is required`)
  if (trimmed.length > max) throw new PackageManifestError(`package.json: "${what}" is at most ${max} characters`)
  return trimmed
}

/** Checks a manifest read from an upload, which is untrusted, field by field. */
export function parseManifest(raw: unknown): PackageManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PackageManifestError('package.json must be an object')
  const m = raw as Record<string, unknown>
  if (m.format !== PACKAGE_FORMAT) throw new PackageManifestError(`package.json: this hq reads package format ${PACKAGE_FORMAT}`)
  if (!PACKAGE_KINDS.includes(m.kind as PackageKind)) throw new PackageManifestError(`package.json: "kind" is one of ${PACKAGE_KINDS.join(', ')}`)
  if (!PACKAGE_SOURCES.includes(m.source as PackageSource)) throw new PackageManifestError(`package.json: "source" is one of ${PACKAGE_SOURCES.join(', ')}`)
  const version = text(m.version, 'version', 40, true)
  if (!VERSION_RE.test(version)) throw new PackageManifestError('package.json: "version" is letters, digits, dots, plus and minus signs')
  const publisher = text(m.publisher, 'publisher', 100, false)
  return {
    format: PACKAGE_FORMAT,
    kind: m.kind as PackageKind,
    name: text(m.name, 'name', 200, true),
    description: text(m.description, 'description', 1000, false),
    source: m.source as PackageSource,
    version,
    publisher: publisher === '' ? null : publisher,
  }
}
