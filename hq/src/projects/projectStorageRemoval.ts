/**
 * Removing a deleted project's storage from its Execution Site's disk.
 *
 * Deleting a project removes its rows from hq's database, but its folders live
 * on the site that holds it, and hq cannot delete those itself — it asks the
 * site (`location.remove`). Two steps, because the site a project's storage is
 * on is read from the project's own row, which the delete removes:
 *
 *   1. `findProjectStorageSite` — BEFORE the delete, while the row exists.
 *   2. `removeProjectStorageOnSite` — AFTER the delete has committed.
 *
 * Neither may fail the delete. After the transaction the project is gone and
 * the person asked for exactly that; a site that is down or does not know
 * `location.remove` leaves an orphaned folder, which is recoverable and quiet,
 * where the alternative — refusing to delete, or restoring a row — leaves a
 * project someone asked to be rid of. So both only log, and name the project
 * and the site so the folder can be removed by hand.
 */
import { removeLocationOnSite } from '../storage/locationFileStore'
import { resolveStorageSite } from '../storage/storageSite'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Projects')

/** The logical id of the site holding the project's storage, or null when it cannot be told. */
export async function findProjectStorageSite(projectId: string): Promise<string | null> {
  try {
    return await resolveStorageSite({ ownerType: 'project', ownerId: projectId })
  } catch (err) {
    logger.warn(
      `deleteProject: could not tell which Execution Site holds project ${projectId}'s storage, ` +
        `so its folder will not be removed:`,
      err,
    )
    return null
  }
}

/**
 * Delete the project's whole storage directory on the site. `logicalSiteId` is
 * what `findProjectStorageSite` answered; null means it could not and there is
 * nothing to ask. Never throws.
 */
export async function removeProjectStorageOnSite(projectId: string, logicalSiteId: string | null): Promise<void> {
  if (logicalSiteId === null) return
  try {
    await removeLocationOnSite({ ownerType: 'project', ownerId: projectId }, { wholeOwner: true, logicalSiteId })
  } catch (err) {
    logger.warn(
      `deleteProject: project ${projectId} is deleted, but its folder on Execution Site ` +
        `${logicalSiteId} could not be removed and stays there until it is removed by hand:`,
      err,
    )
  }
}
