/**
 * The `docker run` a workflow step is started with (workflows spec part 2, *How an executor container is started*),
 * and the values it is handed. Pure: it reads nothing and starts nothing.
 *
 * The step's secrets and the run's parameters are never on this machine's disk, on a command line or in the
 * container's environment. They go as one small tar archive on the container's standard input, which its first
 * command unpacks into two tmpfs folders, `/run/secrets` and `/run/params`, before it replaces itself with the step;
 * the step's own standard input is then empty. The workflow's variables are plain settings, passed as `-e NAME`
 * with the value in the docker client's environment, as the agent containers' values are.
 */
import { composeProjectLabelArgs, labelKey, siteNamespace } from '../agents/runtime/containerLabels'
import type { WorkflowContainerLimits } from '@agenthix/core'
import { OUT_MOUNT, WORKFLOW_MOUNT } from './approvedFiles'

export const STEP_UID = 1001
export const SECRETS_MOUNT = '/run/secrets'
export const PARAMS_MOUNT = '/run/params'
const STEP_HOME = '/tmp/home'

export const runLabel = () => labelKey('workflow-run')

/** `<namespace>-workflow-<run>-<step>`: found again by its label, so the name only has to be unique. */
export function stepContainerName(runId: string, index: number): string {
  return `${siteNamespace()}-workflow-${runId}-${index}`
}

/**
 * What runs first in the container: unpack the values from standard input into the two tmpfs folders, close
 * standard input, make the home folders on `/tmp`, then become the step. The step's command is `$1`, an argument,
 * never pasted into this text.
 */
export const STEP_BOOTSTRAP = [
  'set -eu',
  'umask 077',
  `tar -x -o -f - -C /run || { echo "The site could not hand this step its values." >&2; exit 97; }`,
  'exec </dev/null',
  'mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$GH_CONFIG_DIR"',
  'exec bash --noprofile --norc -eo pipefail -c "$1"',
].join('\n')

export type StepContainerSpec = {
  runId: string
  index: number
  /** The image id to start, `sha256:…`. */
  image: string
  workflowDir: string
  outDir: string
  snapshotDir: string
  /** The agent's path to the workspace: where the snapshot is bound and the step starts. */
  workdir: string
  /** A step that holds a secret has the snapshot read-only. */
  readOnlyWorkspace: boolean
  limits: WorkflowContainerLimits
  networkArgs: string[]
  variables: Record<string, string>
  /** The run's repository, when hq connected one: every step gets its name and address, which no variable may set. */
  github: { repository: string; cloneUrl: string } | null
  command: string
}

export type StepRunCommand = { args: string[]; clientEnv: Record<string, string> }

export function buildStepRunCommand(s: StepContainerSpec): StepRunCommand {
  const tmpfs = (dir: string, size: string, extra = '') => ['--tmpfs', `${dir}:rw,noexec,nosuid,nodev,size=${size}${extra}`]
  const owned = `,mode=0700,uid=${STEP_UID},gid=${STEP_UID}`
  const env: Record<string, string> = {
    HOME: STEP_HOME,
    XDG_CONFIG_HOME: `${STEP_HOME}/.config`,
    GH_CONFIG_DIR: `${STEP_HOME}/.config/gh`,
    ...(s.github ? { GITHUB_REPOSITORY: s.github.repository, GITHUB_REPOSITORY_URL: s.github.cloneUrl } : {}),
  }
  const clientEnv: Record<string, string> = {}
  const envArgs: string[] = []
  for (const [k, v] of Object.entries(env)) envArgs.push('-e', `${k}=${v}`)
  for (const name of Object.keys(s.variables).sort()) {
    if (name in env) continue
    envArgs.push('-e', name)
    clientEnv[name] = s.variables[name]!
  }
  const args = [
    'run', '-i',
    '--name', stepContainerName(s.runId, s.index),
    '--label', `${runLabel()}=${s.runId}`,
    '--label', `${labelKey('workflow-step')}=${s.index}`,
    ...composeProjectLabelArgs('executor'),
    '--user', `${STEP_UID}:${STEP_UID}`,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    // /tmp may hold programs a build makes and runs (push-bundle's askpass among them), so it alone allows running
    // them; Docker mounts a tmpfs noexec unless told otherwise.
    '--tmpfs', `/tmp:rw,exec,nosuid,nodev,size=256m,mode=1777`,
    ...tmpfs(SECRETS_MOUNT, '64m', owned),
    ...tmpfs(PARAMS_MOUNT, '8m', owned),
    '-v', `${s.workflowDir}:${WORKFLOW_MOUNT}:ro`,
    '-v', `${s.outDir}:${OUT_MOUNT}:rw`,
    '-v', `${s.snapshotDir}:${s.workdir}:${s.readOnlyWorkspace ? 'ro' : 'rw'}`,
    '-w', s.workdir,
    '--memory', `${s.limits.memoryMb}m`,
    '--memory-swap', `${s.limits.memoryMb}m`,
    '--pids-limit', String(s.limits.processes),
    '--cpus', String(s.limits.cpus),
    // Docker keeps no copy of the output: it is read once, through the masker, and nowhere else.
    '--log-driver', 'none',
    '--restart', 'no',
    '--init',
    ...s.networkArgs,
    ...envArgs,
    s.image,
    'bash', '-c', STEP_BOOTSTRAP, 'step', s.command,
  ]
  return { args, clientEnv }
}

/**
 * The tar archive (POSIX ustar) a step's values travel in: `secrets/<NAME>` and `params/<name>`, each read-only to
 * the step's user, no folder entries, so unpacking never touches `/run` itself.
 */
export function valuesArchive(secrets: Record<string, Uint8Array>, params: Record<string, string>): Buffer {
  const parts: Buffer[] = []
  for (const [name, bytes] of Object.entries(secrets)) parts.push(...tarEntry('secrets', name, Buffer.from(bytes)))
  for (const [name, value] of Object.entries(params)) parts.push(...tarEntry('params', name, Buffer.from(value, 'utf8')))
  parts.push(Buffer.alloc(1024))
  return Buffer.concat(parts)
}

function tarEntry(prefix: string, name: string, body: Buffer): Buffer[] {
  if (!/^[A-Za-z0-9_]{1,100}$/.test(name)) throw new Error('A value name the archive cannot hold.')
  const h = Buffer.alloc(512)
  const put = (s: string, at: number, len: number) => h.write(s, at, len, 'ascii')
  const octal = (n: number, len: number) => n.toString(8).padStart(len - 1, '0') + '\0'
  put(name, 0, 100)
  put(octal(0o400, 8), 100, 8)
  put(octal(STEP_UID, 8), 108, 8)
  put(octal(STEP_UID, 8), 116, 8)
  put(octal(body.length, 12), 124, 12)
  put(octal(0, 12), 136, 12)
  put('        ', 148, 8)
  put('0', 156, 1)
  put('ustar\0', 257, 6)
  put('00', 263, 2)
  put(prefix, 345, 155)
  let sum = 0
  for (const b of h) sum += b
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8)
  const pad = (512 - (body.length % 512)) % 512
  return [h, body, Buffer.alloc(pad)]
}
