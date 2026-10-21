/**
 * Holding the machine in tests, as a backup or a change does (`exclusive`), until the fake clock reaches a time:
 * what waits for it sleeps on the fake clock, and the sleep that reaches that time lets the holder finish first.
 */
import type { Context } from '../../service/context'
import { exclusive } from '../take'

export type Gate = { opened: Promise<void>; open: () => void }

export function gate(): Gate {
  let open!: () => void
  const opened = new Promise<void>(resolve => { open = resolve })
  return { opened, open }
}

/**
 * Opens `g` once a sleep brings the clock to `at`, and that sleep returns only once what held the machine is done
 * (`freed`); from then on, sleeps are the fake clock's own again.
 */
export function openAt(ctx: Context, at: Date, g: Gate, freed: Promise<unknown>): void {
  const sleep = ctx.sleep
  ctx.sleep = async ms => {
    await sleep(ms)
    if (ctx.now().getTime() < at.getTime()) return
    g.open()
    ctx.sleep = sleep
    await freed
  }
}

/** Holds the machine as `what` until `g` opens; resolves once it is free again. */
export const hold = (what: string, g: Gate): Promise<void> => exclusive(what, () => g.opened)

/** A nightly backup whose dump of the databases waits for `g`, so it holds the machine meanwhile. */
export function slowDump(ctx: Context, g: Gate): void {
  const dump = ctx.backupIO.dumpDatabase.bind(ctx.backupIO)
  ctx.backupIO.dumpDatabase = async function* (container, database) {
    await g.opened
    yield* dump(container, database)
  }
}
