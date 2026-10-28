/**
 * hq's own storage — the disk hq keeps its own data on (close-out spec §6.5).
 *
 * Distinct from `hqAssets.ts`, which is hq's read-only bundled content shipped
 * in its image, and from a site's disk, which hq no longer names at all. What
 * belongs here is data only hq ever reads or writes: it was on a site's disk
 * because the disk was there, not because a run needs it.
 *
 * Wasp runs the server from <hq>/.wasp/out/server locally and from
 * /app/.wasp/out/server in the image, so three levels up is hq/storage or
 * /app/storage — the same derivation `getHqAssetsRoot` makes for the assets
 * beside it. HQ_STORAGE_ROOT overrides it, and a container deployment must set
 * it to a path that survives the container, since /app/storage does not.
 */
import os from 'node:os'
import path from 'node:path'

export function getHqStorageRoot(): string {
  const configured = process.env.HQ_STORAGE_ROOT
  if (configured) {
    return path.resolve(configured.startsWith('~/') ? path.join(os.homedir(), configured.slice(2)) : configured)
  }
  return path.resolve(process.cwd(), '..', '..', '..', 'storage')
}

/**
 * Where an agent's avatar and cover images live. Keyed by the agent's id, not
 * its handle: the id is immutable, so a rename moves nothing, and it is already
 * what the serving route is addressed by.
 *
 * The path is built here and nowhere else, but it is not a boundary — the
 * containment check the write and the read each make against
 * `getHqStorageRoot()` is (realPathWithin.ts). An id that climbs out of the
 * root produces a path this function is happy to return and both of those
 * refuse.
 */
export function getAgentImagesDir(agentId: string): string {
  return path.join(getHqStorageRoot(), 'agents', agentId, 'images')
}

/**
 * Where a person's picture lives — by their id, like an agent's images.
 * Erasing the person (adr-0100) removes the whole directory.
 */
export function getPersonImagesDir(userId: string): string {
  return path.join(getHqStorageRoot(), 'people', userId, 'images')
}

/**
 * Where one task attachment lives. Keyed by the task's id for the same reason as
 * an agent's images: the id is immutable, so nothing moves when a task is
 * renamed, and the id is what the serving route is addressed by.
 *
 * Each attachment keeps its own directory beneath the task, so two uploads of
 * the same filename do not collide and the stored reference stays valid — the
 * shape the site's disk already used, moved root and all.
 */
export function getTaskAttachmentDir(taskId: string, uuid: string): string {
  return path.join(getHqStorageRoot(), 'tasks', taskId, uuid)
}

/**
 * Where the cached voice-preview list, sample phrases and synthesised audio
 * live (voice/voiceCache.ts). Org-global — not keyed to anything, since the
 * cache is addressed entirely by content hash and voice id.
 */
export function getVoiceCacheDir(): string {
  return path.join(getHqStorageRoot(), 'cache', 'voice-previews')
}

/**
 * Where an org library skill's source lives, keyed by its slug. Platform
 * skills ship read-only in hq's assets (hqAssets.ts) and never reach here.
 *
 * A skill's source reaching a run is a packages concern, not this one: a run
 * stages skills from cached package bytes fetched over the control channel,
 * never from this directory (site/src/agents/runtime/skillStaging.ts).
 */
export function getLibrarySkillDir(slug: string): string {
  return path.join(getHqStorageRoot(), 'org', 'skills', slug)
}
