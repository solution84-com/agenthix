/**
 * Running the Fleet Console on another machine (host-management spec §7), the host service's two ends:
 *
 * - on HQ's machine, `hq console-code` asks the Fleet Console running here for a handover code, through its own
 *   command line inside its container (`docker exec`), as the local join does: the code reaches only this machine's
 *   command line, and HQ is given only its lookup. With no Fleet Console running here, HQ makes the code itself
 *   (`console-code` on its control socket), and the new Fleet Console starts with no machines.
 * - on the other machine, `console install` starts the new Fleet Console and asks it, the same way, whether it took
 *   the running one's place, and how many machines follow it so far.
 */
import type { Context } from '../service/context'
import { partState } from '../status/machineStatus'
import { consoleHere } from '../install/console'

export const HANDOVER_CODE_COMMAND = ['node', '/app/dist/cli.js', 'handover-code']
export const HANDOVER_STATUS_COMMAND = ['node', '/app/dist/cli.js', 'handover-status']

export type HandoverCode = { ok: true; code: string; expiresAt: string } | { ok: false; error: string }

/** Whether a Fleet Console runs on this machine now, so that it can hand over. */
export async function consoleRunningHere(ctx: Context): Promise<boolean> {
  const here = consoleHere(ctx)
  if (!here) return false
  return partState(await ctx.docker.composePs(here.project, here.file).catch(() => []), 1) === 'running'
}

function lastJsonLine(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text.trim().split('\n').pop() ?? '') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A handover code from the Fleet Console running here. */
export async function handoverCode(ctx: Context): Promise<HandoverCode> {
  const r = await ctx.docker.exec(ctx.names.consoleContainer, HANDOVER_CODE_COMMAND, '', 60_000).catch(() => null)
  if (!r) return { ok: false, error: 'The Fleet Console here did not answer.' }
  const out = lastJsonLine(r.stdout)
  if (r.code === 0 && typeof out?.code === 'string' && typeof out.expiresAt === 'string') return { ok: true, code: out.code, expiresAt: out.expiresAt }
  const err = lastJsonLine(r.stderr)
  return { ok: false, error: typeof err?.error === 'string' ? err.error : 'The Fleet Console here gave no code.' }
}

export type TakeoverStatus =
  | { state: 'waiting' | 'fresh' | 'none' }
  | { state: 'handedOver'; from: string; hosts: number; repinned: number }
  | { state: 'failed'; problem: string }

/** What the Fleet Console started here says of its takeover; null while it does not answer. */
export async function takeoverStatus(ctx: Context): Promise<TakeoverStatus | null> {
  const r = await ctx.docker.exec(ctx.names.consoleContainer, HANDOVER_STATUS_COMMAND, '', 30_000).catch(() => null)
  const v = r && r.code === 0 ? lastJsonLine(r.stdout) : null
  if (!v) return null
  switch (v.state) {
    case 'waiting': case 'fresh': case 'none':
      return { state: v.state }
    case 'handedOver':
      return typeof v.from === 'string' && typeof v.hosts === 'number' && typeof v.repinned === 'number'
        ? { state: 'handedOver', from: v.from, hosts: v.hosts, repinned: v.repinned }
        : null
    case 'failed':
      return { state: 'failed', problem: typeof v.problem === 'string' ? v.problem : 'The Fleet Console could not take over.' }
    default:
      return null
  }
}

/** Asks the new Fleet Console until `done` holds or the wait runs out; the last answer it gave, or null. */
export async function pollTakeover(
  ctx: Context, waitMs: number, done: (s: TakeoverStatus) => boolean,
): Promise<TakeoverStatus | null> {
  const until = ctx.now().getTime() + waitMs
  let last: TakeoverStatus | null = null
  for (;;) {
    last = (await takeoverStatus(ctx)) ?? last
    if ((last && done(last)) || ctx.now().getTime() >= until) return last
    await ctx.sleep(ctx.waits.pollMs)
  }
}

export const connectedOrEnded = (s: TakeoverStatus) => s.state !== 'waiting' && s.state !== 'none'
export const everyMachineFollows = (s: TakeoverStatus) => s.state !== 'handedOver' || s.repinned >= s.hosts
