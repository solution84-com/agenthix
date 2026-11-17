/**
 * Whether this machine's kernel can contain an agent's commands (spec "Keeping
 * the gate whole", item 3): the launcher every command runs through needs
 * Landlock ABI 6 (Linux 6.12) to keep a command from signalling or tracing the
 * harness. On an older kernel the site runs no agent command at all.
 *
 * The ABI is the host kernel's, so one answer holds for every container and
 * for the life of the process. It is asked once at startup and again, from the
 * first container that needs it, if startup could not ask (no image yet, the
 * daemon not up). Until it is known to be enough, nothing is started: a failed
 * check refuses, it never assumes.
 */
import { LANDLOCK_ABI_COMMAND, LANDLOCK_REQUIRED_ABI, landlockAbiSufficient, parseLandlockAbi } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { dockerWithin } from './containerLifecycle'
import { siteIdLabelArgs, siteNamespace } from './containerLabels'
import { agentImageName } from './agentImage'

const logger = new Logger('landlockCheck')

const CHECK_TIMEOUT_MS = 30_000

let knownAbi: number | null = null

type Docker = (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>

function refusal(abi: number): Error {
  return new Error(
    `This machine's kernel cannot contain an agent's commands (Landlock ABI ${abi}; ` +
    `${LANDLOCK_REQUIRED_ABI} or later is needed, Linux 6.12), so no agent command is run.`,
  )
}

async function ask(args: string[], docker: Docker): Promise<number> {
  const { stdout } = await docker(args, CHECK_TIMEOUT_MS)
  const abi = parseLandlockAbi(stdout)
  if (abi === null) throw new Error(`The command launcher gave no Landlock ABI (${stdout.trim().slice(0, 80) || 'no output'})`)
  knownAbi = abi
  return abi
}

/**
 * At startup, from a throwaway container of the image. Logs its answer and never throws. The container has a name
 * of the install's namespace and the site's label, and is removed by that name before the check and after a failed
 * one, since a deadline abandons the command rather than stopping the container it started.
 */
export async function checkLandlockAtStartup(docker: Docker = dockerWithin): Promise<void> {
  const image = agentImageName()
  const name = `${siteNamespace()}-landlock-check`
  const remove = () => docker(['rm', '-f', name], CHECK_TIMEOUT_MS).catch(() => {})
  await remove()
  try {
    const abi = await ask(['run', '--rm', '--name', name, ...siteIdLabelArgs(), '--network', 'none', image, ...LANDLOCK_ABI_COMMAND], docker)
    if (landlockAbiSufficient(abi)) logger.info(`[landlock] kernel ABI ${abi}: agent commands can be contained`)
    else logger.error(`[landlock] ${refusal(abi).message}`)
  } catch (err) {
    await remove()
    logger.warn(`[landlock] could not ask the kernel's Landlock ABI at startup (${err instanceof Error ? err.message : String(err)}); asking again before the first agent command`)
  }
}

/** Throws unless agent commands can be contained on this machine; asks in `containerName` if not yet known. */
export async function requireLandlock(containerName: string, docker: Docker = dockerWithin): Promise<void> {
  const abi = knownAbi ?? await ask(['exec', containerName, ...LANDLOCK_ABI_COMMAND], docker)
  if (!landlockAbiSufficient(abi)) throw refusal(abi)
}

export function resetLandlockCheckForTests(): void {
  knownAbi = null
}
