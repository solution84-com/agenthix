/**
 * On HQ's machine, the host service connects to the Fleet Console beside it like any machine (spec §6, §7) — the same
 * join, the same pinning, the same signed envelopes — but with no fleet admin to give it a code or confirm it:
 * being on the machine is the proof. The host service asks the Fleet Console's own command line, through `docker exec`
 * into its container, for a join it confirms by itself for that one code; the code comes back on that command's
 * output, which only this machine sees. Then the join is the ordinary one: HQ is shown only the lookup, and the
 * Fleet Console is pinned only when its binding proves it holds the same code, so HQ cannot put itself in the middle.
 */
import { normalizeJoinCode } from '@agenthix/core'
import { installed, type Context } from '../service/context'
import { hostKeys } from '../identity/identity'
import { consoleHere, consoleHereSays, takeConsoleAway } from '../install/console'
import { joinConsole } from './join'
import { readPin, writePin } from './pin'
import { consoleRefusedForCloud } from './cloudController'
import { forgetRetiring, markRetired, retiringHere } from './handover'
import { dialWebSocket } from './socket'

/** Run inside the Fleet Console's container: opens a join it confirms by itself, and prints its code. */
export const LOCAL_JOIN_COMMAND = ['node', '/app/dist/cli.js', 'local-join']

/** A code from the Fleet Console beside HQ; null when it does not give one (not running, or not connected yet). */
export async function localJoinCode(ctx: Context): Promise<string | null> {
  const r = await ctx.docker.exec(ctx.names.consoleContainer, LOCAL_JOIN_COMMAND, '', 60_000).catch(() => null)
  if (!r || r.code !== 0) return null
  // One JSON line, `{"code":"…"}`.
  try {
    const answer = JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as { code?: unknown }
    return typeof answer.code === 'string' ? normalizeJoinCode(answer.code) : null
  } catch {
    return null
  }
}

/** Tries, until `timeoutMs` has passed, to connect this machine to the Fleet Console beside HQ. */
export async function joinLocalConsole(ctx: Context, timeoutMs: number, log: (line: string) => void = () => {}): Promise<boolean> {
  if (readPin(ctx.state)) return true
  // On Cloud's machines the Fleet Console beside hq claims nothing: Cloud is the machine's controller (spec B5).
  if (consoleRefusedForCloud(ctx.state)) return false
  const fleetConsole = consoleHere(ctx)
  if (!installed(ctx).hq || !fleetConsole?.settings.onHqMachine) return false
  const until = ctx.now().getTime() + timeoutMs
  for (;;) {
    const left = until - ctx.now().getTime()
    if (left <= 0) return false
    const code = await localJoinCode(ctx)
    if (code) {
      const outcome = await joinConsole({
        address: fleetConsole.settings.hqAddress, code, keys: await hostKeys(ctx.state), machineName: ctx.machine.name,
        dial: ctx.dial ?? dialWebSocket, now: ctx.now, timeoutMs: Math.min(left, 2 * 60_000),
      })
      if (outcome.ok) {
        if (consoleRefusedForCloud(ctx.state)) return false
        writePin(ctx.state, { ...outcome.pin, local: true })
        ctx.link?.start()
        return true
      }
      if (outcome.reason === 'badBinding') {
        log("The Fleet Console's answer through HQ did not prove it holds this machine's code; nothing was pinned.")
        return false
      }
    }
    await ctx.sleep(ctx.waits.pollMs)
  }
}

/** The key the Fleet Console running here holds, as it says itself; null while it does not answer. */
export async function consoleFingerprintHere(ctx: Context): Promise<string | null> {
  return (await consoleHereSays(ctx))?.fingerprint ?? null
}

/**
 * The Fleet Console that ran here handed its machines to one elsewhere, which this machine knows from the certificate
 * that Fleet Console signed (handover.ts): its container goes, and its keys with its volume, so it cannot come back
 * as a second Fleet Console. On HQ's machine the local pin proves the signer is the one here; on any other machine the
 * one here must say it holds the signer's key — a Fleet Console just installed here, which the machines followed,
 * holds another and stays. True when it removed it.
 */
export async function retireHandedOverConsole(ctx: Context, log: (line: string) => void = () => {}): Promise<boolean> {
  const place = retiringHere(ctx.state)
  if (!place) return false
  const here = consoleHere(ctx)
  if (!place.local) {
    // Not answering: asked again on the next round.
    const fingerprint = here ? await consoleFingerprintHere(ctx) : null
    if (here && !fingerprint) return false
    if (!fingerprint || !place.from.includes(fingerprint)) {
      forgetRetiring(ctx.state)
      return false
    }
  }
  if (here) await takeConsoleAway(ctx)
  markRetired(ctx.state, { machineName: place.machineName, at: place.at })
  log(`The Fleet Console that ran here is retired: it runs on ${place.machineName} now.`)
  return true
}

/**
 * Keeps trying in the background while HQ's machine is not connected to its Fleet Console, and, on any machine, removes
 * the Fleet Console here once it has handed over.
 */
export function keepLocalConsoleJoined(ctx: Context, everyMs: number, log: (line: string) => void): () => void {
  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      await retireHandedOverConsole(ctx, log).catch(err =>
        log(`The Fleet Console that ran here could not be removed yet: ${err instanceof Error ? err.message : String(err)}`))
      if (readPin(ctx.state)) return
      await joinLocalConsole(ctx, Math.max(1_000, everyMs - 10_000), log)
    } catch (err) {
      log(`This machine could not connect to its Fleet Console yet: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      busy = false
    }
  }
  const timer = setInterval(() => void tick(), everyMs)
  void tick()
  return () => clearInterval(timer)
}
