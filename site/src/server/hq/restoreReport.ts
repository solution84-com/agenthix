/**
 * `site.restoreReport` (core's siteRestore.ts): the workspaces this site holds, and — when the host service
 * restored it from a backup — that backup's night and time, from the note it leaves in the data folder. HQ asks
 * each time the site connects, and reconciles: it says what was lost, and takes back what it recognises. The note
 * stays; HQ remembers which restore it has already reported.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '#db'
import { parseSiteRestoreReport, type SiteRestoredFrom, type SiteRestoreReport } from '@agenthix/core'
import { getSiteRoot } from '../../agents/agentDiskPaths'

/** Written by the host service when it restores this site (host/src/backups/restore.ts). */
export const RESTORED_NOTE = 'restored.json'

export async function readRestoredNote(root = getSiteRoot()): Promise<SiteRestoredFrom | null> {
  let text: string
  try {
    text = await fs.readFile(path.join(root, RESTORED_NOTE), 'utf8')
  } catch {
    return null
  }
  try {
    return parseSiteRestoreReport({ restored: JSON.parse(text), workspaces: [] })?.restored ?? null
  } catch {
    return null
  }
}

export async function restoreReport(): Promise<SiteRestoreReport> {
  const [restored, workspaces] = await Promise.all([
    readRestoredNote(),
    prisma.workspace.findMany({ select: { id: true, ownerType: true, ownerId: true } }),
  ])
  return { restored, workspaces }
}
