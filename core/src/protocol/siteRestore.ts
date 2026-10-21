/**
 * After a restore, HQ and a site reconcile when the site reconnects (host-management spec §12). HQ asks
 * `site.restoreReport` each time a site connects; the site answers with the workspaces it holds and, when the host
 * service restored it, the backup it came back from. HQ compares the workspaces with where it placed them:
 *
 * - a restored site — those HQ placed there that it no longer holds were lost with its machine, and HQ says so,
 *   with the time after which files were lost;
 * - a restored HQ — those the site holds that HQ has no placement for were made after HQ's backup: HQ takes back
 *   the ones whose owner it knows, and tells its organisation admins about the rest.
 */

export const SITE_RESTORE_METHODS = {
  report: 'site.restoreReport',
} as const

export type SiteRestoredFrom = {
  /** The night the backup belongs to, `YYYY-MM-DD`. */
  night: string
  /** When it was taken (ISO): files changed after it were lost. */
  takenAt: string
}

export type SiteRestoreWorkspace = { id: string; ownerType: 'project' | 'user'; ownerId: string }

export type SiteRestoreReport = {
  /** The backup the site came back from; null when it was never restored. */
  restored: SiteRestoredFrom | null
  workspaces: SiteRestoreWorkspace[]
}

const MAX_WORKSPACES = 100_000

function restoredFrom(v: unknown): SiteRestoredFrom | null | undefined {
  if (v === null) return null
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  return typeof r.night === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.night) && typeof r.takenAt === 'string' && !Number.isNaN(Date.parse(r.takenAt))
    ? { night: r.night, takenAt: r.takenAt }
    : undefined
}

/** A site's answer, rebuilt field by field; null when it is not one. */
export function parseSiteRestoreReport(v: unknown): SiteRestoreReport | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const restored = restoredFrom(r.restored)
  if (restored === undefined || !Array.isArray(r.workspaces) || r.workspaces.length > MAX_WORKSPACES) return null
  const workspaces: SiteRestoreWorkspace[] = []
  for (const w of r.workspaces) {
    const x = (w ?? {}) as Record<string, unknown>
    if (typeof x.id !== 'string' || typeof x.ownerId !== 'string' || (x.ownerType !== 'project' && x.ownerType !== 'user')) return null
    workspaces.push({ id: x.id, ownerType: x.ownerType, ownerId: x.ownerId })
  }
  return { restored, workspaces }
}
