/**
 * The last of an uninstall (`agenthix uninstall`): a container cannot remove itself and carry on, so the host service
 * starts a short-lived helper from its own image, as it starts the launcher for a switch (ADR-0118), and answers the
 * CLI. The helper waits for that answer to reach the person, then removes the host service's container, the figures
 * volume it held, and the state folder, and last itself. Anything it could not remove it prints, and it then stays,
 * stopped, so `docker logs` shows what was left.
 *
 * The state folder is emptied, never more: the helper is given that folder alone (the one Docker's own `inspect` of
 * the host service names, never a request), so it cannot reach anything beside it, and the empty folder is left for
 * the person to remove. It is emptied only when it holds the namespace record of this install, and only when it holds
 * nothing but what the host service writes there (`STATE_FILES`, `STATE_FOLDERS`): one that also holds anything else —
 * the person's home folder mounted as `/state`, say — is left whole, the names the host service writes included, and
 * the person is told what else is in it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { BRANDING } from '@agenthix/core'
import type { ContainerSpec, Mount } from '../docker/containers'
import type { Removal } from '../docker/removal'
import { STATE_MOUNT } from '../service/context'
import type { InstallNames } from '../state/namespace'
import { DOCKER_SOCKET, hostLabels, type HostContainerRecord } from './record'

/** Where the state folder is mounted in the helper. */
export const STATE_IN_HELPER = '/machine-state'
/** Long enough for the host service's answer to reach the CLI before its container goes. */
export const ANSWER_GRACE_MS = 5_000

const NAMESPACE = /^[a-z][a-z0-9-]{0,30}$/
const FOLDER_NAME = /^[A-Za-z0-9._-]{1,255}$/

/**
 * Every entry the host service writes at the top of its state folder. `stateEntries.test.ts` reads the code for every
 * name it passes to the state folder and fails when one is missing here, or listed here and no longer written.
 */
export const STATE_FILES: ReadonlySet<string> = new Set([
  'installation.json', 'machine.json', 'secrets.json', 'upgrades.json', 'scheduled.json', 'resize.json', 'suspended.json',
])
export const STATE_FOLDERS: ReadonlySet<string> = new Set([
  'site', 'hq', 'console', 'front-door', 'move', 'backups', 'bin', 'keys', 'exports', 'exports-held', 'link', 'launcher',
  'identity', 'registry', 'remote-access',
])
/** A file the host service was replacing whole when it stopped (`StateFolder.writePrivate`). */
const HALF_WRITTEN = /^(.+)\.\d+\.tmp$/

const ownEntry = (name: string, entry: fs.Stats) => entry.isDirectory()
  ? STATE_FOLDERS.has(name)
  : STATE_FILES.has(name) || STATE_FILES.has(HALF_WRITTEN.exec(name)?.[1] ?? '')

/**
 * Empties `dir` when it holds only what the host service writes there; otherwise touches nothing in it, not even the
 * names it writes — a folder holding anything else is not its own (a home folder mounted as `/state`, say), and a
 * name such as `backups` may then be the person's — and returns what else it holds, by name.
 */
function removeStateFolder(dir: string): string[] {
  const names = fs.readdirSync(dir).sort()
  // A link is never followed, and counts as something the host service did not write.
  const foreign = names.filter(name => {
    const entry = fs.lstatSync(path.join(dir, name))
    return entry.isSymbolicLink() || !ownEntry(name, entry)
  })
  if (foreign.length) return foreign
  for (const name of names) fs.rmSync(path.join(dir, name), { recursive: true, force: true })
  return []
}

export const helperName = (names: Pick<InstallNames, 'hostContainer'>) => `${names.hostContainer}-uninstall`

/** The state folder as the helper can empty it: a folder on the machine, not `/` and not a volume. */
export function stateOnMachine(record: HostContainerRecord): { source: string; name: string } | null {
  const mount = record.mounts.find(m => m.destination === STATE_MOUNT)
  if (!mount || mount.type !== 'bind') return null
  const source = mount.source.replace(/\/+$/, '')
  const name = path.posix.basename(source)
  return source && name && FOLDER_NAME.test(name) && name !== '.' && name !== '..' ? { source, name } : null
}

/** The helper: the host service's own image, the Docker socket and the state folder only, no network. */
export function helperSpec(record: HostContainerRecord, names: InstallNames): ContainerSpec {
  const socket = record.mounts.find(m => m.destination === DOCKER_SOCKET)!
  const folder = stateOnMachine(record)
  const mounts: Mount[] = [socket]
  if (folder) mounts.push({ type: 'bind', source: folder.source, destination: STATE_IN_HELPER, readOnly: false })
  return {
    name: helperName(names),
    labels: hostLabels(names),
    image: record.image,
    mounts,
    network: 'none',
    capAdd: [],
    env: record.env.filter(e => e.startsWith('TZ=')),
    restart: 'no',
    command: ['node', '--enable-source-maps', '/app/dist/launcher.js', 'uninstall', names.namespace, ...(folder ? [folder.name] : [])],
  }
}

export type HelperEnv = {
  names: InstallNames
  /** The state folder's name on the machine, for what the helper says; null when it was not a folder it can reach. */
  folder: string | null
  /** Where the state folder is in the helper. */
  stateDir: string
  remove: { container: (name: string) => Promise<Removal>; volume: (name: string) => Promise<Removal> }
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

export function parseHelperArgs(args: string[]): { namespace: string; folder: string | null } | null {
  const [namespace, folder, ...rest] = args
  if (!namespace || !NAMESPACE.test(namespace) || rest.length) return null
  if (folder !== undefined && (!FOLDER_NAME.test(folder) || folder === '.' || folder === '..')) return null
  return { namespace, folder: folder ?? null }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Whether `dir` is this install's state folder: it records this namespace. */
function recordsNamespace(dir: string, namespace: string): boolean {
  try {
    return (JSON.parse(fs.readFileSync(path.join(dir, 'installation.json'), 'utf8')) as { namespace?: unknown }).namespace === namespace
  } catch {
    return false
  }
}

/** Removes what the host service could not remove from inside itself; returns what was left, in words. */
export async function runHelper(env: HelperEnv): Promise<string[]> {
  const left: string[] = []
  const { names } = env
  await env.sleep(ANSWER_GRACE_MS)
  const attempt = async (what: string, work: () => Promise<unknown>) => {
    try {
      await work()
      env.log(`Removed ${what}.`)
    } catch (err) {
      left.push(`${what}: ${message(err)}`)
    }
  }
  await attempt(`the host service's container ${names.hostContainer}`, () => env.remove.container(names.hostContainer))
  await attempt(`the volume ${names.hostFiguresVolume}`, async () => {
    if ((await env.remove.volume(names.hostFiguresVolume)) === 'inUse') throw new Error('a container still uses it')
  })
  if (env.folder === null) {
    left.push('the state folder: it is not a folder on the machine the helper can reach, so it was left')
  } else {
    const dir = env.stateDir
    await attempt(`what is in the state folder ${env.folder}`, async () => {
      if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) return
      if (!recordsNamespace(dir, names.namespace)) throw new Error(`it does not record the namespace ${names.namespace}, so it was left`)
      const foreign = removeStateFolder(dir)
      if (foreign.length) {
        throw new Error(`it holds ${foreign.join(', ')}, which ${BRANDING.displayName} did not write, so nothing in it was removed. ` +
          'Once you have checked what it holds, you can delete it yourself')
      }
    })
  }
  for (const line of left) env.log(`Not removed: ${line}`)
  return left
}
