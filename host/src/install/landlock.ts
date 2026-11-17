/**
 * No installation where agents cannot work: an agent's commands are contained by the agent image's launcher with the
 * kernel's Landlock, and on a kernel without the Landlock it needs the site runs no agent at all (core's `landlock`).
 * So `install`, `console connect`, the site a Fleet Console starts, and every upgrade ask the kernel through the agent
 * image of the version they would run — once it is checked and fetched, before anything is started, stopped or
 * written — and refuse below it, saying why and the fix. The site's own check before each run stays as the last line
 * of defence.
 */
import os from 'node:os'
import { landlockAbiSufficient } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import { installed, type Context } from '../service/context'
import { Refusal } from '../owner/results'
import { kernelRefusal, type KernelCheckFor } from '../cli/messages'
import { checkImages, fetchImages } from '../images/images'

export const KERNEL_STEP = "Checking this machine's kernel can keep agents' commands contained"

/** Refuses, changing nothing, unless agents' commands can be contained on this machine's kernel. */
export async function refuseWithoutLandlock(ctx: Context, agentImage: string, checkFor: KernelCheckFor): Promise<void> {
  const abi = await ctx.docker.landlockAbi(agentImage, ctx.names.container('landlock-check'))
  if (landlockAbiSufficient(abi)) return
  const system = await ctx.docker.system()
  throw new Refusal('failed', kernelRefusal({ for: checkFor, abi, kernel: system?.kernel || os.release(), system: system?.operatingSystem ?? '' }))
}

/** The same, as a step the CLI shows. */
export async function kernelStep(ctx: Context, progress: (p: Progress) => void, agentImage: string, checkFor: KernelCheckFor): Promise<void> {
  progress({ event: 'step', step: KERNEL_STEP })
  await refuseWithoutLandlock(ctx, agentImage, checkFor)
  progress({ event: 'stepDone', outcome: 'passes' })
}

/**
 * For a machine joining a Fleet Console, which has no site yet: the agent image of the version the site would be
 * started at, this host service's own, checked against its signature and fetched like any install's.
 */
export async function joiningAgentImage(ctx: Context): Promise<string> {
  const { pins } = await checkImages(ctx, [{ part: 'agent', version: ctx.machine.hostServiceVersion }])
  await fetchImages(ctx, [pins.agent!])
  return pins.agent!
}

/**
 * Before an upgrade moves the host service to a new version first: asked of the agent image the site runs now, since
 * the answer is the kernel's whichever image asks, so an old kernel is refused before the switch. With no agent image
 * installed, the upgrade's own check, after its fetch, is the one that refuses.
 */
export async function refuseBeforeHostMoves(ctx: Context): Promise<void> {
  const agent = installed(ctx).site?.settings.images?.agent
  if (agent) await refuseWithoutLandlock(ctx, agent, 'upgrade')
}
