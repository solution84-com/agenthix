// Refuses an image build when the disk the images are built on has too little free space.
//   node scripts/images/free-disk.mjs        exit 0 with room, 1 below the floor (the reason on stderr)
// The floor is 20 GB, or IMAGE_BUILD_MIN_FREE_GB. The space checked is the folder Docker keeps its images in, when this
// machine can see it, else the machine's own disk (Docker Desktop keeps its disk image there).
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const DEFAULT_FLOOR_GB = 20

export function floorGb(env) {
  const raw = env.IMAGE_BUILD_MIN_FREE_GB
  if (raw === undefined || raw === '') return DEFAULT_FLOOR_GB
  const gb = Number(raw)
  if (!Number.isFinite(gb) || gb < 0) throw new Error(`IMAGE_BUILD_MIN_FREE_GB is "${raw}", which is not a number of gigabytes. Nothing was built.`)
  return gb
}

/** `null` when there is room; otherwise the sentence that says how much is free, the floor, and how to make room. */
export function refusal({ freeBytes, floor, where }) {
  if (freeBytes >= floor * 1e9) return null
  const free = (freeBytes / 1e9).toFixed(1)
  return `Only ${free} GB is free on ${where}, and an image build needs at least ${floor} GB (set IMAGE_BUILD_MIN_FREE_GB to change that). ` +
    'Make room with `docker builder prune` and `docker image prune`, then run it again. Nothing was built.'
}

function dockerRoot() {
  try {
    const dir = execFileSync('docker', ['info', '--format', '{{.DockerRootDir}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return dir && existsSync(dir) ? dir : null
  } catch {
    return null
  }
}

export function freeBytesOn(path) {
  const row = execFileSync('df', ['-Pk', path], { encoding: 'utf8' }).trim().split('\n').pop().trim().split(/\s+/)
  return Number(row[3]) * 1024
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const where = dockerRoot() ?? '/'
    const message = refusal({ freeBytes: freeBytesOn(where), floor: floorGb(process.env), where: where === '/' ? 'this machine\'s disk' : where })
    if (message) {
      console.error(message)
      process.exit(1)
    }
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
