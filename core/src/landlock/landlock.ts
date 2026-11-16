/**
 * Whether a kernel can contain an agent's commands. Every command an agent runs goes through the agent image's
 * launcher, which sandboxes it with Landlock; keeping a command from signalling or tracing the harness needs Landlock
 * ABI 6 (Linux 6.12). The site asks before each agent run, and the host service asks before it installs, joins a
 * machine or upgrades, so nothing is installed where agents cannot work.
 *
 * The ABI is the machine's kernel's, so one answer holds for every container on it.
 */

/** The launcher every agent command runs through, inside the agent image (`site/docker/agent.Dockerfile`). */
export const COMMAND_LAUNCHER_PATH = '/usr/local/lib/agenthix/bin/agenthix-contain'

/** The Landlock ABI the launcher requires (Linux 6.12): below it, signal scoping is missing. */
export const LANDLOCK_REQUIRED_ABI = 6

/** The first Linux release with `LANDLOCK_REQUIRED_ABI`, for the words that say what to install. */
export const LANDLOCK_REQUIRED_LINUX = '6.12'

/**
 * The command that asks the kernel's Landlock ABI, run in any container of the agent image (`docker exec <container> …`,
 * or `docker run --rm <image> …`). Its output is read with `parseLandlockAbi`.
 */
export const LANDLOCK_ABI_COMMAND: readonly string[] = [COMMAND_LAUNCHER_PATH, '--abi']

/** The ABI the launcher printed, 0 when Landlock is missing; null for anything else. */
export function parseLandlockAbi(stdout: string): number | null {
  const text = stdout.trim()
  return /^\d{1,4}$/.test(text) ? Number(text) : null
}

/** Whether commands can run contained on a kernel reporting this ABI. */
export function landlockAbiSufficient(abi: number | null): boolean {
  return abi !== null && abi >= LANDLOCK_REQUIRED_ABI
}
