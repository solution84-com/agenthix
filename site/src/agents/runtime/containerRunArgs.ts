/**
 * The `docker run` command a container is started with — its argv and the
 * environment the docker client is given.
 *
 * Split out of AgentContainerManager.ts's `_start` to keep that file under the
 * repo's 500-line convention. Moved verbatim and kept pure: it reads the run's
 * key, context and mounts and the container-limit environment, and touches no
 * disk and no docker. What must happen around it — creating the bind sources
 * before docker sees them, removing the old container, the network — stays in
 * `_start`, because that is the ordering and not the command.
 */
import { composeProjectLabelArgs, containerRunLabels } from './containerLabels'
import { harnessHomeBind, runnerSkillsStagingBind } from './boundaryClaudeHome'
import { resolveContainerLimits, type ContainerLimits } from './containerLimits'
import { openCodeConfigMountArgs } from './openCodeConfigMounts'
import { agentImageName } from './agentImage'
import type { AgentMounts, ContainerContext, ContainerKey } from './containerTypes'


export const WRITABLE_TMP = '/tmp:rw,nosuid,nodev,size=1g,mode=1777'
export const WRITABLE_COMMAND_HOME = '/home/agent:rw,nosuid,nodev,size=256m,uid=1001,gid=1001,mode=0700'

export type ContainerRunCommand = {
  args: string[]
  /** Values the docker client hands to the container by name — never on argv. */
  clientEnv: Record<string, string> | undefined
}

export function buildContainerRunCommand(
  key: ContainerKey,
  ctx: ContainerContext,
  containerName: string,
  mounts: AgentMounts,
  network: string,
  limits: ContainerLimits = resolveContainerLimits(),
): ContainerRunCommand {
  // Context labels — see containerRunLabels (containerLabels.ts) for the
  // ADR-0049/ADR-0057 rule they follow.
  const labelArgs = containerRunLabels(key, ctx)

  // The runner's harness home, bound whole at the image user's home directory
  // — keyed by boundary × runner, never by the agent (ADR-0074, spec §6.1,
  // §6.3). `ensureRunning` has already created it and written this run's
  // credential into its `.claude/`. Platform and org content does not mount
  // here either — it arrives as packages the site reads and stages per run
  // (spec §6.5), staged inside this directory so a run can reach them without
  // a directory of the agent's own.
  //
  // The staging folder inside it is bound again, read-only (R-050). Not part
  // of the mount signature: it is a pure function of the key, and the home
  // that is in the signature is a pure function of the same key.
  //
  // OpenCode's two configuration folders in the home are covered read-only
  // (openCodeConfigMounts.ts), in every container: the home is the agent's to
  // write, and OpenCode reads both whatever it is told.
  const sharedMountArgs: string[] = [
    '-v', harnessHomeBind(key),
    '-v', runnerSkillsStagingBind(key),
    ...openCodeConfigMountArgs(),
  ]

  // The boundary's one bind (ADR-0079): the owner's whole folder, at the same
  // id path inside the container with the site root removed (ADR-0074), in the
  // mode decided in containerPrep.ts (runHasWriteTools). Everything in it —
  // every workspace included — arrives with it.
  const locationMountArgs = ['-v', `${mounts.boundary.hostDir}:${mounts.boundary.containerDir}:${mounts.locationMode}`]

  // Sized for a container that serves a whole storage boundary rather than
  // one conversation — the host service's ceilings where one runs this site,
  // each with its own override and its own reason — see containerLimits.ts.
  const args = [
    'run', '-d',
    '--name', containerName,
    '--network', network,
    // Lets an agent reach the site the same way on Linux as it already
    // does on Docker Desktop, where host.docker.internal exists by default.
    '--add-host', 'host.docker.internal:host-gateway',
    ...composeProjectLabelArgs('agent'),
    ...labelArgs,
    ...sharedMountArgs,
    ...locationMountArgs,
    '--memory', limits.memory,
    '--pids-limit', limits.pidsLimit,
    '--cpus', limits.cpus,
    // ADR-0049: idle teardown is mandatory, not optional — a torn-down idle
    // container must stay down. `ensureRunning` (recreate-on-resume) is the
    // recovery path; the boot orphan sweep and the in-memory signature reset
    // (a fresh containerStates map) handle server restarts.
    '--restart', 'no',
    // The container stands between an injected agent and the machine, so it gets the executor's hardening
    // (workflows spec, running, *The containers* A). The process is uid 1001 and holds no capability; the launcher's
    // Landlock rules need none and set no_new_privs themselves. The root is read-only; what a harness or a command
    // writes lives in the harness home and the workspace (binds), in /tmp, and in /home/agent, the commands' own home
    // (agenthix-contain sets HOME to it), which the image creates 0700 for uid 1001 and a tmpfs recreates the same.
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--tmpfs', WRITABLE_TMP,
    '--tmpfs', WRITABLE_COMMAND_HOME,
    // Docker's own init as PID 1, so a process that ends is reaped. A
    // conversation's processes are killed repeatedly over the container's life
    // (conversationProcesses.ts); `tail` as PID 1 never reaps, and their zombies
    // would fill the process limit until nothing, `docker exec` included, starts.
    '--init',
    agentImageName(),
    'tail', '-f', '/dev/null',
  ]
  // No credential is in the container's own environment. An API key is the
  // `claude` process's, given on its own `docker exec` (claude/claudeStart.ts),
  // so the container's other processes never inherit it, and a later run with
  // another key is not served this container's. A subscription login is an
  // OAuth document in the harness home.
  return { args, clientEnv: undefined }
}
