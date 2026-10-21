/**
 * "Archive finished tasks after" (agents-own-schedule spec §3). One wire value
 * for both the org and a project: 0 is off, otherwise a number of days.
 * Stored: the org's null means off; a project's null means "use the org's" and
 * its 0 means off. Unlike automation, the org's value is only a default, so a
 * project's choice stands whatever the org's is.
 */
export const ARCHIVE_DAY_CHOICES = [1, 7, 30] as const
export const ARCHIVE_OFF = 0
/** What the org starts with, and what applies when no org row exists yet. */
export const DEFAULT_ARCHIVE_DAYS = 1

export type ArchiveAfterDays = typeof ARCHIVE_OFF | (typeof ARCHIVE_DAY_CHOICES)[number]

export function isArchiveAfterDays(v: unknown): v is ArchiveAfterDays {
  return v === ARCHIVE_OFF || (ARCHIVE_DAY_CHOICES as readonly unknown[]).includes(v)
}

export function archiveSettingProblem(v: unknown): string | null {
  return isArchiveAfterDays(v) ? null : 'Choose off, 1 day, 7 days or 30 days.'
}

export const orgDaysToStored = (v: ArchiveAfterDays): number | null => (v === ARCHIVE_OFF ? null : v)
export const orgDaysFromStored = (v: number | null): ArchiveAfterDays => (v === null ? ARCHIVE_OFF : (v as ArchiveAfterDays))

/** A project's stored choice against the org's stored default; 0 when archiving is off. */
export function effectiveArchiveDays(projectChoice: number | null, orgStored: number | null): number {
  return projectChoice ?? orgStored ?? ARCHIVE_OFF
}
