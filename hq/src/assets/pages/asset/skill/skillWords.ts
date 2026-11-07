/**
 * What a skill's page and its editor say (board *A skill's page*, *The editor*, *Smaller fixes and words*): who uses
 * it, its versions, and going back to one, under one name. Pure.
 */

/** The one name for making an earlier version the one in use, everywhere it is offered. */
export const RETURN_TO_VERSION = 'Return to this version'
export const BACK_TO_IN_USE = 'Back to the version in use'
import { NO_AGENT_USES_IT } from '../../../../library/assetList/words'
export { NO_AGENT_USES_IT }

/** "Nov 5": every date on these screens. */
export function dayWords(at: string | Date): string {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Used by 2 agents", "Used by every agent", "No agent uses it". */
export function usedByWords(holders: { everyAgent: boolean; count: number }): string {
  if (holders.everyAgent) return 'Used by every agent'
  if (holders.count === 0) return NO_AGENT_USES_IT
  return `Used by ${holders.count} ${holders.count === 1 ? 'agent' : 'agents'}`
}

/** A built-in skill is on for every agent or for none: "Used by every agent", "Switched off". */
export function builtInWords(on: boolean): string {
  return on ? 'Used by every agent' : 'Switched off'
}

/** The breadcrumb's last part: "1.1.0 · in use", "1.0.0", "draft". */
export function versionCrumb(version: string, inUse: boolean): string {
  return inUse ? `${version} · in use` : version
}

/** What an older version's page says above its files. */
export function lookingAtWords(version: string, inUse: string | null): string {
  return `You are looking at ${version}, read-only.${inUse ? ` Agents use ${inUse}.` : ''}`
}

/** "published by Ada · Nov 5 · “Group by area”": a version's line in the versions menu. */
export function versionLine(v: { source: string; by: string | null; createdAt: string | Date; note: string | null }): string {
  const how: Record<string, string> = { BUILT_IN: 'came with HQ', UPLOAD: 'uploaded', URL: 'installed from a link', MADE_HERE: 'published' }
  const said = `${how[v.source] ?? 'installed'}${v.by ? ` by ${v.by}` : ''}`
  return [said, dayWords(v.createdAt), v.note ? `“${v.note}”` : null].filter(Boolean).join(' · ')
}

/** What the open file of an older version says of it: "new in 1.0.0, the first version", "changed in 1.1.0". */
export function changedInWords(status: 'added' | 'modified' | 'removed', version: string, first: boolean): string {
  const what = status === 'added' ? 'new' : status === 'removed' ? 'deleted' : 'changed'
  return `${what} in ${version}${first ? ', the first version' : ''} · read-only`
}

/** "Draft · changes 2 files from version 1.1.0, in use". */
export function draftWords(changed: number, baseLabel: string, hasDraft: boolean): string {
  if (!hasDraft && changed === 0) return `No changes yet from ${baseLabel}`
  if (changed === 0) return `Draft · the same as ${baseLabel}`
  return `Draft · changes ${changed} ${changed === 1 ? 'file' : 'files'} from ${baseLabel}`
}

/** The ⋯ menu's downloads: the file shown, saved as that one file, and the whole skill as a package another HQ can install. */
export const DOWNLOAD_FILE_HINT = (size: string) => `The file shown · ${size}`
export const DOWNLOAD_SKILL = 'Download the skill'
export const DOWNLOAD_SKILL_HINT = 'Every file, as a package another HQ can install'
export const DOWNLOAD_SKILL_ADMINS_ONLY = 'Downloading a skill as a package is for administrators.'
