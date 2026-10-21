/**
 * Reaching the process groups this site has started, and knowing they have
 * gone.
 *
 * Split out of `./gitRunner.ts`, which was carrying two concerns — running one
 * command under a budget, and the lifetime of every process that command
 * spawns. This is the second.
 *
 * ## Why there is a group at all
 *
 * `git fetch` over HTTPS runs `git remote-http`, which runs `git-remote-http`,
 * and it is the last of those that sits on a stalled connection. Killing the
 * leader leaves both helpers holding the socket. So the runner spawns git
 * `detached`, giving it a process group of its own, and everything here acts
 * on the GROUP.
 *
 * ## Why that needs a registry
 *
 * The same flag cuts git out of the site's own process group, so a signal to
 * the site no longer reaches it. Ctrl-C on `npm run dev` sends SIGINT to the
 * whole foreground group: without `detached` that reached git, and with it
 * git reparents to init and runs on — with the deadline timer that would have
 * stopped it gone along with the process that armed it.
 *
 * Measured, against a fetch from a server that never answers: ALL THREE
 * processes survive — the `git fetch` leader as well as `git remote-http` and
 * `git-remote-http` — reparented to init and still holding the connection.
 * The leader does NOT exit when its parent goes; an earlier note here said it
 * did, and it was counting with a filter that missed it.
 *
 * So the site has to reach them itself. Every live group is registered here,
 * and the site's own shutdown walks the registry.
 *
 * ## Why the shutdown path is synchronous, and why it is SIGKILL
 *
 * A signal handler has no time it can rely on — another listener may call
 * `process.exit()` in the same tick — so there is nothing to await in.
 *
 * `SIGKILL` has a real, and understated, cost. git writes objects to a temp
 * file and renames, so the object store survives; but a kill during
 * `git add`/`commit` leaves `.git/index.lock` behind, and **every later
 * `repo.connect` on that location then fails permanently**. It fails as
 * `git_failed`/502, with git's reason only in this site's log and the remedy —
 * deleting one file — only reachable by someone with access to this machine.
 * The person who hits it is told the site failed and is given nothing to act
 * on, and retrying never clears it. Nothing here removes a stale lock, and
 * nothing surfaces it; that is a known limit of this change, not a case it
 * handles.
 *
 * It is still the right trade against the alternative, which is an orphan
 * writing into that same location unbounded, with no deadline left to stop it
 * and nothing recording that it is there.
 *
 * What none of this can cover is the site being SIGKILLed itself, which no
 * handler can. Closing that needs the child to die with its parent —
 * `PR_SET_PDEATHSIG` on Linux — which node cannot ask for without a native
 * addon. A real residual hole, named rather than implied to be closed.
 */

/**
 * How long a terminated group is given to go quietly before it is killed.
 * git exits on SIGTERM promptly; the grace is for the child that is mid-write.
 */
const TERM_GRACE_MS = 2_000
/** How long, and how often, the kernel is asked whether the group has gone. */
const REAP_POLL_MS = 50
const REAP_WAIT_MS = 3_000

/** The one place this module waits, and it never holds the process open. */
export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms).unref?.())

/**
 * Is any process still in this group?
 *
 * Signal 0 performs the permission and existence check without delivering
 * anything. `ESRCH` is the answer this module is looking for: no such group.
 * `EPERM` means something is there and is not ours to signal, which is NOT a
 * death and must not be read as one.
 */
export function groupIsGone(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return false
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal)
  } catch {
    // Already gone, or never ours — `groupIsGone` is what decides, not this.
  }
}

/**
 * The process groups this site has started and has not yet seen end.
 *
 * Its only purpose is the shutdown path: `detached` means a signal to the site
 * no longer reaches these, so the site has to reach them itself.
 */
const liveGroups = new Set<number>()

/** Exported for its own test — "the registry empties" is a property, not a reading of the code. */
export function liveGitProcessGroups(): number[] {
  return [...liveGroups]
}

export function registerGroup(pgid: number): void {
  liveGroups.add(pgid)
}

/**
 * Off the registry the moment the command ends, however it ended. A stale pgid
 * would have the shutdown path signalling a number the kernel may since have
 * given to something else.
 */
export function forgetGroup(pgid: number): void {
  liveGroups.delete(pgid)
}

/**
 * Kill every group this site started, now, without waiting for anything.
 *
 * Synchronous and `SIGKILL` on purpose: this runs from a signal handler and
 * from `exit`, where there is no tick to await in and another listener may end
 * the process at any moment. A graceful `SIGTERM` that is never followed up is
 * the abandonment this whole module is about.
 *
 * Exported so the shutdown path can be driven directly, rather than only by
 * raising a real signal at a real process.
 */
export function stopLiveGitGroupsSync(): number {
  let stopped = 0
  for (const pgid of liveGroups) {
    try {
      process.kill(-pgid, 'SIGKILL')
      stopped += 1
    } catch {
      // Already gone. The registry is cleared either way.
    }
  }
  liveGroups.clear()
  return stopped
}

/**
 * Every signal that ends this process in practice.
 *
 * `SIGUSR2` is `nodemon`'s restart signal, sent on every file save under the
 * dev server the site used to run under; `npm run dev` (tsx watch) sends
 * `SIGTERM` instead. Kept for anyone running the site under nodemon: left out,
 * it was the one signal that still orphaned git — three survivors per save,
 * against zero for `SIGINT` and `SIGTERM`.
 */
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGUSR2']
let handlersInstalled = false

/**
 * Installed on the first spawn rather than at import, so a module that merely
 * imports this one does not acquire signal handlers it has no use for.
 *
 * ## The two halves of the handler, and why it is PREPENDED
 *
 * Each handler kills the registry, removes itself, and then re-raises the
 * signal ONLY if nothing else is listening. The re-raise is not optional:
 * adding a listener suppresses node's default action, so without it a site
 * with no other handler would stop dying on Ctrl-C — trading one bug for a
 * worse one. And when a peer does exist, this same delivery has already
 * reached it, so re-raising would run it twice.
 *
 * `prependListener`, not `on`, is what makes that test correct in the presence
 * of a `once` peer. A `once` listener removes itself at the moment it is
 * INVOKED, so a handler running after one sees a listener count of zero,
 * concludes it is alone, and re-raises — killing the process out from under a
 * graceful shutdown that had just begun. Running first means every peer,
 * `once` or not, is still registered when the count is taken.
 *
 * The residual, stated rather than left to be discovered: a peer that installs
 * itself with `prependOnceListener` AFTER this module would run before this
 * handler and be dequeued before the count, and would be cut off the same way.
 * Nothing in this site or its dependencies does that today.
 */
export function installShutdownHandlers(): void {
  if (handlersInstalled) return
  handlersInstalled = true
  for (const signal of SHUTDOWN_SIGNALS) {
    const handler = () => {
      stopLiveGitGroupsSync()
      process.removeListener(signal, handler)
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
    }
    process.prependListener(signal, handler)
  }
  // Belt and braces for the paths no signal announces: a plain `process.exit`,
  // or an uncaught exception unwinding the process.
  process.on('exit', () => void stopLiveGitGroupsSync())
}

/**
 * Terminate, then kill, then keep asking until the kernel says the group has
 * gone. Answers whether it ever did.
 */
export async function stopGroup(pgid: number, exited: Promise<void>): Promise<boolean> {
  signalGroup(pgid, 'SIGTERM')
  await Promise.race([exited, wait(TERM_GRACE_MS)])
  if (!groupIsGone(pgid)) signalGroup(pgid, 'SIGKILL')
  for (let waited = 0; waited < REAP_WAIT_MS; waited += REAP_POLL_MS) {
    if (groupIsGone(pgid)) return true
    await wait(REAP_POLL_MS)
  }
  return groupIsGone(pgid)
}
