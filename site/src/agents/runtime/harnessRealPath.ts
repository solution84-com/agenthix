/**
 * Where a path a harness names really leads: symbolic links and `..` resolved,
 * as the harness itself would see them.
 *
 * The harness's own file tools run inside the harness, so the gate must judge
 * the path they will open, not the one the model wrote — a link the agent
 * planted in its project can point anywhere (spec, "Per-call authorization
 * gate", item 6). Under container isolation the path lives in the container:
 * its links are written in the container's terms and parts of it (`/tmp`, the
 * image) are not on this machine at all, so it is resolved in the container,
 * by one `docker exec` as the image's user. Without a container the harness
 * runs here and the path is resolved here.
 *
 * A path whose last parts do not exist yet (a file about to be written) is
 * resolved up to the deepest part that exists, and the rest is appended; a
 * link among the existing parts, dangling or not, is followed. Anything that
 * cannot be answered throws, and the gate refuses the call.
 *
 * What this cannot do: the harness opens the path after the decision, so a
 * link swapped in between is not seen. Commands cannot reach the harness home
 * (Landlock), so such a swap can only redirect a call into the project itself
 * or elsewhere outside the home — never into it through a path the gate saw.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { dockerWithin } from './containerLifecycle'
import { AGENT_IMAGE_USER } from './harnessHomes'

export type RealPathResolver = (absolutePath: string) => Promise<string>

export const REAL_PATH_TIMEOUT_MS = 5_000
const MAX_LINK_HOPS = 40

/**
 * Busybox `sh`. The path arrives as `$1`, never inside the script, so no path
 * can change what runs. `readlink -f` resolves every link but needs all but
 * the last part to exist, so the missing tail is peeled off first, and a
 * dangling link is followed by hand (bounded), since `readlink -f` answers one
 * differently from one system to the next.
 */
export const REAL_PATH_SCRIPT = [
  'p=$1; rest=; n=0',
  'while :; do',
  '  while [ "$p" != / ] && [ ! -e "$p" ] && [ ! -L "$p" ]; do rest="/${p##*/}$rest"; p=${p%/*}; [ -n "$p" ] || p=/; done',
  '  [ -L "$p" ] && [ ! -e "$p" ] || break',
  `  n=$((n+1)); [ "$n" -le ${MAX_LINK_HOPS} ] || exit 3`,
  '  t=$(readlink "$p") || exit 3',
  '  case $t in /*) p=$t ;; *) p="${p%/*}/$t" ;; esac',
  'done',
  'r=$(readlink -f "$p") || exit 3',
  '[ -n "$r" ] || exit 3',
  '[ "$r" = / ] && r=',
  'printf "%s%s\\n" "$r" "$rest"',
].join('\n')

export function containerRealPathArgs(containerName: string, absolutePath: string): string[] {
  return ['exec', '-u', AGENT_IMAGE_USER, containerName, 'sh', '-c', REAL_PATH_SCRIPT, 'agenthix-realpath', absolutePath]
}

function checkedAbsolute(p: string, what: string): string {
  if (!p.startsWith('/')) throw new Error(`${what} is not absolute: ${JSON.stringify(p)}`)
  return p
}

/** Resolves in the named container, with a deadline; an empty or relative answer is an error. */
export function containerRealPathResolver(containerName: string, timeoutMs = REAL_PATH_TIMEOUT_MS): RealPathResolver {
  return async (absolutePath) => {
    checkedAbsolute(absolutePath, 'Path to resolve')
    const { stdout } = await dockerWithin(containerRealPathArgs(containerName, absolutePath), timeoutMs)
    const answer = stdout.replace(/\n$/, '') || '/'
    return path.posix.normalize(checkedAbsolute(answer, 'Resolved path'))
  }
}

function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** Resolves on this machine, for a harness that runs here (no container isolation). */
export const hostRealPathResolver: RealPathResolver = async (absolutePath) => {
  let current = path.posix.resolve(checkedAbsolute(absolutePath, 'Path to resolve'))
  let rest: string[] = []
  for (let hops = 0; hops <= MAX_LINK_HOPS;) {
    try {
      const real = await fs.realpath(current)
      return rest.length ? path.posix.join(real, ...rest) : real
    } catch (err) {
      if (!isMissing(err) || current === '/') throw err
    }
    const link = await fs.lstat(current).then(s => s.isSymbolicLink(), (err: unknown) => {
      if (isMissing(err)) return false
      throw err
    })
    if (link) {
      hops++
      current = path.posix.resolve(path.posix.dirname(current), await fs.readlink(current))
      continue
    }
    rest = [path.posix.basename(current), ...rest]
    current = path.posix.dirname(current)
  }
  throw new Error(`Too many symbolic links resolving ${absolutePath}`)
}
