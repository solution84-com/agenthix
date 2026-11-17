/**
 * The kernel's Landlock ABI, asked of the agent image's own launcher (core's `LANDLOCK_ABI_COMMAND`) from a throwaway
 * container of that image, before an install, a join or an upgrade starts anything: the ABI is the machine's kernel's,
 * so the answer holds for every agent the site would start. On Docker Desktop that kernel is its virtual machine's.
 *
 * The container is named, so one a deadline abandoned is removed by that name after the probe that failed; one left
 * by a host service stopped mid-probe makes the next probe fail on its name, which removes it for the one after. It
 * has no network and is never fetched: the image was checked and fetched just before.
 */
import { LANDLOCK_ABI_COMMAND, parseLandlockAbi } from '@agenthix/core'
import type { DockerRunner } from './docker'

const TIMEOUT_MS = 2 * 60_000

export function landlockArgs(image: string, name: string): string[] {
  return ['run', '--rm', '--name', name, '--pull', 'never', '--network', 'none', image, ...LANDLOCK_ABI_COMMAND]
}

/** The ABI the launcher printed, 0 when Landlock is missing; null when it could not be run or read. */
export async function probeLandlock(run: DockerRunner, image: string, name: string): Promise<number | null> {
  const r = await run(landlockArgs(image, name), { timeoutMs: TIMEOUT_MS })
  const abi = r.code === 0 ? parseLandlockAbi(r.stdout) : null
  if (abi === null) await run(['rm', '--force', name], { timeoutMs: 60_000 })
  return abi
}

/** What `docker info` says of the machine the containers run on: its system's name and its kernel. */
export type DockerSystem = { operatingSystem: string; kernel: string }

export const SYSTEM_ARGS = ['info', '--format', '{{.OperatingSystem}}\t{{.KernelVersion}}']

export async function dockerSystem(run: DockerRunner): Promise<DockerSystem | null> {
  const r = await run(SYSTEM_ARGS, { timeoutMs: 30_000 })
  if (r.code !== 0) return null
  const [operatingSystem = '', kernel = ''] = r.stdout.trim().split('\t')
  return { operatingSystem: operatingSystem.trim(), kernel: kernel.trim() }
}
