/**
 * Scanning a place for skills in its files (site protocol 1.10), on the control channel. The site lists every skill
 * folder under the roots below, under the same bounds as staging, and returns what it read; it stores nothing and
 * never follows a symbolic link. hq checks the person's access to the place before it asks; the params carry no person
 * (adr-0042). Hidden entries are left out of every fingerprint, so a fingerprint here is exactly what staging would
 * stage and what a switch names (security review H3).
 */
import type { LocationRef } from '../storage/locationRef.js'
import { PACKAGE_MAX_BYTES, MAX_SKILL_SLUG_LENGTH, type FileSkillGroup, type PackageContents } from './packages.js'

/** The most skills one scan reports for a place, across all its roots (security review L1). */
export const SCAN_SKILLS_MAX_PER_PLACE = 200
/** Staging's bounds on a tree it reads, which a scan keeps to as well. */
export const SKILL_TREE_MAX_ENTRIES = 1000
export const SKILL_TREE_MAX_BYTES = 16 * 1024 * 1024
export const SKILL_TREE_MAX_DEPTH = 8
/** The most workspaces one scan takes. */
export const SCAN_SKILLS_MAX_WORKSPACES = 99

/** Under a place's root: its own skills, shared by every agent working there. */
export const PLACE_SKILLS_ROOT = '.agents/skills'
/** Under a workspace's repository: where skills are looked for, in this order. */
export const WORKSPACE_SKILL_ROOTS: readonly string[] = ['.agents/skills', '.claude/skills', '.github/skills']

/** Under a place's root: one agent's skills. Null when the id is not a safe path segment. */
export function agentSkillsRoot(agentId: string): string | null {
  if (typeof agentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(agentId)) return null
  return `.agents/agents/${agentId}/skills`
}

export type ScanWorkspace = { id: string; folder: string }

export interface LocationScanSkillsParams {
  loc: LocationRef
  /** The agent whose own folder is listed beside the place's. */
  agentId: string
  /** The run's workspaces; omitted or empty for a scan of the place alone. */
  workspaces?: ScanWorkspace[]
}

export type ScannedSkill = {
  group: FileSkillGroup
  /** Set for `agent`. */
  agentId?: string
  /** Set for `workspace`: the workspace's id and the folder it sits in. */
  workspaceId?: string
  workspaceFolder?: string
  /** The skill folder relative to its root (the place's, or the workspace's repository). */
  path: string
  /** A package digest over the files kept, hidden entries left out. */
  fingerprint: string
  /** From the front matter; empty when absent. */
  name: string
  description: string
  /** `metadata.version` and `metadata.identity`, when present. */
  version?: string
  identity?: string
}

export type ScanSkillsProblem = { group: FileSkillGroup; path: string; reason: string }

export interface LocationScanSkillsResult {
  skills: ScannedSkill[]
  /** Folders that could not be read or fingerprinted, and why. */
  problems: ScanSkillsProblem[]
  /** A bound was reached, so skills may exist that this answer does not list. */
  truncated: boolean
}

/**
 * Writing and removing one of a place's skill folders (site protocol 1.11): publishing a place's skill, rolling it
 * back, putting it back, adding an installed skill to a place, and removing one. Only a place's own skills and one
 * agent's are written, never a workspace's repository, whose versions are its commits. `location.writeSkill` is a
 * content method: its params name the place, the folder and the fingerprint, and the stream carries the files as a
 * `SkillFolderTransfer`. The site checks every file against its contents entry and the whole against the fingerprint,
 * keeps to staging's bounds, refuses a link anywhere on the way, writes the folder beside the old one and then puts it
 * in its place, so a run never reads a half-written skill. `location.removeSkill` is a control method.
 */

/** The most file content one written skill may carry: what one package may, inside staging's own bound. */
export const SKILL_WRITE_MAX_BYTES = Math.min(PACKAGE_MAX_BYTES, SKILL_TREE_MAX_BYTES)

/** A skill folder hq may write or remove, and what it is. Workspace folders are never one. */
export type PlaceSkillFolder = { group: 'place'; slug: string } | { group: 'agent'; agentId: string; slug: string }

const FOLDER_SLUG = /^[a-z0-9][a-z0-9-]*$/

/** `.agents/skills/<slug>` or `.agents/agents/<agent id>/skills/<slug>`; null for any other path. */
export function placeSkillFolder(dir: unknown): PlaceSkillFolder | null {
  if (typeof dir !== 'string' || dir.length > 512) return null
  const cut = dir.lastIndexOf('/')
  const parent = dir.slice(0, cut)
  const slug = dir.slice(cut + 1)
  if (cut < 0 || !FOLDER_SLUG.test(slug) || slug.length > MAX_SKILL_SLUG_LENGTH) return null
  if (parent === PLACE_SKILLS_ROOT) return { group: 'place', slug }
  const agent = /^\.agents\/agents\/([^/]+)\/skills$/.exec(parent)
  if (agent && agentSkillsRoot(agent[1]) === parent) return { group: 'agent', agentId: agent[1], slug }
  return null
}

export interface LocationWriteSkillParams {
  /** The place: a `LocationRef` with no workspace and no task. */
  loc: LocationRef
  /** The skill folder, as `placeSkillFolder` reads it. */
  dir: string
  /** The fingerprint of the files the stream carries, which the site checks before it writes anything. */
  digest: string
}

/** What a `location.writeSkill` stream carries: the files' contents list, and each file's bytes (base64) by path. */
export type SkillFolderTransfer = { contents: PackageContents; data: Record<string, string> }

export interface LocationRemoveSkillParams {
  loc: LocationRef
  dir: string
}

/** `removed: false` when the folder was not there. */
export interface LocationRemoveSkillResult {
  removed: boolean
}
