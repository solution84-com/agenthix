/**
 * `start_app` on a branch with no live preview open (live preview spec section 4, *Opening one*: "the agent may also
 * start one when it starts an app"): the live preview is opened first, as the run's person, through the same path a
 * person's *Live preview* takes (`startLivePreview`), so their role, the site's limits, a full site, Git and the copy
 * rules all apply, and its starter is that person. Only a run a person started opens one. It is opened on the site the run is on, where it shares the copy the
 * run works in. A refusal comes back in hq's words, and nothing is started.
 */
import { HttpError, prisma } from 'wasp/server'
import { parseRunStartedBy, type CapabilityClaims } from '@agenthix/core'
import { ControlPlaneError } from '../server/controlplane/types'
import { personOfRun } from '../server/controlplane/runOnBehalfOf'
import { branchOfSession } from '../branches/branchRows'

const NOTHING_STARTED = 'Nothing was started.'

export const NO_PERSON =
  `This run works for no person, so no live preview can be opened for its app. Ask a person to open Live preview in the workspace view, then try again. ${NOTHING_STARTED}`
export const NO_BRANCH =
  `This run works on no branch, so there is no live preview to start an app in. ${NOTHING_STARTED}`
export const NOT_ALLOWED =
  `The person this run works for can only view this project, so a live preview cannot be opened for them. A Member or Admin of the project can open it from Live preview in the workspace view. ${NOTHING_STARTED}`

export const NOT_A_PERSONS_RUN =
  `No person started this run, so it cannot open a live preview in anyone's name. Say in your result that the person can open Live preview in the workspace view to see the work. ${NOTHING_STARTED}`

/** Opens the live preview of the run's branch on the run's site, as the run's person; throws a refusal the agent reads. */
export async function openLivePreviewForRun(claims: Pick<CapabilityClaims, 'sessionId' | 'siteId' | 'taskId' | 'userId' | 'onBehalfOfUserId' | 'startedBy'>): Promise<void> {
  // A run the pulse, a schedule or another agent started answers no person's ask for the app (W7 of the live preview walk).
  if (parseRunStartedBy(claims.startedBy) !== 'person') throw new ControlPlaneError('forbidden', NOT_A_PERSONS_RUN)
  const person = await personOfRun(claims as CapabilityClaims)
  if (!person) throw new ControlPlaneError('forbidden', NO_PERSON)
  const branch = await branchOfSession(claims.sessionId)
  if (!branch) throw new ControlPlaneError('invalid', NO_BRANCH)
  const site = await prisma.executionSite.findFirst({ where: { siteId: claims.siteId, status: { not: 'REVOKED' } }, select: { id: true } })
  if (!site) throw new ControlPlaneError('unavailable', `This run's site is not one HQ knows any more. ${NOTHING_STARTED}`)
  // Loaded at the call: opening pulls in the bundle and relay modules, which the app tools need only here.
  const { startLivePreview } = await import('./opening')
  try {
    await startLivePreview(person, { workspaceId: branch.workspaceId, branchId: branch.id, executionSiteId: site.id })
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.statusCode === 401 || err.statusCode === 403) throw new ControlPlaneError('forbidden', NOT_ALLOWED)
      throw new ControlPlaneError('conflict', withNothingStarted(err.message))
    }
    throw err
  }
}

/** hq's sentence for why the opening was refused, ending with what was left as it was. */
function withNothingStarted(message: string): string {
  const said = message.trim()
  return /Nothing was (changed|started)\.$/.test(said) ? said.replace(/Nothing was changed\.$/, NOTHING_STARTED) : `${said} ${NOTHING_STARTED}`
}
