/**
 * A person starting an app from the live preview's strip (live preview spec section 4, *The app*), in any live
 * preview, `main`'s included. *Start* is offered for each app known on the workspace: the branch's own, and an app last
 * started on any other branch of it, with the folder, command and port it was last started with. Only a Member or
 * Admin of the project (or the owner of their own storage) starts one, through HQ, the same way an agent's `start_app`
 * does; the site checks its own record again. A Viewer reads the list and starts nothing.
 */
import { HttpError } from 'wasp/server'
import { SiteFailed, SiteSilent } from './siteAsk'
import { knownApps } from './knownApps'
import { startAppIn } from './appStart'
import { reachLivePreview } from './personActions'
import { NOTHING, siteSilent } from './words'

/** *Start* on the strip: the app of that name, as it was last started on the workspace. */
export async function startLiveApp(userId: string, livePreviewId: unknown, name: unknown): Promise<{ appId: string }> {
  const { row, site } = await reachLivePreview(userId, livePreviewId, 'work')
  if (row.state === 'PAUSED') throw new HttpError(409, `This live preview is paused. Resume it first. ${NOTHING}`)
  if (row.state !== 'RUNNING') throw new HttpError(409, `This live preview is not running. Start it again from Live preview. ${NOTHING}`)
  const wanted = typeof name === 'string' ? name.trim() : ''
  const known = wanted && wanted.length <= 64 ? (await knownApps(row)).find(a => a.name === wanted) : undefined
  if (!known) throw new HttpError(404, `No app called ${wanted.slice(0, 40) || 'that'} was started on this workspace yet. Ask the agent on a branch to start it with start_app. ${NOTHING}`)
  let started
  try {
    started = await startAppIn(
      { row, siteId: site.siteId, siteName: site.name, personId: userId },
      { name: known.name, folder: known.folder, command: known.command, port: known.port },
      null,
    )
  } catch (err) {
    if (err instanceof SiteSilent) throw siteSilent(site.name)
    if (err instanceof SiteFailed) throw new HttpError(502, `${site.name} cannot run apps; it may need upgrading. ${NOTHING}`)
    throw err
  }
  if (!started.ok) throw new HttpError(409, started.text)
  return { appId: started.app.id }
}
