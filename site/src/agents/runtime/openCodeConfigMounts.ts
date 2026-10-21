/**
 * OpenCode's two configuration folders in the harness home, closed to the
 * agent (spec, "Keeping the gate whole", item 1).
 *
 * OpenCode always reads `~/.config/opencode` and `~/.opencode`, whatever
 * `OPENCODE_DISABLE_PROJECT_CONFIG` says, and either can bring configuration,
 * plugins, tools, agents and skills. The harness home is the agent's to write,
 * so both are covered by read-only binds of one folder the site keeps outside
 * every home, holding nothing but a `.gitignore`. Nothing in the container can
 * write to them, remove them or put something in their place.
 *
 * The `.gitignore` must be there already: OpenCode writes one into each folder
 * at start and forgives only a permission refusal, so on a read-only folder
 * without one every request fails. The spec asks for folders owned by another
 * user; the site is not root and cannot give a folder away, and the read-only
 * bind is what makes it unwritable, to the owner as much as anyone.
 *
 * Their mount points are created in the home by the site first, as real
 * folders: docker would otherwise create them root-owned inside the home,
 * where neither the harness nor the site could then remove them.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { getSiteRoot } from '../agentDiskPaths'
import { HARNESS_HOME_CONTAINER_DIR, harnessHomeFor } from './harnessHomes'
import type { ContainerKey } from './containerTypes'

/** The two folders, relative to the harness home. */
const CONFIG_DIRS_IN_HOME = ['.config/opencode', '.opencode'] as const

/** Where they are mounted in every container. */
export const OPENCODE_CONFIG_CONTAINER_DIRS: readonly string[] = CONFIG_DIRS_IN_HOME.map(dir =>
  path.posix.join(HARNESS_HOME_CONTAINER_DIR, dir),
)

/** What OpenCode itself writes into a configuration folder's `.gitignore`. */
const GITIGNORE = ['node_modules', 'package.json', 'package-lock.json', 'bun.lock', '.gitignore'].join('\n')

/** The site's one source folder for both mounts: under the site root, beside the homes, never inside one. */
export function openCodeConfigSourceDir(): string {
  return path.join(getSiteRoot(), 'harness', 'opencode-config')
}

/** The `docker run` arguments that mount both folders, read-only. */
export function openCodeConfigMountArgs(): string[] {
  const source = openCodeConfigSourceDir()
  return OPENCODE_CONFIG_CONTAINER_DIRS.flatMap(target => ['-v', `${source}:${target}:ro`])
}

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/**
 * Makes `home/<relative>` a chain of real folders. Whatever else stands at one
 * of its parts — a symbolic link, a file — is removed, never followed: a link
 * the agent left in its home points where the container sees things, not
 * where this machine does.
 */
async function ensureRealFolders(home: string, relative: string): Promise<void> {
  let current = home
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    const stat = await fs.lstat(current).catch((err: unknown) => {
      if (isMissing(err)) return null
      throw err
    })
    if (stat?.isDirectory()) continue
    if (stat) await fs.rm(current, { force: true })
    await fs.mkdir(current).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'EEXIST') throw err
    })
  }
}

/**
 * Before `docker run`: the source folder with its `.gitignore`, and both mount
 * points in the runner's home. Throws when either cannot be made, since a
 * container started without them would leave OpenCode's configuration open.
 */
export async function prepareOpenCodeConfigMounts(key: ContainerKey): Promise<void> {
  const source = openCodeConfigSourceDir()
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(path.join(source, '.gitignore'), GITIGNORE, { flag: 'wx', mode: 0o444 }).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'EEXIST') throw err
  })

  const home = harnessHomeFor(key)
  await fs.mkdir(home, { recursive: true })
  for (const dir of CONFIG_DIRS_IN_HOME) await ensureRealFolders(home, dir)
}
