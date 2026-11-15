/**
 * The Fleet Console beside HQ runs HQ's version: installed with it (`install/install.ts`), it is moved to the new
 * version once an upgrade of HQ has passed its health check. Its image is checked and fetched with HQ's, before
 * anything stops; a console that then fails to start on the new version is put back on its own, and the upgrade of
 * HQ stands. A Fleet Console on a machine of its own runs its host service's version instead: when the host service
 * starts on a newer one, the console follows (`followHostServiceVersion`).
 */
import type { Context } from '../service/context'
import { installed } from '../service/context'
import { consoleHere, startLocalConsole, writeAndStartConsole } from '../install/console'
import { checkImages, fetchImages, type ImagePins } from '../images/images'
import { isPublishedVersion } from '../images/published'
import { admissionNow } from '../remoteAccess/publish'
import { compare } from './versions'

/** Whether an upgrade of HQ on this machine takes the Fleet Console with it. */
export function consoleFollowsHq(ctx: Context): boolean {
  return consoleHere(ctx)?.settings.onHqMachine === true
}

/** Moves the Fleet Console beside HQ to `version`, or back to what it ran; says which, for the upgrade's log. */
export async function moveConsoleWithHq(ctx: Context, version: string, pins: ImagePins): Promise<string> {
  const here = consoleHere(ctx)
  const port = installed(ctx).hq?.port
  if (!here || port == null || !pins.console) return 'The Fleet Console was not moved: none runs beside HQ here.'
  try {
    await startLocalConsole(ctx, { port, version }, { console: pins.console })
    return `The Fleet Console runs ${version}.`
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    const was = here.settings
    await startLocalConsole(ctx, { port, version: was.version }, was.images ?? {}).catch(() => {})
    return `The Fleet Console could not be started on ${version} (${why}); it runs ${was.version} again.`
  }
}

/**
 * A Fleet Console on a machine of its own, moved to its host service's version when that is newer: run at the host
 * service's start. Null when there is nothing to move; otherwise what happened, for the log.
 */
export async function followHostServiceVersion(ctx: Context): Promise<string | null> {
  const here = consoleHere(ctx)
  const version = ctx.machine.hostServiceVersion
  if (!here || here.settings.onHqMachine || !isPublishedVersion(version) || !isPublishedVersion(here.settings.version)) return null
  if (compare(version, here.settings.version) <= 0) return null
  const was = here.settings
  try {
    const { pins } = await checkImages(ctx, [{ part: 'console', version }])
    await fetchImages(ctx, [pins.console!])
    await writeAndStartConsole(ctx, { ...was, version, images: { console: pins.console } }, admissionNow(ctx))
    return `The Fleet Console runs ${version}.`
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    await writeAndStartConsole(ctx, was, admissionNow(ctx)).catch(() => {})
    return `The Fleet Console stays on ${was.version}: ${why}`
  }
}
