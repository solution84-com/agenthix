---
name: Domain map — hq
description: Feature-domain carving of the hq module for a QA audit's accuracy code pass. Stable domain order keeps US-numbering stable across runs. Regenerated 2026-09-26 from main.wasp (221 operations); domains 21 and 22 and the operation changes of the agents-own-schedule unit added 2026-10-05 (254 operations); domains 23 to 25 and the operation changes of the unit *every screen reviewed* added 2026-10-12 (350 operations) and the src/ tree, after the hq/site split; domain 27 and the operation changes of the agent knowledge unit added 2026-10-26 (470 operations); domains 28 and 29 added 2026-11-02 and 2026-11-03; domains 30 to 42 and a full placement check of every source file under `src/` added 2026-11-03 (workflows, secrets, providers and model lists, billing, the fleet link, the Cloud connection, the library's assets). Update only when the operation set changes.
updated: 2026-11-03
---

# Domain map — `hq/`

42 domains (17 from the 2026-06-19 map, one added beside 16, three added at the end so existing numbers stay stable, two more on 2026-10-05, three more on 2026-10-12, one on 2026-10-17, one on 2026-10-26, one on 2026-11-02, one earlier on 2026-11-03 for the feature switches, and thirteen more on 2026-11-03, 30 to 42, for the folders that had no domain; the table below had stopped at 25 and now lists 26 to 29 too). On 2026-11-03 every non-test file under `src/` was checked against the Files lines below, folder-level entries counting: the files that fitted an existing domain's root were added to it, the rest became domains 30 to 42, and what no person acts on is listed under *Excluded*. Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness. Operation names are the Wasp declarations in `main.wasp.ts`; `main.wasp` declared 221 (117 actions, 88 queries, 16 api). Since 2026-10-12 each feature folder declares its own operations in `src/<folder>/<folder>.wasp.ts`, `main.wasp.ts` gathers them, and the total was 350 (180 actions, 150 queries, 20 api); on 2026-10-26 it is 470 (234 actions, 207 queries, 29 api).

A folder's `<folder>.wasp.ts` belongs to the domain or domains that own the operations it declares; the Files lines name it only where a folder is split across domains.

This map was named `site.md` until 2026-09-26. After the split, hq holds the control plane and the whole browser UI; the agent runtime, session drivers, workspace storage, MCP serving and the control-channel client live in the separate `site/` module, which has no domain map yet.

**Ownership is by aggregate root** — an operation belongs to the domain owning the top entity whose lifecycle it drives. References (foreign keys), cascades (deleting children), and outcomes (a template creating entities) are not shared ownership; they stay with the root as ACs/flags. Boards and Tasks are sub-aggregates of Project, split into their own domains only for the ~12–15-op size cap.

| # | Domain | Aggregate root(s) | One-line scope |
|---|---|---|---|
| 1 | Authentication & Invites | User, Invite, AuthIdentity | sign in/out, invite create/revoke/list, invite validate/accept, first-admin bootstrap |
| 2 | Onboarding & Setup | UserSettings (onboarding state), Org | the setup wizard (You, organisation, model access, review), completion, first-boot organisation |
| 3 | Dashboard & Navigation Shell | (read-only views) | Today's numbers on the Organisation page, the shell, recent activity |
| 4 | Projects & membership | Project, ProjectMember, ProjectAgent | project CRUD, open/private access, join and leave, project members and roles, agent assignment, the Projects screen |
| 5 | Boards & Kanban | Board, BoardTemplate | board CRUD, archive, sprints, milestones and the timeline, run board, column moves, board templates |
| 6 | Tasks | Task (+ TaskComment, TaskAttachment) | task backlog CRUD, run task, dismiss a run, reassign who a task is done for, board return/remove, comments, attachments, task views |
| 7 | Agents — config & lifecycle | Agent, agent package content | agent create/edit/delete, image, export/import, editing settings and content in place, overrides, prompt preview, stats |
| 8 | Agent runs, approvals & logs | AgentRun (read through the site), ToolCallLog | trigger/cancel/stop runs, manifest approve/reject, run + tool-call reads, the Runs screen |
| 9 | Skills | Skill | platform/org library skills CRUD, install/uninstall (org/agent), agent-level skills |
| 10 | Agent & workforce templates | AgentTemplate, WorkforceTemplate | browse/apply agent templates, workforce template review/apply/draft/confirm/pending |
| 11 | Sessions & Chat | AgentSession (+ TranscriptEntry, read through the site) | session CRUD, send/stream messages, model change, stop and delete sessions, voice input |
| 12 | Products & Programs | Product, Program | product/program CRUD, browse — they group projects and own nothing |
| 13 | Teams & Org profile | Team, Org | team CRUD, members, teams in projects, org identity and images, the Organisation page |
| 14 | GitHub App connection | GithubApp, installations | register the GitHub App, refresh installations, disconnect, connection status |
| 15 | Settings, Users, Site config & Voice | UserSettings, SiteConfig, Provider | account/profile, site config, risk rules, voice provider + per-agent voice |
| 16 | Mobile & MCP | MobileAuthToken | mobile pairing, and the `/mcp` endpoint that a person's connection (domain 22) reaches |
| 16a | Execution Site registry | ExecutionSite | site list and a site's page, default site pairing, a site leaving, the control channel server and its protocol version |
| 17 | Notifications | Notification | view, mark-all-read, dismiss, persistent notifications, Needs attention |
| 18 | Model access | ModelCredential, Provider (LLM) | organisation, project and person credentials, Sign in with Claude, the missing-credential item, web-search key |
| 19 | Storage, workspaces & repositories | Workspace, RepoAttachment (read through the site) | storage listing, workspaces, files, repository connect/disconnect, repository operations |
| 20 | Memory | MemoryItem | what agents remember about a person: list, add, edit, delete, promote |
| 21 | Automation, routines & limits | ProjectAutomation, Routine, AutomationStart | a boundary's automation settings and the org's, start times, routines and their rounds, the personal project, run limits, archiving finished tasks, the scheduler and pulse |
| 22 | Connections | PersonConnection | a person's own connections to hq: create, list, renew, revoke, and their authentication |
| 23 | Diagnostics & logs | RecordedError | health of HQ and its sites, recent errors, logs, the support bundle — admins only |
| 24 | People & identities | User, UserSettings (person) | the organisation's people: their cards, names and pictures, role, removing, reactivating and erasing |
| 25 | Home, pins & layout | Pin, UserSettings (layout) | Home's signals and recent conversations, pinned items, the person's choice of screen layout |
| 26 | Conversations | Conversation | a conversation with the lead agent: start, send, stop, approvals, places, archive, model policy |
| 27 | Knowledge | KnowledgeChange (the pages are kept on a site) | pages in sections: browse, search, edit, history, Recently deleted |
| 28 | Code workspaces, branches & live previews | WorkspaceBranch, BranchCopy, LivePreview | branches and their copies, merging, versions, the workspace view, live previews |
| 29 | Features | the organisation's switches | the organisation's feature switches with stages, the Features screen |
| 30 | Workflows — definitions, versions & review | Workflow, WorkflowVersion, WorkflowApproval | a place's workflows, proposing and reviewing a version, approving, the on/off switch, the agent's workflow tools |
| 31 | Workflow runs | WorkflowRun, WorkflowStepRun | start and stop a run, its steps and live output, a conversation's runs |
| 32 | Secrets & variables | PlaceSecret, PlaceVariable | a place's secrets and variables: add, replace, delete, history, what uses them, turning that off |
| 33 | AI providers & model resolution | AiProvider | the organisation's AI providers: add, key, rename, check, remove, revoke, impact; which provider serves a call |
| 34 | Model lists & defaults | ModelList, AgentModelChoices | the organisation's model defaults, lists of allowed models, each agent's model choices, the pickers |
| 35 | Billing & usage | BillingProfile, UsageEntry | billing profiles, a project's profile, the usage report and its export, the organisation's time zone |
| 36 | Fleet link | RelayHost, RelayJoin, FleetActivity | hq's side of host management: the host and console links, joins, moves, fleet activity, read-only while hq moves |
| 37 | Cloud connection | CloudConnection, CloudAccountLink, CloudSignInAsk | hq's connection to Agenthix Cloud, signing in through it, Cloud's offers |
| 38 | Library — adding assets, publishers & settings | Asset (install), AssetPinChange, TrustedPublisher | install from a package, link, upload or shelf, signed publishers, library settings, maintainers, built-in skills |
| 39 | Library — versions & copies | Asset, AssetVersion | an asset's page, versions, updates, rolling back, the original and the own copy, credit, removing and restoring |
| 40 | Library — drafts & skill editor | Draft, DraftRevision, PlaceSkillVersion | the skill editor, drafts of library assets and of a place's skills, publishing, version history of a place's skill |
| 41 | Skills on places & agents | PlaceSkill, AssetGrant | the skills a place or an agent has, defaults and switches, updates from the library, what a run is given |
| 42 | Asset proposals & review | Operation (an asset request), Draft | an agent's proposed skill or change, the queues, accepting, rejecting, aiming a proposal |

**Co-mutating ops (no clear single root) — settled at collation:** `stopAgent` (Agent vs AgentRun → owned by Agents as the root; run-cancel is a cascade AC) · `clearTaskSession` (Task vs AgentSession → owned by Tasks as the invoking root; session-clear is a cascade AC). `updateAgentVoice` mutates Agent but is grouped under Settings/Voice by feature — a deliberate exception to the root rule, flagged for review. `deleteUser` (User vs sessions, credentials, notifications on every site → owned by Settings/Users; the cascade is an AC).

---

## Domain scopes (files + operations)

### 1. Authentication & Invites
- **Files:** `main.wasp.ts` (auth block, invite and bootstrap APIs); `src/auth/` (actions.ts, api.ts, inviteService.ts, inviteToken.ts, queries.ts); `src/server/rateLimit.ts`; `src/auth/pages/`; `src/auth/` password-reset and first-admin-link files
- **Ops:** sign in, createPasswordResetLink, readPasswordResetApi, completePasswordResetApi (usernameAndPassword), sign out, createInvite, revokeInvite, listInvites, validateInviteApi, acceptInviteApi, bootstrapStatusApi (infra — not a story)
- **Note:** the authentication framework also mounts its own sign-up route; no hq screen calls it. Whether it refuses an uninvited request is a contract point (SC-003, SC-361).

### 2. Onboarding & Setup
- **Files:** `src/setup/` (actions.ts, queries.ts); `src/setup/pages/`; `src/org/ensureDefaultOrg.ts`; `src/onboarding/` (the person's own first-use steps); `src/server/setup.ts` (the first admin and the built-in agent at start)
- **Ops:** getSetupData, completeSetup, getOnboardingData
- **Note:** the runtime-connectivity operations the earlier map listed here (`getEnvironmentMode`, `testProvider`, `pingRuntime`) no longer exist.

### 3. Dashboard & Navigation Shell
- **Files:** `src/dashboard/` (todayNumbers.ts, todayQueries.ts, and the page that leads `/org/dashboard` to the Organisation page); `src/sessions/runFeedQueries.ts`; `src/shared/layouts/`, `src/shared/context/`; `src/dock/` (the docked conversation: its place in the address, the draft, its widths); `src/server/dashboard/` (the activity record the services write, and the socket push of the dashboard snapshot — no client subscribes to that push since the dashboard page was removed); `src/App.tsx`, `src/Main.css`, `src/queryClient.ts`, `src/vite-env.d.ts`, `src/logo.svg` (the app's root, styles, query client and type declarations); `src/admin/` (the admin gate, sidebar, menu, crumbs and paths, the Admin overview, the old `/org/*` redirect, `admin.wasp.ts` with the routes into the Providers, Models, Billing profiles and Usage pages of domains 33 to 35); `src/shared/` (the shell's shared parts: `components/` (ui, sidebar, markdownEmbed, AppSidebar and the other shared components), `hooks/`, `utils/`, `constants/`, `providers/`, and the files at its top that no other domain names; the panels below have their own domains)
- **Ops:** getRecentActivity, getActivitySession, getVersionInfo, getTodayNumbers

### 4. Projects & membership
- **Files:** `src/projects/actions.ts` (project-level only), `src/projects/projectService.ts`, `src/projects/memberActions.ts`, `src/projects/memberQueries.ts`, `src/projects/membership.ts`, `src/projects/resourceEntitlement.ts`, `src/projects/queries.ts` (project queries); `src/projects/pages/ProjectsPage.tsx`, `ProjectSettingsPage.tsx`; `src/projects/screen/` (the Projects screen), `src/projects/place/` (a project's members and settings); `src/projects/agentAssignment.ts`, `src/projects/agents/` (a project's Agents tool), `src/projects/components/AgentTile.tsx`, `src/projects/hooks/useProjectAgents.ts`; `src/projects/projectLead.ts`, `projectPeopleQueries.ts`, `projectCardQueries.ts`, `projectPreview.ts`, `projectWire.ts`, `projectStorageRemoval.ts` (the deleted project's folders on its site), `placeAddresses.ts`, `personNow.ts`, `personWork.ts`, `openTaskHandover.ts` (a departing person's open tasks); `src/projects/pages/` (ProjectLeadField, ProjectSettingsAddress, ProjectConversationsPage, projectRoster, projectCardNow) and `src/projects/pages/settings/` (the project's About, Access, Agents, Filing, Where it runs and Delete sections)
- **Ops:** createProject, updateProject, deleteProject, addAgentToProject, removeAgentFromProject, getProjects, getProject, getProjectByKey, getProjectMembers, listPeopleForProject, addProjectMember, setProjectMemberRole, removeProjectMember, setProjectAccessLevel, getProjectCards, getProjectPanelRows, getProjectPeople, getProjectPerson, getProjectPreview, joinProject, leaveProject, setProjectLead

### 5. Boards & Kanban
- **Files:** `src/projects/actions.ts` (board ops + moveTaskToColumn); `src/projects/boardService.ts`; `src/projects/queries.ts` (board queries); `src/library/boardTemplateService.ts` + board-template ops in `src/library/actions.ts`/`queries.ts`; `src/projects/pages/BoardPage.tsx`, `ProjectBoardsPage.tsx`; `src/projects/screen/BoardsAcrossView.tsx` (the Projects screen's org-wide Boards view); `src/projects/boardColumns.ts`, `boardOperations.ts`, `boardView.ts`, `autoQueueColumns.ts`, `boardsAcrossProjects.ts`, `sprintDates.ts`, `sprintService.ts`, `timeline.ts`, `timelineRange.ts`; `src/projects/boards/` (the Boards tool), `src/projects/timeline/` (the Timeline tool), `src/projects/pages/BoardsRedirectPage.tsx`
- **Ops:** createBoard, updateBoard, deleteBoard, runBoard, getBoards, getBoard, getAllBoards, createBoardTemplate, updateBoardTemplate, deleteBoardTemplate, getBoardTemplates, getBoardTemplate, archiveBoard, unarchiveBoard, getProjectBoards, getBoardShowAlso, setBoardShowAlso, getBoardSprints, getSprintTasks, renameSprint, finishSprint, moveTaskToColumn, getTimeline, getMilestones, createMilestone, updateMilestone, deleteMilestone

### 6. Tasks
- **Files:** `src/projects/actions.ts` (task ops); `src/projects/taskService.ts`, `taskStateService.ts`, `taskReasonDisplay.ts`, `taskQueueing.ts`, `taskRunMoves.ts`, `taskOnBehalfOf.ts`, `onBehalfOfOperations.ts`, `lossOfAccess.ts`, `dismissTaskRun.ts`, `notBeforeItsTime.ts`, `boardNotify.ts`; `src/projects/queries.ts` (task queries); `src/projects/pages/TaskPage.tsx`, `ProjectTasksPage.tsx`, `TasksTool.tsx`, `YourTasksPage.tsx`; `src/projects/taskArgs.ts`, `taskWire.ts`, `clearTaskSession.ts`, `stopTask.ts`, `placeRunStop.ts`, `projectRunStop.ts`, `uploadTaskAttachment.ts`, `taskPlanService.ts`, `planOperations.ts`, `planSpan.ts`, `needsYou.ts`, `myTasksQueries.ts`, `openTasksDestination.ts`; `src/projects/components/` (the task panel and its sections), `src/projects/hooks/useTaskDetail.ts`, `useTaskFiles.ts`; `src/projects/pages/` (CreateTaskModal, AssignInRow, TaskInToolView, TaskSessionPage, TaskSessionPane, toolTaskRows, taskHeldNotice, taskStopNotice, useTasksToolUrl, useNow); `src/agents/taskDisplayReason.ts`, `taskExecutionReasons.ts`, `taskCommentsForRun.ts`, `taskWaitingNotification.ts`, `taskSessionArchive.ts`, `taskSessionApproval.ts`; `src/shared/taskCounts.ts`, `taskReferences.ts`
- **Ops:** createTask, updateTask, deleteTask, archiveTask, runTask, runProject, returnTaskToBacklog, clearTaskSession, dismissTaskRun, getTaskOnBehalfOf, setTaskOnBehalfOf, addTaskComment, uploadTaskAttachment, getTasks, getTask, getTaskByKey, getAllTasks, getActiveTaskCount, getTaskComments, getTaskAttachments, moveTaskToBoard, updateTaskPlan, stopTask, stopPlaceRuns, getMyTasks

### 7. Agents — config & lifecycle
- **Files:** `src/agents/actions.ts` (create/update/delete/image/preset/stop); `src/agents/definitionActions.ts`, `agentZipActions.ts`, `agentZipService.ts`, `agentService.ts`, `queries.ts`; `src/agents/overrides/`; `src/agents/permissions/` (an agent's permissions at each level, strictest winning); `src/packages/`; `src/agents/pages/`; `src/agents/agentFacts.ts`, `agentHandle.ts`, `agentListItem.ts`, `agentNow.ts`, `agentPackageExport.ts`, `agentPlaceQueries.ts`, `agentRecentRuns.ts`, `agentSite.ts`, `agentUsageQueries.ts`, `agentWork.ts`, `agentAssignments.ts`, `projectAgentQueries.ts`, `usageTotals.ts`, `models.ts`, `toolPermissions.ts`, `useAgentModelLine.ts`, `src/agents/profile/`; `src/server/presetHandlers.ts`, `src/server/imageUpload.ts` (also a person's picture, domain 24)
- **Ops:** createAgent, updateAgent, deleteAgent, uploadAgentImage, applyAgentPreset, stopAgent, exportAgent, importAgent, updateAgentFile, updateAgentSettings, getAgentOverride, setAgentOverride, getAgentPermissions, getAgentPermissionsHere, getAgentCardHere, getAgents, getAgent, getAgentByHandle, getAgentDetail, getAgentPromptPreview, getAgentChatStats, getAgentProfile, getAgentUsage, getAgentPlace, getAgentAssignments, getOrgAgents, getProjectAgent, getProjectAgents
- **Note:** the workspace directory browser and the agent config-file operations the earlier map listed here were removed; `updateAgentFile` and `updateAgentSettings` replaced the latter (they were named `publishAgentFile` and `publishAgentSettings` until 2026-09-27, when an agent's definition stopped having versions — ADR-0072).

### 8. Agent runs, approvals & logs
- **Files:** `src/agents/manifestActions.ts`, `manifestQueries.ts`, `kernelGuards.ts`, `TaskRunner.ts`, `taskSlotClaim.ts`, `taskStatusListener.ts`, `dispatchService.ts`; `src/sessions/runActions.ts` (run control), `src/sessions/runFeedQueries.ts`, `src/sessions/siteRuntimeStore.ts`; `src/runs/` (the Runs screen and the Runs panel's reads); `src/agents/dispatchPayloads.ts`, `dispatchSiteResolution.ts`, `reconcileService.ts`, `revokedSiteSweep.ts`, `runContext.ts`, `runModel.ts`, `taskRunModel.ts`, `taskFrameChain.ts`, `locationResolver.ts`, `manifestRequests.ts`, `manifestViews.ts`, `approvalNotification.ts`; `src/sessions/activeRuns.ts`, `activeRunsQueries.ts`, `mergedRunFeed.ts`, `runReadHelpers.ts`, `runStarters.ts`, `runUsageRead.ts`, `busyConversationInterrupt.ts`; `src/projects/components/ManifestApprovalComment.tsx`; `src/shared/components/RunsPanel/`
- **Ops:** triggerAgentRun, cancelAgentRun, stopAllSessions, approveManifest, rejectManifest, getToolCallLog, getSessionPendingManifest, getRunManifestStatus, getTaskRuns, getMyRuns, getMyRunsGoingCount, getRunsPage, getRunDetail, getToolCallOutput, getProjectActiveRuns

### 9. Skills
- **Files:** `src/agents/skillsLibraryService.ts`, `skillsActiveService.ts`; `src/agents/actions.ts` (skill ops); `src/agents/queries.ts` (skill queries); `src/packages/skillFiles.ts`; `src/library/pages/LibraryPage.tsx` (Library › Skills), `src/library/components/SkillDialog.tsx`, `SkillParts.tsx`; `src/agents/librarySkillActions.ts`, `librarySkillQueries.ts` (the library's assets themselves, and the skills a place or an agent holds, are domains 38 to 42)
- **Ops:** createLibrarySkill, updateLibrarySkill, deleteLibrarySkill, installSkill, uninstallSkill, saveAgentSkill, deleteAgentSkill, getSkillLibrary, getInstalledSkillVersions, getAgentSkills

### 10. Agent & workforce templates
- **Files:** `src/library/agentTemplateService.ts`, `workforceTemplateService.ts`, `workforceTemplateTypes.ts`, `systemTemplates.ts`; template ops in `src/library/actions.ts`/`queries.ts`; `src/library/pages/`, `src/library/components/`
- **Ops:** getAgentTemplates, applyAgentTemplate, getWorkforceTemplates, getWorkforceTemplate, applyWorkforceTemplate, confirmWorkforceTemplate, saveWorkforceDraft, getExistingAgentHandles, getWorkforceReviewTask, getLibrary, exportLibraryItem

### 11. Sessions & Chat
- **Files:** `src/sessions/actions.ts` (session lifecycle), `src/sessions/queries.ts`, `src/sessions/sessionEntitlement.ts`, `src/sessions/runActions.ts` (stopTaskSession); `src/sessions/pages/`; `src/voice/assemblyAiTokenAction.ts`; `src/chat/` and `src/places/` (a place's conversations, and its sections in the left panel); `src/sessions/conversationActions.ts`, `conversationPopup.ts`, `conversationRead.ts`, `conversationRecord.ts`, `closedSession.ts`, `danglingSessionReconciler.ts`, `sessionProject.ts`, `sessionSender.ts`, `sessionLocationDisplay.ts`, `siteReadSilence.ts`, `siteSessionTitle.ts`, `taskSessionWire.ts`, `transcriptAuthors.ts`; `src/shared/components/ChatPanel/`, `src/shared/closedConversation.ts`; `src/assets/conversation/` (the skill a conversation used and its panel)
- **Ops:** updateSession, archiveSession, stopTaskSession, deleteTaskSession, getSession, getTaskSessions, getTaskSession, getSpeechToken, tryAgain, cancelWaitingMessage, sendWaitingMessageNow, summariseConversation, getUsedSkill, getSessionSkillSteps
- **Note:** session titles are made on the site (`site/src/sessions/namingService.ts`); hq's copy takes them from the site's status frame.

### 12. Products & Programs
- **Files:** `src/products/` (actions.ts, productService.ts, queries.ts); `src/products/pages/`
- **Ops:** createProduct, updateProduct, deleteProduct, createProgram, updateProgram, deleteProgram, getProducts, getProduct, getProductBySlug, getPrograms, getProgram, getProgramBySlug
- **Note:** product members and the product wiki (`src/wiki/`) no longer exist.

### 13. Teams & Org profile
- **Files:** `src/org/` (actions.ts, queries.ts); `src/settings/actions.ts` (updateOrg), `src/settings/queries.ts` (getOrg); `src/org/pages/`; `src/org/identity.ts`, `identityImages.ts`, `publicIdentity.ts`, `workplaceQueries.ts`, `src/org/teams/`
- **Ops:** createTeam, updateTeam, deleteTeam, getTeams, getTeam, updateOrg, getOrg, getOrgIdentity, updateOrgIdentity, uploadOrgImage, removeOrgImage, uploadTeamImage, removeTeamImage, setSignInShows, publicOrgIdentityApi, getOrgSettingsState, getWorkplacePeople, addTeamToProject, removeTeamFromProject, setProjectTeamRole, getProjectTeams

### 14. GitHub App connection
- **Files:** `src/settings/actions.ts` (refreshGithubInstallations, disconnectGithubApp), `src/settings/queries.ts` (getGithubAppStatus); `src/github/`; `src/github/pages/GitHubInstallationsPage.tsx` (Organisation › Settings › GitHub), `GitHubAppPage.tsx` (Organisation › Infrastructure › GitHub App)
- **Ops:** refreshGithubInstallations, disconnectGithubApp, getGithubAppStatus, githubAppManifestNewApi, githubAppManifestCallbackApi, startGithubAppRegistration
- **Note:** the personal-access-token operations the earlier map listed here were removed with the move to a GitHub App.

### 15. Settings, Users, Site config & Voice
- **Files:** `src/settings/actions.ts`/`queries.ts` (excl. GitHub and Org ops); `src/voice/voiceSettingsActions.ts`, `voiceSettingsQueries.ts`, `voicePreviewAction.ts`; `src/voice/agentVoiceActions.ts`; `src/settings/` (timezone actions); `src/settings/pages/SettingsPage.tsx` and its sections; `src/auth/changePassword.ts` (the password change); `src/org/pages/settings/` (Organisation › Settings), `src/org/pages/infrastructure/` (Organisation › Infrastructure); `src/org/pages/people/`; `src/voice/pages/VoiceSettingsPage.tsx`; `src/voice/` (speechAccess.ts, speechScope.ts, ticketedToken.ts, ttsAdapter.ts, inworldAdapter.ts, phraseModel.ts, voiceModels.ts, voiceCache.ts, voiceAccent.ts, speechTokenAction.ts); `src/server/siteConfig.ts`, `src/server/siteSecretService.ts`
- **Ops:** getUserSettings, updateUserSettings, getSiteConfig, updateSiteConfig, updateRiskRules, getEnvStatus, syncBrowserTimezone, setMyTimezone, saveVoiceProvider, deleteVoiceProvider, getVoiceProvider, getVoiceServices, listInworldVoices, previewVoice, updateAgentVoice, changePasswordApi

### 16. Mobile & MCP
- **Files:** `src/mobile/actions.ts`; `src/server/mcp/handler.ts`, `mcpServer.ts`, `workforceTools.ts`; `src/mobile/pages/ConnectMobilePage.tsx`; `src/mobile/pages/MobileConnectPage.tsx`; `src/mobile/` (deviceSessions.ts, slideSession.ts, phoneOperations.ts), `src/mobile/pages/SignedInPhones.tsx`; `src/shared/mcpTools.ts`
- **Ops:** generateMobileAuthToken, exchangeMobileAuthToken, mcpApi, getMyPhones, signOutPhone, registerPhoneSessionApi (the phone's session registration)
- *Removed 2026-10-05:* `generateMcpKey`, `reissueMcpKey`, `getMcpKeySummary` and the MCP settings page — the org-wide key is retired; a person's own connections are domain 22.
- *Removed 2026-08-11:* `initiateHqConnect`, `cancelInflightAuthorize`, `redeemHqInvite`, `hqConnectCallbackApi`, `hqProvisionUserApi`, `hqCreateSessionApi` — the browser-approval link flow, superseded by Execution Site registration (ADR-0044). *Removed 2026-09-15:* the pre-split link to a central service and its dial-out client (`disconnectHq`, `reconnectHqNow`, `getHqConnection`, `getHqSyncStatus`).

### 16a. Execution Site registry
- **Files:** `src/sites/` (credentials.ts, defaultSite.ts, defaultSiteRefusal.ts, registrationService.ts, revokeSite.ts, leaveApi.ts, machineLeaveApi.ts, localSite.ts, eligibleSites.ts, combinedRead.ts, siteUpgrade.ts, siteStanding.ts, siteSilence.ts, `channel/`); `src/sites/` (queries.ts, siteQueries.ts, assertAdmin.ts); `src/sites/pages/ExecutionSitesPage.tsx`, `SitePage.tsx`; `src/shared/connectSite.ts`; `src/shared/siteName.ts`, `siteSilence.ts`, `noExecutionSite.ts`
- **Ops:** getExecutionSites, describeExecutionSite, getSiteList, getSiteDetail, getFleetAccess, getScheduledChangeNotices, siteLeaveApi, hostLeaveApi
- *Removed 2026-10-16:* device approval and revoking or re-keying a site from hq (`getSiteDeviceApproval`, `decideSiteDeviceApproval`, `getPendingSiteApprovals`, `decidePendingSiteApproval`, `revokeExecutionSite`, `registerSiteApi`, `siteDeviceCodeApi`, `siteDeviceTokenApi`, the Connect and Approve pages) — a site is added and removed by a fleet admin in the Fleet Console. *Removed 2026-10-21:* `requestSiteCredentialRotation`, `rotateExecutionSiteCredential` and `POST /api/v1/sites/rotate-credential` — a site's credential is never rotated; a machine gets a new one by leaving the fleet and joining again.

### 17. Notifications
- **Files:** `src/notifications/` (actions.ts, queries.ts); `src/notifications/` persistent.ts, needsAttention.ts, handled.ts, staleRequests.ts (persistent notifications and the Needs attention list); `src/shared/components/NotificationPanel/`
- **Ops:** getNotifications, markNotificationsRead, dismissNotification, getNeedsAttention, acknowledgeBypassedAgents

### 18. Model access
- **Files:** `src/model-access/modelCredentialActions.ts`, `modelCredentialAccess.ts`, `modelCredentialQueries.ts`, `claudeLoginActions.ts`, `talkAccess.ts`, `webSearchKeyActions.ts`, `webSearchKeyQueries.ts`; `src/model-access/modelCredential.ts`, `modelAccessGap.ts`; `src/server/identity/orgPeople.ts`; `src/sites/claudeLoginStore.ts`; `src/model-access/pages/ModelAccessPage.tsx`; `src/model-access/` (the per-person access summary and the web-search key); `src/server/providerService.ts` (the web-search key's provider row)
- **Ops:** getModelCredentialStatus, setModelCredential, deleteModelCredential, startClaudeLogin, completeClaudeLogin, cancelClaudeLogin, getMyModelAccess, getWebSearchKeyStatus, setWebSearchKey, deleteWebSearchKey

### 19. Storage, workspaces & repositories
- **Files:** `src/storage/` (actions.ts, queries.ts, locationAccess.ts, workspaceStore.ts, repoAttachmentService.ts); `src/github/` (actions.ts, queries.ts); `src/storage/pages/`; `src/files/` (operations.ts, openFile.ts, openFiles.ts, openTaskAttachment.ts, useOpenFile.ts, fileFacts.ts, taskReferenceFacts.ts and their answers and deps; `files.wasp.ts`); `src/server/files/` (uploadLinks.ts, uploadAccess.ts, uploadLinkDeps.ts, filesOrigin.ts)
- **Ops:** createWorkspace, deleteWorkspace, setWorkspaceAllowedTools, connectRepo, disconnectRepo, getRepoState, getMyStorage, getWorkspace, listLocationFiles, getFileContent, getWorkflows, getRuns, getRepoSecrets, getWorkspacesAcrossPlaces, getMyStorageSite, listArtefacts, getArtefactContent, getPlaceInstructions, openFile, openFiles, openTaskAttachment, getFileFacts, getTaskReferenceFacts

### 20. Memory
- **Files:** `src/memory/` (memoryService.ts, scopes.ts, items.ts, ranking.ts, embedding/, maintenance.ts, tidy.ts, barTuner.ts, runPinnedMemory.ts, knowledge/); `src/memory/screen/` (the memory screen and its pages); `src/conversations/memory/` (the probe and the agent's memory tools); `src/shared/memory/`
- **Ops:** getMemory, getMemoryMeasurements, getMemoryChoices, saveMemoryItem, setMemoryPinned, forgetMemoryItem, setMemoryEmbeddingModel
- **Note:** rewritten 2026-10-17: memory is three scopes recalled by meaning, no longer two layers delivered whole.

### 21. Automation, routines & limits
- **Files:** `src/automation/` (automationSettings.ts, automationStore.ts, automationStatus.ts, operations.ts, pulse.ts, pulsePlan.ts, scheduler.ts, schedulerNudge.ts, scheduledStart.ts, taskSchedule.ts, scheduleRule.ts, routines.ts, routineRounds.ts, routineActions.ts, routineQueries.ts, routineTemplate.ts, queueNotes.ts); `src/projects/personalProject.ts`, `personalProjectQueries.ts`; `src/projects/finishedArchive/`; `src/agents/runLimits/`; `src/server/controlplane/` (queueGate.ts, scheduleOps.ts, routineOps.ts, runStarter.ts); `src/automation/pages/AutomationSettingsPage.tsx`; `src/agents/pages/RunLimitsSection.tsx`; `src/projects/pages/ArchiveFinishedSection.tsx`; `src/automation/pages/AutomationTool.tsx`, `AutomationRulesView.tsx`, `AutomationRoutinesView.tsx`, `TaskSchedulePanel.tsx`, `ProjectRoutinesPage.tsx`, `RoutinePage.tsx`, `RoutineDetail.tsx`, `RoutineEdit.tsx`; `src/shared/routineTypes.ts`, `src/projects/personalProjectActions.ts`, `src/projects/pages/settings/PersonalAutomation.tsx`
- **Ops:** getOrgAutomation, updateOrgAutomation, getProjectAutomation, updateProjectAutomation, setTaskSchedule, clearTaskSchedule, getProjectRoutines, getRoutine, createRoutine, makeTaskRoutine, updateRoutine, pauseRoutine, resumeRoutine, deleteRoutine, unlinkRoutineRound, getMyPersonalProject, getOrgRunLimits, updateOrgRunLimits, getProjectRunLimits, setProjectRunLimits, getOrgArchiveSetting, updateOrgArchiveSetting, getProjectArchiveSetting, setProjectArchiveSetting, getAutomationOutlook, getRoutinesAcrossProjects, runRoutineNow, skipRoutineRound
- **Note:** the scheduler, the pulse and the routine round creation are internal runtime with no human actor (see below); what a person does is the operations above. Ownership by aggregate root puts the personal project's creation here although `Project` is domain 4's root, because the unit's behaviour is what it adds.

### 22. Connections
- **Files:** `src/connections/` (operations.ts, connectionAuth.ts, connectionToken.ts); `src/shared/connections.ts`; `src/server/controlplane/connectionGroups.ts`; `src/connections/pages/ConnectionsPage.tsx`, `ConnectionList.tsx`, `CreateConnectionForm.tsx`, `NewConnectionToken.tsx`
- **Ops:** getMyConnections, createConnection, renewConnection, revokeConnection (and the authentication of `/mcp` by a connection token, domain 16's `mcpApi`)


### 23. Diagnostics & logs
- **Files:** `src/diagnostics/` (operations.ts, logOperations.ts, hqHealth.ts, siteHealthCards.ts, recentErrors.ts, recordedErrors.ts, errorAdvice.ts, runFailures.ts, supportBundle.ts, bundleNames.ts, logSources.ts, siteConditions.ts, startDiagnostics.ts); `src/diagnostics/pages/DiagnosticsPage.tsx`, `LogsPage.tsx`, `BundlePage.tsx`
- **Ops:** getDiagnosticsHealth, checkDiagnosticsHealthNow, getDiagnosticsSummary, getRecentErrors, getLogSources, getLogs, downloadLogs, buildSupportBundle
- **Note:** admins only. It replaced the debug page and its status view (`getSystemStatus`, `getAgentRuns`, `clearAgentRuns`, removed).

### 24. People & identities
- **Files:** `src/settings/` (orgPeopleQueries.ts, personCard.ts, personProfileActions.ts, leaving.ts, erasePerson.ts, actions.ts for the role change); `src/people/`; `src/org/pages/people/`; `src/server/identity/` (people.ts, personSummary.ts, requireRole.ts, rolePolicy.ts), `src/server/files/pictureTickets.ts`
- **Ops:** getOrgPeople, getOrgPerson, getPersonCard, setPersonName, uploadPersonPicture, removePersonPicture, removePerson, reactivatePerson, erasePerson, updateUserRole (password reset links are domain 1's)
- **Note:** removing a person deactivates them and deletes nothing; erasing is a separate act on someone who has left (adr-0100).

### 25. Home, pins & layout
- **Files:** `src/home/` (homeSignals.ts, pages, components); `src/pins/` (actions.ts, queries.ts, pinOrder.ts); `src/shared/homeTypes.ts`; `src/places/` (a place's sections, their order and addresses); `src/chat/`
- **Ops:** getHomeSignals, getPins, pinItem, unpinItem, reorderPins

### 26. Conversations
- **Files:** `src/conversations/` (the coordinator, access and model choice, tools, work and workers, task threads, long conversations, voice and its client, archive, components and hooks, pages); `src/model-policy/`; `src/shared/conversations/`; `src/server/controlplane/` (turn authority, memory and result operations)
- **Ops:** getConversations, getConversation, getConversationMessages, getPrimaryAgent, getConversationAgentChoices, startConversation, setPrimaryAgent, sendConversationMessage, stopConversationTurn, sendWaitingConversationMessageNow, cancelWaitingConversationMessage, switchConversationAccess, getModelChoices, setConversationModel, getConversationActivity, getOperationResult, answerConversationApproval, cancelConversationOperation, getConversationDeletePreview, deleteConversation, archiveConversation, getConversationSegment, summariseConversationNow, getTaskConversation, startTaskConversation, getTaskThreadMarks, markConversationRead, setConversationKeep, reopenConversation, getArchivedConversations, searchConversationRuns, getModelPolicy, setModelPolicy, getConversationPlaces, addConversationPlace, removeConversationPlace
- **Note:** added 2026-10-17 at the close of the unit that built them. A conversation's record and its turns are hq's own; the voice socket events and the conversation room are not operations but are in the contract (**SC-994** to **SC-1000**).

- **Note (2026-10-26):** a conversation's places (`src/conversations/places.ts`, `placesOperations.ts`, `placesSuggest.ts`, `lead/placesBlock.ts`) are this domain's; the knowledge tools the lead holds are domain 27's.

### 27. Knowledge
- **Files:** `src/knowledge/` (the knowledge service for agents: search across levels, pages, the change record, the platform guide and its build in `guideBuild/`); `src/knowledge/people/` (the operations for people); `src/storage/pages/knowledge/` (the Knowledge tool's screens: browse, page, editor, history, Recently deleted, search); `src/storage/pages/KnowledgeTool.tsx`; `src/org/pages/OrgKnowledgePage.tsx`, `src/org/components/OrgKnowledgeTool.tsx`; `src/storage/storageSite.ts` (the organisation's knowledge placement); `src/server/controlplane/` (knowledgeOps.ts, knowledgeReach.ts, knowledgeToolSchemas.ts); `src/conversations/memory/leadKnowledgeTools.ts`; `src/conversations/coordinator/knowledgeSteps.ts`, `src/conversations/components/knowledge/`; `src/projects/reservedNames.ts`
- **Ops:** listKnowledgePages, getKnowledgePage, knowledgePageVersions, recentlyDeletedKnowledge, searchKnowledgePages, saveKnowledgePage, moveKnowledgePage, deleteKnowledgePage, restoreKnowledgeVersion
- **Note:** added 2026-10-26 at the close of the agent knowledge unit. The knowledge tools agents call are not operations but are in the contract (**SC-1397** to **SC-1416**); the page rules are core's and the gate the site's.

### 28. Code workspaces, branches & live previews

> The live-preview scenarios and stories in this area are behind the `livePreview` flag, at experimental, so not in the release; the notes in the scenarios and stories files list which.

- **Files:** `src/branches/` (a branch and its copy, the agent's Git tools, merging, the merge and package cards, `main`'s versions, GitHub); `src/workspaceView/` (the full-screen workspace view at `/workspaces/:workspaceId/view`); `src/livePreviews/` (opening, stopping, the app tools, site picking, the idle stop, bundles, the Fleet Console's settings, trusted package scopes); `src/relays/` (app and bundle tickets, the relay link)
- **Ops:** getWorkspaceBranches, getBranchChanges, getBranchCommits, getMainVersions, getGitTree, getGitFile, getWorkspaceRemoval, getTaskWorkspaces, turnGitOn, mergeBranch, restoreVersion, renameBranch, deleteBranch, startWorkspaceConversation, getLivePreviewPlaces, getLivePreview, startLivePreview, stopLivePreview, resumeLivePreview, reloadLivePreview, setLivePreviewAuto, markLivePreviewInUse, answerLivePreviewQuestion, openLiveApp, startLiveApp, runLivePreviewWorkflow, getTrustedPackageScopes, setTrustedPackageScopes
- **Note:** added 2026-11-02 at the close of the live preview unit. The agent's tools (`commit`, `update_from_main`, `merge_into_main`, the app tools, `offer_live_preview`) are not operations but are in the contract (**SC-1669** to **SC-1719**).

---

### 29. Features

- **Files:** `src/features/` (the organisation's switches and their cache, `requireFeature`, `useFeature`, what a run is given by flag, the *Features* screen); `src/shared/features.ts` (the words for each flag and stage).
- **Ops:** getFeatures, setFeature.
- **Note:** added 2026-11-03 at the close of the live preview unit. The rule is core's (**SC-1761**); the contract is **SC-1765** to **SC-1774** and, for the live preview behind its flag, **SC-1771** to **SC-1773** and **SC-1780**.

### 30. Workflows — definitions, versions & review
- **Files:** `src/workflows/` except the run files of domain 31: actions.ts, queries.ts, approve.ts, propose.ts, proposalContent.ts, proposedIn.ts, rules.ts, definitionYaml.ts, versionContent.ts, versionDiff.ts, switch.ts, library.ts, placeAccess.ts, placeNames.ts, integrationValues.ts, siteWorkflows.ts, executorImage.ts, imageUpgrade.ts, agentTools.ts, agentToolsSchemas.ts, `checks/` (the checks a proposed version passes), `review/` (the reviewing agent's prompt, card and answer), `starters/` (the starter workflows and how they are proposed), `pages/` (the Workflows tool, a workflow's page, its version review, the address page), `components/` (WorkflowRow, WorkflowSwitch, VersionsTab, DiffFileView, NeedsYouRow, useWorkflowNames), `workflows.wasp.ts`
- **Ops:** getPlaceWorkflows, getWorkflow, getWorkflowVersion, approveWorkflowVersion, declineWorkflowVersion, switchWorkflow, getWorkflowSwitches, setWorkflowAgentRunsPerHour
- **Note:** added 2026-11-03. Routes: `/workflows/:workflowId` and its version address. The agent's workflow tools (propose a workflow, read one) are not operations but are in the contract. A workflow belongs to a place, so its access follows the place's (`placeAccess.ts`).

### 31. Workflow runs
- **Files:** `src/workflows/` run files: runs.ts, runsChecks.ts, runsEvents.ts, runsEventsParse.ts, runsInstruction.ts, runsLive.ts, runsMasking.ts, runsOperations.ts, runsPrinted.ts, runsSite.ts, runsSocketEvent.ts, runsView.ts, runWorkspace.ts, conversationRuns.ts, livePreviewRuns.ts, livePreviewRefusal.ts, `starters/runGuards.ts`; `src/workflows/pages/RunView.tsx`; `src/workflows/components/` (RunButton, RunDialog, RunsTab, StepsTab, StepRow, ErrorLine, useWorkflowRunLive)
- **Ops:** startWorkflowRun, stopWorkflowRun, getWorkflowRuns, getWorkflowRun, getConversationWorkflowRuns
- **Note:** added 2026-11-03. A run is carried out on a site and read back through the control channel; its printed output passes through masking (`runsMasking.ts`) and the secrets it may use are domain 32's.

### 32. Secrets & variables
- **Files:** `src/secrets/` (operations.ts, reads.ts, store.ts, db.ts, access.ts, place.ts, placeDeletion.ts, rules.ts, refusal.ts, rotation.ts, turnOff.ts, usedBy.ts, variables.ts, views.ts, looksLikeSecret.ts, `secrets.wasp.ts`); `src/secrets/pages/` (the Secrets tool and its address page); `src/secrets/components/` (the add, replace, delete, history, turn-off and variable dialogs and the rows); `src/server/crypto/` (the key and the sealing of stored values)
- **Ops:** getPlaceSecrets, getPlaceVariables, getPlaceSecretHistory, getPlaceVariableHistory, addPlaceSecret, replacePlaceSecret, describePlaceSecret, deletePlaceSecret, addPlaceVariable, editPlaceVariable, deletePlaceVariable, turnOffWhatUsesIt
- **Note:** added 2026-11-03. Routes: `/projects/:key/secrets` and `/space/secrets`. What happens to a place's secrets when the place is deleted is in `placeDeletion.ts`.

### 33. AI providers & model resolution
- **Files:** `src/providers/` (operations.ts, reads.ts, write.ts, store.ts, checks.ts, health.ts, healthRules.ts, impact.ts, notices.ts, secrecy.ts, machineCommands.ts, `providers.wasp.ts`); `src/providers/pages/ProvidersPage.tsx`, `src/providers/components/` (add, key and name, impact dialogs, the provider line, the Cloud connect panel); `src/routing/` (snapshot.ts, decide.ts, resolver.ts, reaching.ts, listMatch.ts, modelKeys.ts, place.ts, problems.ts); `src/shared/modelProviders.ts`
- **Ops:** getAiProviders, getAiProviderRecords, getAiProviderImpact, addAiProvider, replaceAiProviderKey, renameAiProvider, removeAiProvider, revokeAiProvider, checkAiProviderNow
- **Note:** added 2026-11-03. `src/routing/` has no operation: it is the rule that picks the provider and model for a call from the providers, the model lists (domain 34) and the place (core states the order); its result is what every model call, in conversations, runs, speech and the web-search key, relies on. Credentials people hold for themselves are domain 18's. Routes: `/admin/providers`.

### 34. Model lists & defaults
- **Files:** `src/models-settings/` (settingsReads.ts, settingsActions.ts, modelLists.ts, choices.ts, coverage.ts, offered.ts, pickerAccess.ts, startWorkModels.ts, taskModelChoice.ts, types.ts, `models-settings.wasp.ts`); `src/models-settings/pages/ModelsPage.tsx`; `src/models-settings/components/` (the defaults, the lists and their editor, each agent's models, the voice dialog and its filters)
- **Ops:** getModelsSettings, getAgentModels, getModelList, getAgentModelLines, getModelPickerChoices, setModelDefaults, setAgentModels, setModelList
- **Note:** added 2026-11-03. Routes: `/admin/models`. A list narrows which models may run; the provider that serves one is domain 33's.

### 35. Billing & usage
- **Files:** `src/billing/` (operations.ts, reads.ts, store.ts, profiles.ts, defaultProfile.ts, costing.ts, pricing.ts, report.ts, months.ts, csv.ts, exportApi.ts, writer.ts, start.ts, types.ts, `callCostView.sql`, `billing.wasp.ts`); `src/billing/sources/` (hq's calls, the relay, runs and voice, where usage is read from); `src/billing/pages/` (BillingProfilesPage, UsagePage); `src/billing/components/`
- **Ops:** getBillingProfiles, getBillingProfileChoices, getProjectBilling, getUsageReport, createBillingProfile, renameBillingProfile, makeDefaultBillingProfile, archiveBillingProfile, setProjectBillingProfile, setOrganisationTimeZone, reportSpeechSession, usageExportApi (`GET /api/v1/usage/export`)
- **Note:** added 2026-11-03. Routes: `/admin/billing-profiles`, `/admin/usage`. A project's billing section sits in the project's settings (domain 4's page).

### 36. Fleet link
- **Files:** `src/fleet/` (index.ts, hosts.ts, joins.ts, consoleCredential.ts, consoleMethods.ts, consoleFacts.ts, relayFacts.ts, siteCredentials.ts, cloudSites.ts, replacedSite.ts, siteMove.ts, siteRestore.ts, siteRestoreApi.ts, hqMove.ts, handover.ts, addressMove.ts, moveCheck.ts, moveCheckApi.ts, machineCommands.ts, signInCheck.ts, fleetAdminRole.ts, fleetRecord.ts, fleetNoticeKinds.ts, activity.ts, activityWords.ts, announce.ts, `fleet.wasp.ts`); `src/fleet/relay/` (the host link and console link servers, the relay hub, frames, joins, transfers, upgrade); `src/server/readOnly.ts`, `readOnlyQueries.ts`, `readOnlyQuery.ts`
- **Ops:** getHqReadOnly, getFleetActivity, moveCheckApi (`POST /api/v1/move-check`), moveProofApi (`POST /api/v1/move-check/proof`), siteRestoreRenewApi (`POST /api/v1/sites/restore-renew`)
- **Note:** added 2026-11-03. hq's side of host management: the Fleet Console and the host services dial into it and it relays between them; the Console's screens and the host service are their own modules. The link's frame handling is internal runtime (see *Excluded*); what a person meets is the read-only banner while hq moves and the fleet activity. Execution Sites a fleet admin adds are domain 16a's.

### 37. Cloud connection
- **Files:** `src/cloud/` (index.ts, cloudConnection.ts, cloudClient.ts, cloudStores.ts, cloudSignIn.ts, signInFlows.ts, signInApi.ts, cloudAccounts.ts, cloudForMembers.ts, adminCloud.ts, platformFacts.ts, platformFactsStore.ts, pledgeStatus.ts, downtimeEmail.ts, machineCommands.ts, `cloud.wasp.ts`); `src/shared/cloudLinks.ts`
- **Ops:** getMyCloudSignIn, getWhereHqRuns, getMyCloudOffers, askForCloudSignIn, getHqCloudConnection, connectHqToCloud, disconnectHqFromCloud, dismissCloudOffer
- **Note:** added 2026-11-03. Connecting and disconnecting need the organisation admin role alone (the fleet admin role is not checked); reading the state over the console link needs the fleet admin role. The sites Cloud runs for hq are registered in domain 36.

### 38. Library — adding assets, publishers & settings
- **Files:** `src/assets/operations.ts`, `src/assets/install/` (the plan, preview and commit of an install, archives, the team template file), `src/assets/sources/` (link, upload, image shelf, pinned HTTPS fetch, public-address check), `src/assets/templates/` (image templates, kernel skills, carried assets), `src/assets/signing/` (publisher signatures: verifier, signer, certificate, trust root), `src/assets/people/` (trustedPublishers.ts, publisherInput.ts, settings.ts, maintainers.ts), `src/assets/builtins/` (the platform skills and their switch); `src/assets/pages/add/` (the Add page, the install dialog, the shelf), `src/assets/pages/settings/` (Library settings); `src/library/packages/` (package export, import, manifest, zip, file tree); `src/assets/assets.wasp.ts`
- **Ops:** previewAssetInstall, installAsset, getAssetShelf, getPackageFiles, listTrustedPublishers, addTrustedPublisher, trustPublisher, renameTrustedPublisher, removeTrustedPublisher, getAssetSettings, updateAssetSettings, listLibraryMaintainers, nameLibraryMaintainer, removeLibraryMaintainer, getBuiltInSkills, setBuiltInSkillSwitch
- **Note:** added 2026-11-03. Routes: `/library/add`, `/admin/settings/library`. Domains 9 and 10 describe the library as it stood before assets; assets are what the library holds now.

### 39. Library — versions & copies
- **Files:** `src/assets/` top-level files (content.ts, kinds.ts, policy.ts, policyActors.ts, validation.ts, skillFile.ts, packageCopies.ts, organisationPublisher.ts, publisherNames.ts); `src/assets/lifecycle/` (versions, pinned versions, on-purpose installs, own copy and original, credits, provenance, offers, notices, records, withdrawn, errors, operations); `src/assets/components/`; `src/assets/pages/asset/` (an asset's page: about, versions, copies, original, template, credit, who can edit, the update card, its dialogs); `src/assets/pages/assetPages.wasp.ts`; `src/library/assetList/` (the library's list rows)
- **Ops:** getAssetPage, getAssetContent, getAssetDiff, getAssetNews, getAssetVersions, getAssetVersionChanges, acceptAssetUpdate, skipAssetUpdate, rollBackAsset, installAssetVersionOnPurpose, switchToOriginalAsset, switchToOwnCopy, getAssetCopyNews, dismissAssetNews, getAssetCredit, addAssetCredit, removeLibraryAsset, restoreLibraryAsset
- **Note:** added 2026-11-03. Routes: `/library/:assetId`. Eighteen operations because the page reads and writes them together.

### 40. Library — drafts & skill editor
- **Files:** `src/assets/pages/editor/` (the Skill editor: file tree, panes, checks, ask-an-agent box, publish dialog, new skill; `editor.wasp.ts`); `src/assets/lifecycle/` (draftStore.ts, drafts.ts, publish.ts); `src/assets/places/` (placeDrafts.ts, placeVersions.ts, history.ts)
- **Ops:** getEditorView, getAssetDraft, saveAssetDraft, discardAssetDraft, publishAssetDraft, createSkillDraft, editLibraryAsset, getPlaceSkillDraft, savePlaceSkillDraft, discardPlaceSkillDraft, createPlaceSkillDraft, publishPlaceSkillDraft, publishPlaceSkillFiles, getPlaceSkillVersions, rollBackPlaceSkillVersion, putBackPlaceSkillVersion
- **Note:** added 2026-11-03. Routes: `/library/new-skill`, `/library/:assetId/edit`, `/library/place-skills/:placeSkillId`.

### 41. Skills on places & agents
- **Files:** `src/assets/places/` (list.ts, place.ts, scan.ts, switches.ts, switchState.ts, addRemove.ts, metadata.ts, libraryUpdate.ts, yours.ts, siteSkills.ts, operations.ts); `src/assets/pages/place/` (the Skills tool of a place: rows, defaults, add, library update, files and history dialogs); `src/assets/pages/agent/` (an agent's Skills section and picker, cost); `src/assets/delivery/` (what a run, a person or a file is given: installed, run skills, person skills, clash order); `src/shared/components/skills/`
- **Ops:** getPlaceSkills, scanPlaceSkills, getPlaceSkillFiles, setPlaceSkillsDefault, switchPlaceSkill, switchAllPlaceSkills, addSkillToPlace, removePlaceSkill, getPlaceSkillLibraryUpdate, updatePlaceSkillFromLibrary, getYourSkillsHere, getAgentSkillSet, getAssetHolders, setAssetEveryAgent, addAssetToAgents, removeAssetFromAgent
- **Note:** added 2026-11-03. The skill a conversation used is domain 11's; drafts and publishing of a place's skill are domain 40's. What a run is given is internal runtime unit-tested apart.

### 42. Asset proposals & review
- **Files:** `src/assets/proposals/` (propose, draft, target, card, review, queue, sweep, view, route, the agent tool); `src/assets/approvals/` (the approval request and its answer); `src/assets/pages/review/` (the proposal queue and review pages, live changes, attention); `src/assets/pages/card/` (the request-change card)
- **Ops:** getSkillProposal, getSkillDraftCard, listSkillProposals, acceptSkillProposal, rejectSkillProposal, aimSkillProposal, getSkillProposalReview, getSkillProposalQueues, getAssetRequestChange
- **Note:** added 2026-11-03. Routes: `/library/proposals`, `/library/proposals/:proposalId`. The agent's tool for proposing is not an operation but is in the contract.

## Excluded from all domains (no human actor / pure internal runtime)

`healthApi`; bootstrap-status (state endpoint); the identity endpoints (`jwksApi`, `mintSiteTokenApi`, `renewCapabilityApi`) and the control-plane data endpoint (`dataApi`); TaskRunner, the scheduler and the pulse, routine round creation, dispatch and capability minting, the control-channel server's frame handling, MCP tool handler internals, TTS adapters, dashboard compose/socket internals (unused: no client has subscribed since the dashboard page was removed). The fleet link's frame handling (`src/fleet/relay/`); the server's own plumbing in `src/server/` that no person acts on (`apis.ts`, `middleware.ts`, `socket.ts`, `clientEvents.ts`, `clientProtocol.ts`, `runEvents.ts`, `personEvents.ts`, `waspHttpServer.ts`, `seed.ts`, `buildInfo.ts`, `envValidation.ts`, `hqAssets.ts`, `hqStoragePaths.ts`, `trustedProxies.ts`, `realPathWithin.ts`, `boot/`, `utils/`, and `identity/` token, capability and signing-key services); what a run is given from the library (`src/assets/delivery/`, listed in domain 41 as well). The test support in `src/test/` and every `__tests__/` folder are tests, not source. These are unit-tested runtime units (see the scenarios contract, "Internal runtime"), not user stories. The site's own runtime (agent engine, container manager, session drivers) is the `site/` module's.
