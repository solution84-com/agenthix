/**
 * Packages (ADR-0072): an agent's content, the org's content and the platform's
 * built-in skills, each held by hq as ONE current definition and delivered to a
 * site by its content digest. A site caches what it fetched under that digest
 * and never alters it; an edit in hq is a new digest, fetched once. There is no
 * version number: the digest is the only name a package's content has.
 *
 * Platform-neutral like the rest of core. The digest's input is built here so hq
 * and a site cannot disagree about it; each app hashes it with its own crypto.
 * A package's file list is its contents list (`PackageContents`) — never called a
 * manifest, which already means an agent's proposed file-write plan. An agent's
 * settings (model, runtime, tools, approval) are not package content: they
 * live on hq's agent record and reach a run through its dispatch payload.
 */

/** The format of a package's contents list, which the digest covers. A site loads exactly this format. */
export const PACKAGE_FORMAT_VERSION = 1

/** The most file content one package may carry — well inside a content stream's buffer once base64-encoded. */
export const PACKAGE_MAX_BYTES = 8 * 1024 * 1024

export const PACKAGE_METHODS = {
  /** Control channel: which of these refs does the site not hold? Answers with digests. */
  missing: 'packages.missing',
  /** Content transport: hq streams one package's content to the site, which verifies and caches it. */
  put: 'packages.put',
} as const

export const PACKAGE_KINDS = ['agent', 'org', 'platform'] as const
export type PackageKind = (typeof PACKAGE_KINDS)[number]

export const PLATFORM_PACKAGE_KEY = 'platform'

/**
 * Names one package's content. `digest` is what identifies it — a site's cache
 * is keyed by it alone; `kind` and `key` say whose content it is, for messages.
 */
export type PackageRef = { kind: PackageKind; key: string; digest: string }

/** The three packages a run loads. No org package exists before the org is created. */
export type RunPackages = { agent: PackageRef; org: PackageRef | null; platform: PackageRef }

export type PackageFileEntry = { path: string; sha256: string }

export type PackageContents = {
  formatVersion: number
  files: PackageFileEntry[]
}

/** What `packages.put` carries: the ref, its contents list, and each file's bytes (base64) keyed by path. */
export type PackageTransfer = { ref: PackageRef; contents: PackageContents; data: Record<string, string> }

export type PackagesMissingParams = { refs: PackageRef[] }
export type PackagesMissingResult = { missing: string[] }

const PATH_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/
/** A package key — an agent id, the org id or `platform`. Every copy of this check uses this pattern. */
export const PACKAGE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
export const PACKAGE_DIGEST_PATTERN = /^[0-9a-f]{64}$/

/** A relative, forward-slash path with no empty, hidden, `.` or `..` segment. */
export function isValidPackagePath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 512) return false
  return p.split('/').every(segment => PATH_SEGMENT.test(segment))
}

export function isPackageRef(value: unknown): value is PackageRef {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (PACKAGE_KINDS as readonly string[]).includes(r.kind as string)
    && typeof r.key === 'string' && PACKAGE_KEY_PATTERN.test(r.key)
    && typeof r.digest === 'string' && PACKAGE_DIGEST_PATTERN.test(r.digest)
}

/** JSON with object keys sorted at every depth and undefined members dropped. */
export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const members = Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    return `{${members.join(',')}}`
  }
  return JSON.stringify(value)
}

/** The exact text a package digest is the sha256 of (P4). */
export function packageDigestInput(contents: PackageContents): string {
  const files = [...contents.files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(f => [f.path, f.sha256])
  return canonicalJson({ formatVersion: contents.formatVersion, files })
}

/**
 * Where a run's skill came from. `boundary` is one agent's skills on a
 * boundary's disk (`.agents/agents/<agentId>/skills/`); `shared` is the
 * boundary's skills for every agent working there (`.agents/skills/`). No
 * source is another's prefix followed by a hyphen, so no two sources can
 * produce the same name.
 */
export const SKILL_SOURCES = ['platform', 'org', 'agent', 'boundary', 'shared'] as const
export type SkillSource = (typeof SKILL_SOURCES)[number]

export const MAX_SKILL_NAME_LENGTH = 64
/** 64 less the longest prefix, `boundary-`. */
export const MAX_SKILL_SLUG_LENGTH = MAX_SKILL_NAME_LENGTH - 'boundary-'.length

const SKILL_SLUG = /^[a-z0-9][a-z0-9-]*$/

/**
 * `<source>-<slug>` — the directory and `name` a run sees (P20). Skill names are
 * lowercase letters, digits and hyphens, at most 64 characters, matching their
 * directory. Null when the slug cannot be namespaced within that.
 */
export function namespacedSkillName(source: SkillSource, slug: string): string | null {
  if (!SKILL_SLUG.test(slug)) return null
  const name = `${source}-${slug}`
  return name.length <= MAX_SKILL_NAME_LENGTH ? name : null
}
