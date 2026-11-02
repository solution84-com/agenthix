/**
 * A run on a branch's copy meeting a container started with other binds (live preview spec, *Where the copy lives*):
 * one started before a workspace of its storage became a Git repository still has that workspace's folder writable.
 * The run never joins it. It waits until the runs in it have ended, so it can be made again with the workspace
 * read-only, and the person is told why it has not started. While it waits the container is marked draining, so no
 * new run joins it either.
 */
import type { ContainerContext, ContainerState } from './containerTypes'
import { ReadableRunError } from './readableRunError'

export const BINDS_DRAIN_POLL_MS = 2_000

/** Whether a run must wait for the container to empty before it can use it. */
export function mustWaitForBinds(state: ContainerState | undefined, sig: string, ctx: ContainerContext): boolean {
  if (!state || state.mountSig === sig) return false
  return ctx.codeWork === true || state.draining === true
}

export async function waitForRunsToEnd(
  states: Map<string, ContainerState>, name: string, ctx: ContainerContext, pollMs: number = BINDS_DRAIN_POLL_MS,
): Promise<void> {
  const marked = states.get(name)
  if (marked) marked.draining = true
  ctx.onWaitForBinds?.(true)
  try {
    for (;;) {
      const now = states.get(name)
      if (!now || (now.activeRuns === 0 && !now.starting)) return
      if (ctx.stillWanted && !(await ctx.stillWanted())) {
        throw new ReadableRunError('The run was stopped while it waited for the project\'s other runs to finish. Nothing was changed.')
      }
      await new Promise(resolve => setTimeout(resolve, pollMs))
    }
  } finally {
    ctx.onWaitForBinds?.(false)
  }
}
