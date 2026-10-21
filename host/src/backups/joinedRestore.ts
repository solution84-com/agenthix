/**
 * The restore a machine admin starts with `restore --from <folder or file> <hq address> <code>` (adr-0119), in three
 * moments, all in this host service's memory and never written down, since the key is among them:
 *
 * 1. **Prepared**: the backup chosen and its key typed and checked (`restore.check` with the code), kept for a few
 *    minutes for the connect that follows, under that code only.
 * 2. **Armed**: the machine joined with that code, saying under its binding which backup it restores, and a fleet
 *    admin confirmed its fingerprint; it waits for the Fleet Console it now pins to ask for the restore.
 * 3. **Run**: that Fleet Console's signed `backup.restore` from `joined` restores the site (`siteRestore.ts`), and both
 *    the machine admin and the fleet admin follow its steps.
 *
 * The machine admin stopping the command before the run lets the restore go; nothing was written.
 */
import { normalizeJoinCode } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { cmd } from '../cli/words'
import { readPin } from '../link/pin'
import { restoreJoinedSite, type JoinedSource, type RestoredSite } from './siteRestore'

const PREPARED_FOR_MS = 10 * 60_000

type Prepared = JoinedSource & { code: string; until: number }

type Armed = {
  source: JoinedSource
  consoleFingerprint: string
  started: boolean
  progress: (p: Progress) => void
  settle: (outcome: { ok: true; restored: RestoredSite } | { ok: false; error: unknown }) => void
}

let prepared: Prepared | null = null
let armed: Armed | null = null

export function prepareJoinedRestore(ctx: Context, code: string, source: JoinedSource): void {
  const normal = normalizeJoinCode(code)
  if (!normal) throw new Refusal('malformed', 'That is not a code: a code is twelve letters and digits, as the Fleet Console shows it.')
  prepared = { ...source, code: normal, until: ctx.now().getTime() + PREPARED_FOR_MS }
}

/** The restore prepared for this code, once; null when there is none, or it is old. */
export function takePrepared(ctx: Context, code: string): JoinedSource | null {
  const p = prepared
  if (!p || p.code !== normalizeJoinCode(code)) return null
  prepared = null
  const { code: _code, until, ...source } = p
  return until > ctx.now().getTime() ? source : null
}

/**
 * After the join: waits for the pinned Fleet Console to ask for the restore, then follows it to the end. `startWithinMs`
 * bounds only the wait for the ask; `closed` (the machine admin's Ctrl-C) lets the restore go if it has not started.
 */
export function awaitJoinedRestore(
  source: JoinedSource, consoleFingerprint: string, progress: (p: Progress) => void, startWithinMs: number, closed?: AbortSignal,
): Promise<RestoredSite> {
  return new Promise<RestoredSite>((resolve, reject) => {
    const entry: Armed = {
      source, consoleFingerprint, started: false, progress,
      settle: outcome => {
        clearTimeout(timer)
        closed?.removeEventListener('abort', onAbort)
        if (armed === entry) armed = null
        if (outcome.ok) resolve(outcome.restored)
        else reject(outcome.error)
      },
    }
    const letGo = (message: string) => {
      if (!entry.started) entry.settle({ ok: false, error: new Refusal('failed', message) })
    }
    const onAbort = () => letGo('Stopped before the restore began. Nothing was restored.')
    const timer = setTimeout(() => letGo('The Fleet Console did not ask for the restore in time. Nothing was restored. Ask the fleet admin to look at the restore in the Fleet Console.'), startWithinMs)
    armed = entry
    if (closed?.aborted) onAbort()
    else closed?.addEventListener('abort', onAbort)
  })
}

/** The pinned Fleet Console's `backup.restore` from `joined`. */
export async function runJoinedRestore(ctx: Context, progress: (p: Progress) => void): Promise<RestoredSite> {
  const entry = armed
  const pin = readPin(ctx.state)
  if (!entry || entry.started || !pin || pin.consoleFingerprint !== entry.consoleFingerprint) {
    throw new Refusal('not_found', `No restore waits on ${ctx.machine.name}. On the machine, run: ${cmd('restore --from <folder or file> <hq address> <code>')}, with the code from Restore from a backup… in the Fleet Console.`)
  }
  entry.started = true
  const both = (p: Progress) => {
    progress(p)
    entry.progress(p)
  }
  try {
    const restored = await restoreJoinedSite(ctx, entry.source, pin, both)
    entry.settle({ ok: true, restored })
    return restored
  } catch (err) {
    entry.settle({ ok: false, error: err })
    throw err
  }
}
