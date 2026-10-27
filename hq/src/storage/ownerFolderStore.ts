/**
 * hq's typed store for an owner's `artefacts/` on the site
 * that holds its storage — the folders beside `files/` that no location names
 * (core's `LOCATION_FILE_METHODS.listArtefacts` says why). The handler is
 * `site/src/server/storage/ownerFolderMethods.ts`. An artefact's bytes never
 * come to hq: a person opens one through a relay (adr-0153).
 *
 * Everything `./locationFileStore.ts` says holds here: **nothing in this module
 * checks who is asking** (the `OnSite` suffix marks it), listings cross the
 * control channel, and a site that cannot be
 * reached raises `SiteUnreachableError` through the same `translateFailure`.
 */
import {
  LOCATION_FILE_METHODS,
  type LocationListArtefactsResult,
  type StorageOwnerRef,
  type SiteMethodResult,
} from '@agenthix/core'
import { siteChannelRegistry } from '../sites/channel'
import { resolveStorageSite } from './storageSite'
import { translateFailure } from './locationFileStore'

/** Exactly the two fields the wire declares; the site refuses any other. */
function wireOwner(owner: StorageOwnerRef): StorageOwnerRef {
  return { ownerType: owner.ownerType, ownerId: owner.ownerId }
}

/** The owner-addressed listings, whose params are the owner and nothing else. */
type OwnerListing = typeof LOCATION_FILE_METHODS.listArtefacts

async function request<M extends OwnerListing>(owner: StorageOwnerRef, method: M): Promise<SiteMethodResult<M>> {
  const logicalSiteId = await resolveStorageSite(wireOwner(owner))
  try {
    return await siteChannelRegistry.request(logicalSiteId, method, wireOwner(owner))
  } catch (err) {
    return translateFailure(logicalSiteId, method, err)
  }
}

/** The files directly in an owner's `artefacts/`, newest first. */
export function listArtefactsOnSite(owner: StorageOwnerRef): Promise<LocationListArtefactsResult> {
  return request(owner, LOCATION_FILE_METHODS.listArtefacts)
}
