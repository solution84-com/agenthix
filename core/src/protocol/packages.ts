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
import { parseAssetIdentity } from '../assets/identity.js'

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

/** `skill`: an installed or personal skill's one published version; its key is that version row's id. */
export const PACKAGE_KINDS = ['agent', 'org', 'platform', 'skill'] as const
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
 * Where a run's skill came from (adr-0084). `boundary` is one agent's skills in a
 * place's files (`.agents/agents/<agentId>/skills/`); `shared` is the place's
 * skills for every agent working there (`.agents/skills/`); `workspace` is a
 * workspace repository's (`.agents/skills/`, `.claude/skills/`, `.github/skills/`);
 * `person` is the person's own, following them into their own conversations. No
 * source is another's prefix followed by a hyphen, so no two sources can
 * produce the same name.
 */
export const SKILL_SOURCES = ['platform', 'org', 'agent', 'boundary', 'shared', 'workspace', 'person'] as const

/**
 * The agent package's own `skills/`: an agent's installed skills now reach a run as `installedSkills`.
 *
 * @deprecated since 1.9; stops working in 3.0. Use `installedSkills` instead.
 */
export type AgentPackageSkillSource = 'agent'

/**
 * The org package's own `skills/`: the organisation's skills now reach a run as `installedSkills` at the `org` level.
 *
 * @deprecated since 1.10; stops working in 3.0. Use `installedSkills` instead.
 */
export type OrgPackageSkillSource = 'org'

export type SkillSource =
  | Exclude<(typeof SKILL_SOURCES)[number], AgentPackageSkillSource | OrgPackageSkillSource>
  | AgentPackageSkillSource
  | OrgPackageSkillSource

export const MAX_SKILL_NAME_LENGTH = 64

/** A run numbers each workspace-and-folder pair it stages skills from, 1 to this. */
export const MAX_WORKSPACE_SKILL_INDEX = 99

/** 64 less the longest prefix, `workspace-99-`. */
export const MAX_SKILL_SLUG_LENGTH = MAX_SKILL_NAME_LENGTH - Math.max(
  ...SKILL_SOURCES.map(s => (s === 'workspace' ? `${s}-${MAX_WORKSPACE_SKILL_INDEX}-` : `${s}-`).length),
)

const SKILL_SLUG = /^[a-z0-9][a-z0-9-]*$/

function boundedSkillName(prefix: string, slug: string): string | null {
  if (slug.length > MAX_SKILL_SLUG_LENGTH || !SKILL_SLUG.test(slug)) return null
  return `${prefix}-${slug}`
}

/**
 * `<source>-<slug>`: the directory and `name` a run sees (P20). Skill names are
 * lowercase letters, digits and hyphens, at most 64 characters, matching their
 * directory. Null when the slug cannot be namespaced within that, and for
 * `workspace`, whose names carry a number (`workspaceSkillName`).
 */
export function namespacedSkillName(source: SkillSource, slug: string): string | null {
  return source === 'workspace' ? null : boundedSkillName(source, slug)
}

/**
 * `workspace-<n>-<slug>`: a workspace's skill, `n` numbering the workspace and
 * folder within the run, so two folders never merge into one staged name
 * (security review M2). Null when `n` is outside 1–99 or the slug is not valid.
 */
export function workspaceSkillName(n: number, slug: string): string | null {
  if (!Number.isInteger(n) || n < 1 || n > MAX_WORKSPACE_SKILL_INDEX) return null
  return boundedSkillName(`workspace-${n}`, slug)
}

/** The source an installed skill stages under, by its level: names stay as they were before installing (adr-0084). */
export const INSTALLED_SKILL_SOURCE: Readonly<Record<InstalledSkillLevel, SkillSource>> = { builtin: 'platform', org: 'org', agent: 'agent' }

/**
 * `<source>-<last part of the identity's name>`: the name an installed or personal skill stages under, so hq can see
 * two that would share one before it sends them (security review M2). Null when the identity is not one, or its name
 * does not make a skill name.
 */
export function deliveredSkillName(source: SkillSource, identity: string): string | null {
  const parsed = parseAssetIdentity(identity)
  if (!parsed) return null
  return namespacedSkillName(source, parsed.name.slice(parsed.name.lastIndexOf('/') + 1))
}

/**
 * The skills hq names in a run's dispatch beside its packages (spec part 4 *Defaults and switches*, part 5
 * *Delivery*). Installed and personal skills are content by digest, delivered as packages are; file skills are named
 * by place, path and fingerprint, and the site stages one only when what it reads has that fingerprint (security
 * review H3). Absent from an hq before 1.9.
 */
export type InstalledSkillLevel = 'builtin' | 'org' | 'agent'

/** `identity` is `publisher/name` (assets/identity.ts); `version` its pinned SemVer version. */
export type InstalledSkillEntry = {
  identity: string
  version: string
  digest: string
  level: InstalledSkillLevel
  /** The content to deliver: kind `skill`, key the version row id, the same digest. Optional only so 1.9 stays valid; hq always sends it from 1.10, and a site stages no entry without it. */
  ref?: PackageRef
}

/** Where in a place's files a skill was found: the place's own, one agent's, or a workspace repository's. */
export type FileSkillGroup = 'place' | 'agent' | 'workspace'

/** `path` is the skill folder within the place's storage; `fingerprint` the one that was switched on. */
export type FileSkillEntry = { placeId: string; path: string; fingerprint: string; group: FileSkillGroup }

/** A published version of the person's own skill, for the turns of their own conversation only. */
export type PersonSkillEntry = { identity: string; version: string; digest: string; ref?: PackageRef }

/**
 * One skill a run had staged, as the site records it on the run (`AgentRun.skillsUsed`): its staged name and source,
 * the fingerprint of what was staged, and what it was, so hq can show it at the version used. `personId` marks a
 * person's own skill, which opens only for that person (security review M6). A skill hq named that was not staged is
 * recorded too, with `refused`: it was not used, and its `name` is empty when no staged name could be formed.
 */
export type RunSkillUse = {
  name: string
  source: SkillSource
  fingerprint: string
  identity?: string
  version?: string
  placeId?: string
  path?: string
  personId?: string
  /** Set when hq named the skill and the site did not stage it, saying why (security review H3, M2). Since 1.10. */
  refused?: string
}
