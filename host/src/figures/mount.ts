/**
 * Whether the figures volume is mounted. Without it the figures socket still opens, in a folder of the host
 * service's own container, but the site cannot reach it — and the site's compose project names the volume, so
 * install cannot start the site either.
 */

/** Whether `/proc/self/mountinfo` lists `path` as a mount point (the fifth field of a line). */
export function isMountPoint(mountinfo: string, path: string): boolean {
  return mountinfo.split('\n').some(line => line.split(' ')[4] === path)
}

/** What to tell the machine admin when the volume is missing; null when it is mounted. */
export function figuresVolumeWarning(mountinfo: string, path: string, volume: string): string | null {
  if (isMountPoint(mountinfo, path)) return null
  return `The volume ${volume} is not mounted at ${path}, so the site this machine runs cannot read its figures, ` +
    `and install cannot start it. Start the host service's container again with -v ${volume}:${path} added, ` +
    'as the guide\'s command does.'
}
