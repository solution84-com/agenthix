/**
 * The site connection's messages, each with its shape: every method hq calls on a site's control channel with its
 * params and result (`SiteMethods`), every stream it opens on the content transport with its params
 * (`SiteContentMethods`), and every event a site sends (`SiteEvents`). hq's callers and the site's handlers are typed
 * against these maps, so a method one side sends and the other does not serve, or a shape the two read differently,
 * fails the typecheck rather than the wire. The snapshot (core/snapshot/site.json) records them.
 *
 * The site's own requests of hq are not channel methods: a run's tools reach hq's data API (`HQ_DATA_PATH`,
 * `HqDataRequest`), its capability is renewed over HTTP (`HQ_CAPABILITY_RENEW_PATH`, `CapabilityRenewRequest`), and
 * its model relay reports usage (`HQ_USAGE_REPORT_PATH`) and asks for hq's Cloud access token
 * (`HQ_CLOUD_AI_TOKEN_PATH`) the same way.
 */
import type { SiteDescribeResult } from './channelMessages.js'
import { SITE_DATA_METHODS } from './siteData.js'
import type {
  RepoAttachmentGitHubIds, RepoAttachmentRow, RepoAttachmentSummaryRow, RepoAttachmentTarget, WorkspaceCapsRow, WorkspaceListByOwnerSelect,
  WorkspaceNameRow, WorkspaceOwnerType, WorkspaceRow,
} from './siteData.js'
import { RUNTIME_METHODS } from './runtimeData.js'
import type { AgentPromptPreviewResult, RunCancelParams, RunDispatchPayload, RunDispatchResult, RunRow, SessionRow, SessionSeed } from './runtimeData.js'
import type {
  AgentHandleParams, AgentPromptPreviewParams, ApprovedResult, ByIdParams, ByRunIdParams, CountResult, DeletedCountResult,
  DeletedResult, OkResult, RemovedResult, RunApproveParams, RunRejectParams, SessionDeleteManyParams, SessionRenameParams,
  UpdatedResult,
} from './runtimeParams.js'
import type { RunListFilter, RunListPageParams, RunListPageResult, RunStatsResult } from './runList.js'
import type { ActiveRunsParams, ActiveRunsResult } from './activeRuns.js'
import type { RunUsageParams, RunUsageResult } from './runUsage.js'
import type { ToolCallRow, TranscriptListParams, TranscriptRow } from './transcript.js'
import { MEMBERSHIP_METHODS } from './membership.js'
import type { MemberLeftProjectParams, MembershipAck, PersonLeftOrganisationParams, ProjectDeletedParams } from './membership.js'
import { PACKAGE_METHODS } from './packages.js'
import type { PackageRef, PackagesMissingParams, PackagesMissingResult } from './packages.js'
import { LOCATION_FILE_METHODS } from './locationFiles.js'
import type {
  LocationEnsureDirParams, LocationEnsureDirResult, LocationListArtefactsParams, LocationListArtefactsResult,
  LocationListFilesParams, LocationListFilesResult, LocationListKnowledgeParams, LocationListKnowledgeResult,
  LocationReadArtefactParams, LocationReadFileParams, LocationReadKnowledgeParams, LocationRemoveParams,
  LocationRemoveResult, LocationSearchKnowledgeParams, LocationSearchKnowledgeResult, LocationSeedFilesParams,
  LocationSeedFilesResult, LocationStatFileParams, LocationStatFileResult,
  KnowledgeChangeResult, LocationDeleteKnowledgeParams, LocationEditKnowledgeParams, LocationKnowledgeVersionsParams,
  LocationKnowledgeVersionsResult, LocationRestoreKnowledgeParams, LocationWriteKnowledgeParams,
  LocationFindFilesParams, LocationFindFilesResult, LocationScanSkillsParams, LocationScanSkillsResult,
  LocationRemoveSkillParams, LocationRemoveSkillResult, LocationWriteSkillParams,
} from './locationFiles.js'
import { REPO_WORK_METHODS } from './repoWork.js'
import type { RepoConnectParams, RepoConnectResult, RepoStateParams, RepoStateResult } from './repoWork.js'
import { PREVIEW_METHODS } from './preview.js'
import type { PreviewConnectParams, PreviewStartParams, PreviewStartResult, PreviewStopParams, PreviewStopResult } from './preview.js'
import { SITE_DIAGNOSTICS_METHODS } from './siteDiagnostics.js'
import type { SiteReadLogsParams, SiteReadLogsResult } from './siteDiagnostics.js'
import { SITE_RESTORE_METHODS } from './siteRestore.js'
import type { SiteRestoreReport } from './siteRestore.js'
import { SITE_HQ_ADDRESS_METHOD } from './hqAddress.js'
import type { SiteHqAddressParams, SiteHqAddressResult } from './hqAddress.js'
import { FILES_SERVE_METHOD, RELAY_ASSIGN_METHOD } from './relayFiles.js'
import { FILE_ABOUT_METHOD } from './fileAbout.js'
import type { FileAboutParams, FileAboutResult } from './fileAbout.js'
import { GIT_STATUS_METHOD } from './gitStatus.js'
import type { GitStatusParams, GitStatusResult } from './gitStatus.js'
import type { FilesServeParams, RelayAssignParams, RelayAssignResult } from './relayFiles.js'
import { BRANCH_WORK_METHODS } from './branchWork.js'
import type {
  BranchBringBackParams, BranchBackResult, BranchUpdateFromMainParams, BranchUpdateFromMainResult, BranchCommitParams, BranchCommitResult, BranchCopyParams, BranchCopyResult,
  BranchCreateParams, BranchDeleteParams, BranchDeleteResult, BranchRemoveCopyParams, BranchRemoveCopyResult,
  BranchRenameParams, BranchRenameResult,
} from './branchWork.js'
import { BRANCH_READ_METHODS } from './branchReads.js'
import type {
  BranchChangesParams, BranchChangesResult, BranchCommitsParams, BranchCommitsResult, BranchListParams,
  BranchListResult, GitReadFileParams, GitReadFileResult, GitVersionsParams, GitVersionsResult, GitListTreeParams, GitListTreeResult, GitVersionChangesParams,
} from './branchReads.js'
import { MAIN_WORK_METHODS } from './mainWork.js'
import type {
  GitInitParams, GitInitResult, GitMergeParams, GitMergeResult, GitPullMainParams, GitPullMainResult,
  GitPushMainParams, GitPushMainResult, GitRestoreParams, GitRestoreResult,
} from './mainWork.js'
import { CLAUDE_LOGIN_METHODS } from './claudeLogin.js'
import type {
  ClaudeLoginCancelParams, ClaudeLoginCancelResult, ClaudeLoginFinishParams, ClaudeLoginFinishResult,
  ClaudeLoginStartParams, ClaudeLoginStartResult,
} from './claudeLogin.js'
import type { SiteHealth } from './siteHealth.js'
import { LIVE_PREVIEW_METHODS, SITE_LIVE_PREVIEWS_METHOD } from './livePreviews.js'
import type {
  LivePreviewActParams, LivePreviewActResult, LivePreviewAnswer, LivePreviewCommitParams, LivePreviewCommitResult,
  LivePreviewListResult, LivePreviewOpenParams, LivePreviewRefreshParams, LivePreviewRefreshResult, LivePreviewResult,
  LivePreviewResumeParams, LivePreviewStopParams, LivePreviewStopResult, SiteLivePreviewsParams, SiteLivePreviewsResult,
} from './livePreviews.js'
import { LIVE_PREVIEW_APP_METHODS } from './livePreviewApps.js'
import type {
  LivePreviewAppListParams, LivePreviewAppListResult, LivePreviewAppStartParams, LivePreviewAppStartResult,
  LivePreviewAppStopParams, LivePreviewAppStopResult,
} from './livePreviewApps.js'
import { BRANCH_BRING_BACK_BUNDLE_METHOD, BUNDLE_METHODS } from './branchBundles.js'
import type {
  BranchBringBackBundleParams, BranchBringBackBundleResult, BundleDropParams, BundleDropResult, BundleMakeParams,
  BundleMakeResult, BundleReadParams, BundleWriteParams,
} from './branchBundles.js'
import { APP_SERVE_METHOD } from './appStream.js'
import { BRANCH_PACKAGE_USE_METHOD } from './branchPackages.js'
import type { BranchPackageUseParams, BranchPackageUseResult } from './branchPackages.js'
import type { AppServeParams } from './appStream.js'
import { WORKFLOW_RUN_METHODS } from './workflowRuns.js'
import type {
  WorkflowGetParams, WorkflowReadFilesParams, WorkflowReadFilesResult, WorkflowRunAcceptance, WorkflowRunInstruction,
  WorkflowRunReport, WorkflowStopParams, WorkflowStopResult,
} from './workflowRuns.js'

/** A method that takes nothing: hq sends `{}`. */
type NoParams = Record<string, never>

/** hq → site on the control channel: each method's params and its result. */
export type SiteMethods = {
  'site.describe': { params: NoParams; result: SiteDescribeResult }
  [SITE_HQ_ADDRESS_METHOD]: { params: SiteHqAddressParams; result: SiteHqAddressResult }
  [RELAY_ASSIGN_METHOD]: { params: RelayAssignParams; result: RelayAssignResult }
  /** Before hq opens a file: its facts, never its content. */
  [FILE_ABOUT_METHOD]: { params: FileAboutParams; result: FileAboutResult }

  [SITE_DATA_METHODS.workspaceGet]: { params: ByIdParams; result: WorkspaceRow | null }
  /** Ordered by creation, oldest first. */
  [SITE_DATA_METHODS.workspaceList]: { params: NoParams; result: WorkspaceRow[] }
  /** The rows' shape follows `select`: whole rows without it, `WorkspaceCapsRow`s for `caps`, `WorkspaceNameRow`s for `names`. */
  [SITE_DATA_METHODS.workspaceListByOwner]: {
    params: { ownerType: WorkspaceOwnerType; ownerId: string; select?: WorkspaceListByOwnerSelect }
    result: WorkspaceRow[] | WorkspaceCapsRow[] | WorkspaceNameRow[]
  }
  [SITE_DATA_METHODS.workspaceListByIds]: { params: { ids: string[]; select: 'caps' }; result: WorkspaceCapsRow[] }
  [SITE_DATA_METHODS.workspaceCreate]: { params: { name: string; ownerType: WorkspaceOwnerType; ownerId: string }; result: WorkspaceRow }
  [SITE_DATA_METHODS.workspaceSetAllowedTools]: { params: { id: string; allowedTools: string[] | null }; result: OkResult }
  [SITE_DATA_METHODS.workspaceDelete]: { params: ByIdParams; result: OkResult }
  [SITE_DATA_METHODS.repoGetForTarget]: { params: RepoAttachmentTarget; result: RepoAttachmentRow | null }
  [SITE_DATA_METHODS.repoFindByUrl]: { params: { repoUrl: string }; result: RepoAttachmentRow | null }
  [SITE_DATA_METHODS.repoList]: { params: NoParams; result: RepoAttachmentSummaryRow[] }
  [SITE_DATA_METHODS.repoCreate]: {
    params: { ownerType: WorkspaceOwnerType; ownerId: string; workspaceId: string | null; repoUrl: string } & Partial<RepoAttachmentGitHubIds>
    result: RepoAttachmentRow
  }
  [SITE_DATA_METHODS.repoDelete]: { params: ByIdParams; result: OkResult }

  [RUNTIME_METHODS.sessionCreate]: { params: SessionSeed; result: OkResult }
  [RUNTIME_METHODS.sessionGet]: { params: ByIdParams; result: SessionRow | null }
  [RUNTIME_METHODS.sessionRename]: { params: SessionRenameParams; result: UpdatedResult }
  [RUNTIME_METHODS.sessionArchive]: { params: ByIdParams; result: UpdatedResult }
  [RUNTIME_METHODS.sessionDelete]: { params: ByIdParams; result: DeletedResult }
  [RUNTIME_METHODS.sessionDeleteMany]: { params: SessionDeleteManyParams; result: DeletedCountResult }
  [RUNTIME_METHODS.sessionClearRuns]: { params: ByIdParams; result: DeletedCountResult }
  [RUNTIME_METHODS.runGet]: { params: ByIdParams; result: RunRow | null }
  [RUNTIME_METHODS.runList]: { params: RunListFilter; result: RunRow[] }
  [RUNTIME_METHODS.runListPage]: { params: RunListPageParams; result: RunListPageResult }
  /** `limit` is accepted and ignored, so one `RunListFilter` serves `run.list` and this. */
  [RUNTIME_METHODS.runCount]: { params: RunListFilter; result: CountResult }
  [RUNTIME_METHODS.runStats]: { params: NoParams; result: RunStatsResult }
  [RUNTIME_METHODS.runListActive]: { params: ActiveRunsParams; result: ActiveRunsResult }
  [RUNTIME_METHODS.runUsage]: { params: RunUsageParams; result: RunUsageResult }
  [RUNTIME_METHODS.transcriptList]: { params: TranscriptListParams; result: TranscriptRow[] }
  [RUNTIME_METHODS.toolCallList]: { params: ByRunIdParams; result: ToolCallRow[] }
  [RUNTIME_METHODS.runDispatch]: { params: RunDispatchPayload; result: RunDispatchResult }
  [RUNTIME_METHODS.runCancel]: { params: RunCancelParams; result: OkResult }
  [RUNTIME_METHODS.runApprove]: { params: RunApproveParams; result: ApprovedResult }
  [RUNTIME_METHODS.runReject]: { params: RunRejectParams; result: OkResult }
  [RUNTIME_METHODS.agentStop]: { params: AgentHandleParams; result: OkResult }
  [RUNTIME_METHODS.agentRemoveDirectory]: { params: AgentHandleParams; result: RemovedResult }
  [RUNTIME_METHODS.agentPromptPreview]: { params: AgentPromptPreviewParams; result: AgentPromptPreviewResult }

  [MEMBERSHIP_METHODS.memberLeftProject]: { params: MemberLeftProjectParams; result: MembershipAck }
  [MEMBERSHIP_METHODS.personLeftOrganisation]: { params: PersonLeftOrganisationParams; result: MembershipAck }
  [MEMBERSHIP_METHODS.projectDeleted]: { params: ProjectDeletedParams; result: MembershipAck }

  [PACKAGE_METHODS.missing]: { params: PackagesMissingParams; result: PackagesMissingResult }

  [LOCATION_FILE_METHODS.listFiles]: { params: LocationListFilesParams; result: LocationListFilesResult }
  [LOCATION_FILE_METHODS.findFiles]: { params: LocationFindFilesParams; result: LocationFindFilesResult }
  [LOCATION_FILE_METHODS.scanSkills]: { params: LocationScanSkillsParams; result: LocationScanSkillsResult }
  [LOCATION_FILE_METHODS.removeSkill]: { params: LocationRemoveSkillParams; result: LocationRemoveSkillResult }
  [LOCATION_FILE_METHODS.statFile]: { params: LocationStatFileParams; result: LocationStatFileResult }
  [LOCATION_FILE_METHODS.seedFiles]: { params: LocationSeedFilesParams; result: LocationSeedFilesResult }
  [LOCATION_FILE_METHODS.ensureDir]: { params: LocationEnsureDirParams; result: LocationEnsureDirResult }
  [LOCATION_FILE_METHODS.removeLocation]: { params: LocationRemoveParams; result: LocationRemoveResult }
  [LOCATION_FILE_METHODS.listArtefacts]: { params: LocationListArtefactsParams; result: LocationListArtefactsResult }
  [LOCATION_FILE_METHODS.listKnowledge]: { params: LocationListKnowledgeParams; result: LocationListKnowledgeResult }
  [LOCATION_FILE_METHODS.searchKnowledge]: { params: LocationSearchKnowledgeParams; result: LocationSearchKnowledgeResult }
  [LOCATION_FILE_METHODS.writeKnowledge]: { params: LocationWriteKnowledgeParams; result: KnowledgeChangeResult }
  [LOCATION_FILE_METHODS.editKnowledge]: { params: LocationEditKnowledgeParams; result: KnowledgeChangeResult }
  [LOCATION_FILE_METHODS.deleteKnowledge]: { params: LocationDeleteKnowledgeParams; result: KnowledgeChangeResult }
  [LOCATION_FILE_METHODS.restoreKnowledge]: { params: LocationRestoreKnowledgeParams; result: KnowledgeChangeResult }
  [LOCATION_FILE_METHODS.knowledgeVersions]: { params: LocationKnowledgeVersionsParams; result: LocationKnowledgeVersionsResult }

  [REPO_WORK_METHODS.connect]: { params: RepoConnectParams; result: RepoConnectResult }
  [REPO_WORK_METHODS.state]: { params: RepoStateParams; result: RepoStateResult }
  /** Read only: a folder's branch, changed files and last commit. */
  [GIT_STATUS_METHOD]: { params: GitStatusParams; result: GitStatusResult }

  // Since 1.12: code work on branches (branchWork.ts, branchReads.ts, mainWork.ts).
  [BRANCH_WORK_METHODS.create]: { params: BranchCreateParams; result: BranchCopyResult }
  [BRANCH_WORK_METHODS.copy]: { params: BranchCopyParams; result: BranchCopyResult }
  [BRANCH_WORK_METHODS.commit]: { params: BranchCommitParams; result: BranchCommitResult }
  [BRANCH_WORK_METHODS.bringBack]: { params: BranchBringBackParams; result: BranchBackResult }
  [BRANCH_WORK_METHODS.updateFromMain]: { params: BranchUpdateFromMainParams; result: BranchUpdateFromMainResult }
  [BRANCH_WORK_METHODS.rename]: { params: BranchRenameParams; result: BranchRenameResult }
  [BRANCH_WORK_METHODS.delete]: { params: BranchDeleteParams; result: BranchDeleteResult }
  [BRANCH_WORK_METHODS.removeCopy]: { params: BranchRemoveCopyParams; result: BranchRemoveCopyResult }
  [BRANCH_READ_METHODS.list]: { params: BranchListParams; result: BranchListResult }
  [BRANCH_READ_METHODS.changes]: { params: BranchChangesParams; result: BranchChangesResult }
  [BRANCH_READ_METHODS.commits]: { params: BranchCommitsParams; result: BranchCommitsResult }
  [BRANCH_READ_METHODS.readFile]: { params: GitReadFileParams; result: GitReadFileResult }
  [BRANCH_READ_METHODS.versions]: { params: GitVersionsParams; result: GitVersionsResult }
  [BRANCH_READ_METHODS.listTree]: { params: GitListTreeParams; result: GitListTreeResult }
  // Since 1.13: one of main's versions' own changes.
  [BRANCH_READ_METHODS.versionChanges]: { params: GitVersionChangesParams; result: BranchChangesResult }
  [MAIN_WORK_METHODS.init]: { params: GitInitParams; result: GitInitResult }
  [MAIN_WORK_METHODS.merge]: { params: GitMergeParams; result: GitMergeResult }
  [MAIN_WORK_METHODS.restore]: { params: GitRestoreParams; result: GitRestoreResult }
  [MAIN_WORK_METHODS.pushMain]: { params: GitPushMainParams; result: GitPushMainResult }
  [MAIN_WORK_METHODS.pullMain]: { params: GitPullMainParams; result: GitPullMainResult }

  // Since 1.12: live previews (livePreviews.ts, livePreviewApps.ts) and branches sent between sites (branchBundles.ts).
  [LIVE_PREVIEW_METHODS.open]: { params: LivePreviewOpenParams; result: LivePreviewResult }
  [LIVE_PREVIEW_METHODS.resume]: { params: LivePreviewResumeParams; result: LivePreviewResult }
  [LIVE_PREVIEW_METHODS.stop]: { params: LivePreviewStopParams; result: LivePreviewStopResult }
  [LIVE_PREVIEW_METHODS.list]: { params: NoParams; result: LivePreviewListResult }
  [LIVE_PREVIEW_METHODS.act]: { params: LivePreviewActParams; result: LivePreviewActResult }
  [LIVE_PREVIEW_METHODS.refresh]: { params: LivePreviewRefreshParams; result: LivePreviewRefreshResult }
  [LIVE_PREVIEW_METHODS.commit]: { params: LivePreviewCommitParams; result: LivePreviewCommitResult }
  [LIVE_PREVIEW_APP_METHODS.start]: { params: LivePreviewAppStartParams; result: LivePreviewAppStartResult }
  [LIVE_PREVIEW_APP_METHODS.stop]: { params: LivePreviewAppStopParams; result: LivePreviewAppStopResult }
  [LIVE_PREVIEW_APP_METHODS.list]: { params: LivePreviewAppListParams; result: LivePreviewAppListResult }
  [SITE_LIVE_PREVIEWS_METHOD]: { params: SiteLivePreviewsParams; result: SiteLivePreviewsResult }
  [BUNDLE_METHODS.make]: { params: BundleMakeParams; result: LivePreviewAnswer<{ result: BundleMakeResult }> }
  [BUNDLE_METHODS.drop]: { params: BundleDropParams; result: BundleDropResult }
  [BRANCH_BRING_BACK_BUNDLE_METHOD]: { params: BranchBringBackBundleParams; result: BranchBringBackBundleResult }
  [BRANCH_PACKAGE_USE_METHOD]: { params: BranchPackageUseParams; result: BranchPackageUseResult }

  /** @deprecated since 1.12; stops working in 3.0. Use `livePreview.appStart` instead. */
  [PREVIEW_METHODS.start]: { params: PreviewStartParams; result: PreviewStartResult }
  /** @deprecated since 1.12; stops working in 3.0. Use `livePreview.appStop` instead. */
  [PREVIEW_METHODS.stop]: { params: PreviewStopParams; result: PreviewStopResult }

  [SITE_DIAGNOSTICS_METHODS.readLogs]: { params: SiteReadLogsParams; result: SiteReadLogsResult }
  [SITE_DIAGNOSTICS_METHODS.healthNow]: { params: NoParams; result: SiteHealth }
  [SITE_RESTORE_METHODS.report]: { params: NoParams; result: SiteRestoreReport }

  [CLAUDE_LOGIN_METHODS.start]: { params: ClaudeLoginStartParams; result: ClaudeLoginStartResult }
  [CLAUDE_LOGIN_METHODS.finish]: { params: ClaudeLoginFinishParams; result: ClaudeLoginFinishResult }
  [CLAUDE_LOGIN_METHODS.cancel]: { params: ClaudeLoginCancelParams; result: ClaudeLoginCancelResult }

  [WORKFLOW_RUN_METHODS.run]: { params: WorkflowRunInstruction; result: WorkflowRunAcceptance }
  [WORKFLOW_RUN_METHODS.stop]: { params: WorkflowStopParams; result: WorkflowStopResult }
  [WORKFLOW_RUN_METHODS.get]: { params: WorkflowGetParams; result: WorkflowRunReport | null }
  [WORKFLOW_RUN_METHODS.readFiles]: { params: WorkflowReadFilesParams; result: WorkflowReadFilesResult }
}

export type SiteMethodName = keyof SiteMethods
export type SiteMethodParams<M extends SiteMethodName> = SiteMethods[M]['params']
export type SiteMethodResult<M extends SiteMethodName> = SiteMethods[M]['result']

/**
 * hq → site on the content transport: each stream's opening params. What crosses after the opening is bytes, in
 * whichever direction the method says (a package's content to the site; a file's to hq, or to a relay; a preview's, a live app's and a bundle's both ways).
 */
export type SiteContentMethods = {
  [PACKAGE_METHODS.put]: { params: { ref: PackageRef } }
  [LOCATION_FILE_METHODS.readFile]: { params: LocationReadFileParams }
  /** Since 1.11: the stream carries a `SkillFolderTransfer`. */
  [LOCATION_FILE_METHODS.writeSkill]: { params: LocationWriteSkillParams }
  /** @deprecated since 1.8; stops working in 3.0. Use `files.serve` instead. */
  [LOCATION_FILE_METHODS.readArtefact]: { params: LocationReadArtefactParams }
  [LOCATION_FILE_METHODS.readKnowledge]: { params: LocationReadKnowledgeParams }
  /** @deprecated since 1.12; stops working in 3.0. Use `app.serve` instead. */
  [PREVIEW_METHODS.connect]: { params: PreviewConnectParams }
  /** Opened by a relay on a site's relay line, not by hq: the site verifies the ticket itself. */
  [FILES_SERVE_METHOD]: { params: FilesServeParams }
  /** Since 1.12, opened duplex by a relay on a site's relay line: one request or WebSocket to a live app (appStream.ts). */
  [APP_SERVE_METHOD]: { params: AppServeParams }
  /** Since 1.12, opened by a relay: a bundle's source and, duplex, its destination (branchBundles.ts). */
  [BUNDLE_METHODS.read]: { params: BundleReadParams }
  [BUNDLE_METHODS.write]: { params: BundleWriteParams }
}

export type SiteContentMethodName = keyof SiteContentMethods
export type SiteContentParams<M extends SiteContentMethodName> = SiteContentMethods[M]['params']
