/**
 * Who a service runs as (spec part 4, *never root*), and its share of the live preview's budget.
 *
 * Many official images (postgres among them) start as the administrator and switch to their own user. The site starts
 * them as that user directly: the image's own user when it names one other than root; otherwise the user the image's
 * `/etc/passwd` names after the image (`postgres` for `postgres:16`, `mongodb` for `mongo`); otherwise `nobody`. Always
 * as `uid:gid` by number, so what Docker reports is what was given; a user or group that is 0 however it is written
 * (`0`, `00`, `0000:0`) is root's, and a group of 0 becomes nobody's. No capability is added for any image.
 */
import type { LivePreviewBudget } from '../container/budget'
import type { ServiceImage } from './serviceTemplate'

export const NOBODY = '65534:65534'

const NOBODY_GID = 65534
const NUMERIC = /^(\d{1,10})(?::(\d{1,10}))?$/

function isRoot(user: string): boolean {
  const u = user.trim().split(':')[0]
  return u === '' || u === 'root' || (/^\d+$/.test(u) && Number(u) === 0)
}

const safeGid = (gid: number) => (gid > 0 ? gid : NOBODY_GID)

type Entry = { name: string; uid: number; gid: number }

function entries(passwd: string | null): Entry[] {
  return (passwd ?? '').split('\n').flatMap(line => {
    const [name, , uid, gid] = line.split(':')
    return name && /^\d+$/.test(uid ?? '') && /^\d+$/.test(gid ?? '') ? [{ name, uid: Number(uid), gid: Number(gid) }] : []
  })
}

/** The last part of an image's name, without registry, tag or digest: `postgres` for `docker.io/library/postgres:16`. */
export function imageBaseName(image: string): string {
  const path = image.split('@')[0]
  const last = path.slice(path.lastIndexOf('/') + 1)
  return last.split(':')[0]
}

/** Whether the image's user must be looked up in its files. */
export function needsPasswd(image: ServiceImage): boolean {
  const m = NUMERIC.exec(image.user.trim())
  return isRoot(image.user) || !m || m[2] === undefined
}

export function serviceUser(image: ServiceImage, ref: string, passwd: string | null): string {
  const all = entries(passwd).filter(e => e.uid > 0)
  if (!isRoot(image.user)) {
    const m = NUMERIC.exec(image.user.trim())
    if (m) {
      const uid = Number(m[1])
      const gid = m[2] !== undefined ? Number(m[2]) : (all.find(e => e.uid === uid)?.gid ?? NOBODY_GID)
      return `${uid}:${safeGid(gid)}`
    }
    const [name, group] = image.user.split(':')
    const found = all.find(e => e.name === name)
    if (found) return `${found.uid}:${safeGid(group && /^\d+$/.test(group) ? Number(group) : found.gid)}`
  }
  const base = imageBaseName(ref)
  const own = all.find(e => e.name === base) ?? all.find(e => e.name.startsWith(base) && e.uid >= 100)
  return own ? `${own.uid}:${safeGid(own.gid)}` : NOBODY
}

/**
 * A service's part of the services' share (`splitLivePreviewBudget`): an even part for each declared service, never more
 * than what the running ones left. Null when nothing is left.
 */
export function serviceBudget(pool: LivePreviewBudget, declared: number, used: LivePreviewBudget[]): LivePreviewBudget | null {
  const n = Math.max(1, declared)
  const sum = (k: keyof LivePreviewBudget) => used.reduce((t, b) => t + b[k], 0)
  const b: LivePreviewBudget = {
    memoryBytes: Math.min(Math.floor(pool.memoryBytes / n), pool.memoryBytes - sum('memoryBytes')),
    cpus: Math.min(Math.floor((pool.cpus / n) * 100) / 100, Math.round((pool.cpus - sum('cpus')) * 100) / 100),
    pids: Math.min(Math.floor(pool.pids / n), pool.pids - sum('pids')),
    diskBytes: Math.min(Math.floor(pool.diskBytes / n), pool.diskBytes - sum('diskBytes')),
    imageBytes: pool.imageBytes,
    logBytes: Math.min(Math.floor(pool.logBytes / n), pool.logBytes - sum('logBytes')),
  }
  const enough = b.memoryBytes >= 32 * 1024 * 1024 && b.cpus >= 0.01 && b.pids >= 16 && b.diskBytes >= 4 * 1024 * 1024 && b.logBytes >= 3 * 1024
  return enough ? b : null
}
