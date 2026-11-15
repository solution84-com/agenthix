import { prisma } from '#db'
import {
  BRANCH_READ_METHODS,
  BRANCH_WORK_METHODS,
  CLAUDE_LOGIN_METHODS,
  FILE_ABOUT_METHOD,
  GIT_STATUS_METHOD,
  LOCATION_FILE_METHODS,
  MAIN_WORK_METHODS,
  MEMBERSHIP_METHODS,
  PACKAGE_METHODS,
  PREVIEW_METHODS,
  RELAY_ASSIGN_METHOD,
  REPO_WORK_METHODS,
  RUNTIME_METHODS,
  SITE_DATA_METHODS,
  SITE_PROTOCOL_VERSION,
  SITE_DIAGNOSTICS_METHODS,
  SITE_RESTORE_METHODS,
  SITE_HQ_ADDRESS_METHOD,
  WORKFLOW_RUN_METHODS,
  type JsonValue,
  type SiteDescribeResult,
  type SiteMethodName,
  type SiteMethodResult,
} from '@agenthix/core'
import * as workspaceRows from '../storage/workspaceRows'
import * as locationFiles from '../storage/locationFileMethods'
import { listArtefacts, listKnowledge } from '../storage/ownerFolderMethods'
import { findFiles } from '../storage/findFiles'
import { scanSkills } from '../storage/scanSkills'
import { removeSkillFolder } from '../storage/skillFolderWrite'
import {
  deleteKnowledge, editKnowledge, knowledgeVersions, restoreKnowledge, writeKnowledge,
} from '../knowledge/changeMethods'
import { searchKnowledge } from '../storage/knowledgeSearch'
import { removeLocation } from '../storage/locationRemove'
import * as repoWork from '../storage/repoWorkMethods'
import { previewGone } from './previewGone'
import * as runtimeMethods from './runtimeChannelMethods'
import * as dispatchHandler from '../runtime/dispatchHandler'
import * as membershipEnding from '../runtime/membershipEnding'
import * as packageMethods from '../../packages/packageMethods'
import * as diagnostics from './diagnosticsMethods'
import { restoreReport } from './restoreReport'
import { cancelLogin, finishLogin, startLogin } from '../login/claudeLogin'
import { addressFollower } from './addressFollow'
import * as executor from '../../executor/run'
import { readWorkflowFiles } from '../../executor/readFiles'
import { relayLines } from '../relay/relayLines'
import { fileAbout } from '../files/fileAbout'
import { gitStatus } from '../storage/gitStatusMethod'
import * as branchWork from '../branches/branchWorkMethods'
import * as branchReads from '../branches/branchReadMethods'
import * as mainWork from '../branches/mainWorkMethods'
import { livePreviewChannelMethods } from '../livePreviews/livePreviewChannel'

const startedAt = new Date()

export type ChannelMethod = (params: unknown) => Promise<unknown>

/**
 * What a handler may answer for a declared result. The answer crosses as JSON, so a `Date` goes as its ISO string
 * (what core declares), and a field core declares as arbitrary JSON is whatever the stored column holds.
 */
type Sent<T> = [JsonValue] extends [T] ? unknown
  : T extends string ? T | Date
  : T extends (infer U)[] ? Sent<U>[]
  : T extends object ? { [K in keyof T]: Sent<T[K]> }
  : T

/**
 * One handler per method of core's `SiteMethods`, answering that method's result: a method hq calls that this site
 * does not serve, or an answer of another shape, fails the typecheck. Params arrive off the wire unread, so each
 * handler checks its own.
 */
export type ChannelHandlers = { readonly [M in SiteMethodName]: (params: unknown) => Promise<Sent<SiteMethodResult<M>>> }

/**
 * What hq may ask this site over the control channel. Deliberately a closed
 * map: an unknown method is answered with an error, never guessed at, so the
 * surface a site exposes is exactly what is listed here.
 */
export const channelMethods: ChannelHandlers = {
  'site.describe': async (): Promise<SiteDescribeResult> => {
    const config = await prisma.siteConfig.findFirst()
    return {
      siteId: config?.siteId ?? '',
      protocolVersion: SITE_PROTOCOL_VERSION,
      startedAt: startedAt.toISOString(),
    }
  },

  // hq moves to a new address: the site follows once the address passes the move check (host-management spec §13).
  [SITE_HQ_ADDRESS_METHOD]: params => addressFollower.take(params),

  // Which relay this site holds a line to, and the pass that admits it (adr-0153): `../relay/relayLines.ts`.
  [RELAY_ASSIGN_METHOD]: params => relayLines.assign(params),

  // Workspace + RepoAttachment rows (plan 5c task 10) — thin wrappers over
  // workspaceRows.ts, which owns param validation and the actual queries.
  // Keyed off SITE_DATA_METHODS (core), the same constants hq's store
  // (hq/src/storage/workspaceStore.ts, plan 5c task 11) calls with — a typo
  // on either side fails to compile rather than silently mismatching at the wire.
  [SITE_DATA_METHODS.workspaceGet]: (params) => workspaceRows.getWorkspace(params),
  [SITE_DATA_METHODS.workspaceList]: (params) => workspaceRows.listWorkspaces(params),
  [SITE_DATA_METHODS.workspaceListByOwner]: (params) => workspaceRows.listWorkspacesByOwner(params),
  [SITE_DATA_METHODS.workspaceListByIds]: (params) => workspaceRows.listWorkspacesByIds(params),
  [SITE_DATA_METHODS.workspaceCreate]: (params) => workspaceRows.createWorkspace(params),
  [SITE_DATA_METHODS.workspaceSetAllowedTools]: (params) => workspaceRows.setWorkspaceAllowedTools(params),
  [SITE_DATA_METHODS.workspaceDelete]: (params) => workspaceRows.deleteWorkspace(params),

  [SITE_DATA_METHODS.repoGetForTarget]: (params) => workspaceRows.getRepoAttachmentForTarget(params),
  [SITE_DATA_METHODS.repoFindByUrl]: (params) => workspaceRows.findRepoAttachmentByUrl(params),
  [SITE_DATA_METHODS.repoList]: (params) => workspaceRows.listRepoAttachments(params),
  [SITE_DATA_METHODS.repoCreate]: (params) => workspaceRows.createRepoAttachment(params),
  [SITE_DATA_METHODS.repoDelete]: (params) => workspaceRows.deleteRepoAttachment(params),

  // Session/run/transcript/toolcall lifecycle and reads (plan 5d-2 task 4).
  // Keyed off RUNTIME_METHODS (core), same typo-safety reasoning as the
  // workspace/repo methods above.
  [RUNTIME_METHODS.sessionCreate]: (params) => runtimeMethods.sessionCreate(params),
  [RUNTIME_METHODS.sessionGet]: (params) => runtimeMethods.sessionGet(params),
  [RUNTIME_METHODS.sessionRename]: (params) => runtimeMethods.sessionRename(params),
  [RUNTIME_METHODS.sessionArchive]: (params) => runtimeMethods.sessionArchive(params),
  [RUNTIME_METHODS.sessionDelete]: (params) => runtimeMethods.sessionDelete(params),
  [RUNTIME_METHODS.sessionDeleteMany]: (params) => runtimeMethods.sessionDeleteMany(params),
  [RUNTIME_METHODS.sessionClearRuns]: (params) => runtimeMethods.sessionClearRuns(params),
  [RUNTIME_METHODS.runGet]: (params) => runtimeMethods.runGet(params),
  [RUNTIME_METHODS.runList]: (params) => runtimeMethods.runList(params),
  [RUNTIME_METHODS.runListPage]: (params) => runtimeMethods.runListPage(params),
  [RUNTIME_METHODS.runCount]: (params) => runtimeMethods.runCount(params),
  [RUNTIME_METHODS.runStats]: (params) => runtimeMethods.runStats(params),
  // The active-runs read (person-scoped execution spec §3) — ids, status and
  // times only, joined to the session's primary owner; see activeRunsRows.ts.
  [RUNTIME_METHODS.runListActive]: (params) => runtimeMethods.runListActive(params),
  // Usage summed on this site (core's runUsage.ts); see runUsageRows.ts.
  [RUNTIME_METHODS.runUsage]: (params) => runtimeMethods.runUsage(params),
  [RUNTIME_METHODS.transcriptList]: (params) => runtimeMethods.transcriptList(params),
  [RUNTIME_METHODS.toolCallList]: (params) => runtimeMethods.toolCallList(params),

  // Dispatch + control methods — the runtime itself. A `run.dispatch` frame
  // runs an agent on this site.
  [RUNTIME_METHODS.runDispatch]: (params) => dispatchHandler.handleRunDispatch(params),
  [RUNTIME_METHODS.runCancel]: (params) => dispatchHandler.handleRunCancel(params),
  [RUNTIME_METHODS.runApprove]: (params) => dispatchHandler.handleRunApprove(params),
  [RUNTIME_METHODS.runReject]: (params) => dispatchHandler.handleRunReject(params),
  [RUNTIME_METHODS.agentStop]: (params) => dispatchHandler.handleAgentStop(params),
  [RUNTIME_METHODS.agentRemoveDirectory]: (params) => dispatchHandler.handleAgentRemoveDirectory(params),
  [RUNTIME_METHODS.agentPromptPreview]: (params) => dispatchHandler.handleAgentPromptPreview(params),

  // A person's or a project's membership ended (person-scoped execution spec
  // §4): their runs, containers and harness homes here go and their
  // conversations close. Each answers with the acknowledgement hq holds the
  // instruction for, and is safe to receive twice.
  [MEMBERSHIP_METHODS.memberLeftProject]: (params) => membershipEnding.handleMemberLeftProject(params),
  [MEMBERSHIP_METHODS.personLeftOrganisation]: (params) => membershipEnding.handlePersonLeftOrganisation(params),
  [MEMBERSHIP_METHODS.projectDeleted]: (params) => membershipEnding.handleProjectDeleted(params),

  // Package delivery (Phase 5b): hq asks which versions a run needs that this site lacks.
  [PACKAGE_METHODS.missing]: (params) => packageMethods.handlePackagesMissing(params),

  // A location's own files. Metadata only — the bytes of a file cross the
  // content transport (LOCATION_FILE_METHODS.readFile is registered in
  // content/contentMethods.ts, deliberately not here). Every handler takes a
  // location and a path and no user id: hq checks entitlement before it asks,
  // and this site checks containment.
  [LOCATION_FILE_METHODS.listFiles]: (params) => locationFiles.listFiles(params),
  [LOCATION_FILE_METHODS.findFiles]: (params) => findFiles(params),
  [LOCATION_FILE_METHODS.scanSkills]: (params) => scanSkills(params),
  [LOCATION_FILE_METHODS.removeSkill]: (params) => removeSkillFolder(params),
  [LOCATION_FILE_METHODS.statFile]: (params) => locationFiles.statFile(params),
  [LOCATION_FILE_METHODS.seedFiles]: (params) => locationFiles.seedFiles(params),
  [LOCATION_FILE_METHODS.ensureDir]: (params) => locationFiles.ensureDir(params),
  [LOCATION_FILE_METHODS.removeLocation]: (params) => removeLocation(params),
  // An owner's artefacts and knowledge, addressed by the owner; their reads
  // stream on the content transport too.
  [LOCATION_FILE_METHODS.listArtefacts]: (params) => listArtefacts(params),
  [LOCATION_FILE_METHODS.listKnowledge]: (params) => listKnowledge(params),
  [LOCATION_FILE_METHODS.searchKnowledge]: (params) => searchKnowledge(params),
  // The gate and its history (site protocol 1.7, `../knowledge/changeMethods.ts`).
  [LOCATION_FILE_METHODS.writeKnowledge]: (params) => writeKnowledge(params),
  [LOCATION_FILE_METHODS.editKnowledge]: (params) => editKnowledge(params),
  [LOCATION_FILE_METHODS.deleteKnowledge]: (params) => deleteKnowledge(params),
  [LOCATION_FILE_METHODS.restoreKnowledge]: (params) => restoreKnowledge(params),
  [LOCATION_FILE_METHODS.knowledgeVersions]: (params) => knowledgeVersions(params),
  // What hq asks before it opens a file in any of this site's spaces: facts only, never bytes (site protocol 1.8).
  [FILE_ABOUT_METHOD]: (params) => fileAbout(params),

  // Repository work on a location. hq owns the GitHub side and the token; this
  // site owns the disk and therefore the git. Neither method carries file
  // bytes, so both are control methods — and `repo.connect` can run for as long
  // as a push takes, which is why hq gives it a budget of its own rather than
  // the channel's default timeout.
  [REPO_WORK_METHODS.connect]: (params) => repoWork.repoConnect(params),
  [REPO_WORK_METHODS.state]: (params) => repoWork.repoState(params),
  [GIT_STATUS_METHOD]: (params) => gitStatus(params),

  // Code work on branches (site protocol 1.12, `../branches/`): every Git command on a code workspace's repository
  // and its branches' copies runs in the commit helper, and every call naming a copy is checked against this site's
  // own record of it.
  [BRANCH_WORK_METHODS.create]: (params) => branchWork.branchCreate(params),
  [BRANCH_WORK_METHODS.copy]: (params) => branchWork.branchCopy(params),
  [BRANCH_WORK_METHODS.commit]: (params) => branchWork.branchCommit(params),
  [BRANCH_WORK_METHODS.bringBack]: (params) => branchWork.branchBringBack(params),
  [BRANCH_WORK_METHODS.updateFromMain]: (params) => branchWork.branchUpdateFromMain(params),
  [BRANCH_WORK_METHODS.rename]: (params) => branchWork.branchRename(params),
  [BRANCH_WORK_METHODS.delete]: (params) => branchWork.branchDelete(params),
  [BRANCH_WORK_METHODS.removeCopy]: (params) => branchWork.branchRemoveCopy(params),
  [BRANCH_READ_METHODS.list]: (params) => branchReads.branchList(params),
  [BRANCH_READ_METHODS.changes]: (params) => branchReads.branchChanges(params),
  [BRANCH_READ_METHODS.commits]: (params) => branchReads.branchCommits(params),
  [BRANCH_READ_METHODS.readFile]: (params) => branchReads.gitReadFile(params),
  [BRANCH_READ_METHODS.listTree]: (params) => branchReads.gitListTree(params),
  [BRANCH_READ_METHODS.versions]: (params) => branchReads.gitVersions(params),
  [BRANCH_READ_METHODS.versionChanges]: (params) => branchReads.gitVersionChanges(params),
  [MAIN_WORK_METHODS.init]: (params) => mainWork.gitInit(params),
  [MAIN_WORK_METHODS.merge]: (params) => mainWork.gitMerge(params),
  [MAIN_WORK_METHODS.restore]: (params) => mainWork.gitRestore(params),
  [MAIN_WORK_METHODS.pushMain]: (params) => mainWork.gitPushMain(params),
  [MAIN_WORK_METHODS.pullMain]: (params) => mainWork.gitPullMain(params),

  // Live previews (site protocol 1.12, `../livePreviews/`): the app's container binding one copy, its apps, the
  // guard, and branches carried between sites as bundles.
  ...livePreviewChannelMethods,

  // The old preview path, deprecated since 1.12 and answered as gone (`./previewGone.ts`).
  [PREVIEW_METHODS.start]: (params) => previewGone(params),
  [PREVIEW_METHODS.stop]: (params) => previewGone(params),

  // The logs and diagnostics page (adr-0106): a page of this site's own log,
  // and its health report taken now for Check again. Reads only.
  [SITE_DIAGNOSTICS_METHODS.readLogs]: (params) => diagnostics.readLogs(params),
  [SITE_DIAGNOSTICS_METHODS.healthNow]: () => diagnostics.healthNow(),
  [SITE_RESTORE_METHODS.report]: () => restoreReport(),

  // Sign in with Claude: a person adds a subscription on Anthropic's own page.
  // These need Docker and the agent image on THIS machine — the login runs in a
  // throwaway container of that image — and no person's storage, which is why
  // hq asks the default site rather than one tied to a boundary. `start` keeps
  // its process open so `finish` can hand the pasted code to the same one.
  [CLAUDE_LOGIN_METHODS.start]: () => startLogin(),
  [CLAUDE_LOGIN_METHODS.finish]: (params) => finishLogin(params),
  [CLAUDE_LOGIN_METHODS.cancel]: (params) => cancelLogin(params),

  // Workflows (adr-0147, adr-0148): the executor's run (executor/run.ts). `workflow.run` answers at once and the run
  // reports by `workflow.step` and `workflow.result` events; `workflow.readFiles` reads a proposal's files, refusing
  // any link.
  [WORKFLOW_RUN_METHODS.run]: (params) => executor.startRun(params),
  [WORKFLOW_RUN_METHODS.stop]: (params) => executor.stopRun(params),
  [WORKFLOW_RUN_METHODS.get]: (params) => executor.getRun(params),
  [WORKFLOW_RUN_METHODS.readFiles]: (params) => readWorkflowFiles(params),
}
