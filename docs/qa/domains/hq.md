---
name: Domain map — hq
description: Feature-domain carving of the hq module for a QA audit's accuracy code pass. Stable domain order keeps US-numbering stable across runs. Regenerated 2026-09-26 from main.wasp (221 operations); domains 21 and 22 and the operation changes of the agents-own-schedule unit added 2026-10-05 (254 operations); domains 23 to 25 and the operation changes of the unit *every screen reviewed* added 2026-10-12 (350 operations) and the src/ tree, after the hq/site split; domain 27 and the operation changes of the agent knowledge unit added 2026-10-26 (470 operations). Update only when the operation set changes.
updated: 2026-10-26
---

# Domain map — `hq/`

27 domains (17 from the 2026-06-19 map, one added beside 16, three added at the end so existing numbers stay stable, two more on 2026-10-05 three more on 2026-10-12, one on 2026-10-17 and one on 2026-10-26). Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness. Operation names are the Wasp declarations in `main.wasp.ts`; `main.wasp` declared 221 (117 actions, 88 queries, 16 api). Since 2026-10-12 each feature folder declares its own operations in `src/<folder>/<folder>.wasp.ts`, `main.wasp.ts` gathers them, and the total was 350 (180 actions, 150 queries, 20 api); on 2026-10-26 it is 470 (234 actions, 207 queries, 29 api).

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

**Co-mutating ops (no clear single root) — settled at collation:** `stopAgent` (Agent vs AgentRun → owned by Agents as the root; run-cancel is a cascade AC) · `clearTaskSession` (Task vs AgentSession → owned by Tasks as the invoking root; session-clear is a cascade AC). `updateAgentVoice` mutates Agent but is grouped under Settings/Voice by feature — a deliberate exception to the root rule, flagged for review. `deleteUser` (User vs sessions, credentials, notifications on every site → owned by Settings/Users; the cascade is an AC).

---

## Domain scopes (files + operations)

### 1. Authentication & Invites
- **Files:** `main.wasp.ts` (auth block, invite and bootstrap APIs); `src/auth/` (actions.ts, api.ts, inviteService.ts, inviteToken.ts, queries.ts); `src/server/rateLimit.ts`; `src/auth/pages/`; `src/auth/` password-reset and first-admin-link files
- **Ops:** sign in, createPasswordResetLink, readPasswordResetApi, completePasswordResetApi (usernameAndPassword), sign out, createInvite, revokeInvite, listInvites, validateInviteApi, acceptInviteApi, bootstrapStatusApi (infra — not a story)
- **Note:** the authentication framework also mounts its own sign-up route; no hq screen calls it. Whether it refuses an uninvited request is a contract point (SC-003, SC-361).

### 2. Onboarding & Setup
- **Files:** `src/setup/` (actions.ts, queries.ts); `src/setup/pages/`; `src/org/ensureDefaultOrg.ts`; `src/onboarding/` (the person's own first-use steps)
- **Ops:** getSetupData, completeSetup, getOnboardingData
- **Note:** the runtime-connectivity operations the earlier map listed here (`getEnvironmentMode`, `testProvider`, `pingRuntime`) no longer exist.

### 3. Dashboard & Navigation Shell
- **Files:** `src/dashboard/` (todayNumbers.ts, todayQueries.ts, and the page that leads `/org/dashboard` to the Organisation page); `src/sessions/runFeedQueries.ts`; `src/shared/layouts/`, `src/shared/context/`; `src/dock/` (the docked conversation: its place in the address, the draft, its widths); `src/server/dashboard/` (the activity record the services write, and the socket push of the dashboard snapshot — no client subscribes to that push since the dashboard page was removed)
- **Ops:** getRecentActivity, getActivitySession, getVersionInfo, validateRecentItems, getTodayNumbers

### 4. Projects & membership
- **Files:** `src/projects/actions.ts` (project-level only), `src/projects/projectService.ts`, `src/projects/memberActions.ts`, `src/projects/memberQueries.ts`, `src/projects/membership.ts`, `src/projects/resourceEntitlement.ts`, `src/projects/queries.ts` (project queries); `src/projects/pages/ProjectsPage.tsx`, `ProjectSettingsPage.tsx`; `src/projects/screen/` (the Projects screen), `src/projects/place/` (a project's members and settings)
- **Ops:** createProject, updateProject, deleteProject, addAgentToProject, removeAgentFromProject, getProjects, getProject, getProjectByKey, getProjectMembers, listPeopleForProject, addProjectMember, setProjectMemberRole, removeProjectMember, setProjectAccessLevel, getProjectCards, getProjectPanelRows, getProjectPeople, getProjectPerson, getProjectPreview, joinProject, leaveProject, setProjectLead

### 5. Boards & Kanban
- **Files:** `src/projects/actions.ts` (board ops + moveTaskToColumn); `src/projects/boardService.ts`; `src/projects/queries.ts` (board queries); `src/library/boardTemplateService.ts` + board-template ops in `src/library/actions.ts`/`queries.ts`; `src/projects/pages/BoardPage.tsx`, `ProjectBoardsPage.tsx`; `src/projects/screen/BoardsAcrossView.tsx` (the Projects screen's org-wide Boards view)
- **Ops:** createBoard, updateBoard, deleteBoard, runBoard, getBoards, getBoard, getAllBoards, createBoardTemplate, updateBoardTemplate, deleteBoardTemplate, getBoardTemplates, getBoardTemplate, archiveBoard, unarchiveBoard, getProjectBoards, getBoardShowAlso, setBoardShowAlso, getBoardSprints, getSprintTasks, renameSprint, finishSprint, moveTaskToColumn, getTimeline, getMilestones, createMilestone, updateMilestone, deleteMilestone

### 6. Tasks
- **Files:** `src/projects/actions.ts` (task ops); `src/projects/taskService.ts`, `taskStateService.ts`, `taskReasonDisplay.ts`, `taskQueueing.ts`, `taskRunMoves.ts`, `taskOnBehalfOf.ts`, `onBehalfOfOperations.ts`, `lossOfAccess.ts`, `dismissTaskRun.ts`, `notBeforeItsTime.ts`, `boardNotify.ts`; `src/projects/queries.ts` (task queries); `src/projects/pages/TaskPage.tsx`, `ProjectTasksPage.tsx`, `TasksTool.tsx`, `YourTasksPage.tsx`
- **Ops:** createTask, updateTask, deleteTask, archiveTask, runTask, runProject, returnTaskToBacklog, clearTaskSession, dismissTaskRun, getTaskOnBehalfOf, setTaskOnBehalfOf, addTaskComment, uploadTaskAttachment, getTasks, getTask, getTaskByKey, getAllTasks, getActiveTaskCount, getTaskComments, getTaskAttachments, moveTaskToBoard, updateTaskPlan, stopTask, stopPlaceRuns, getMyTasks

### 7. Agents — config & lifecycle
- **Files:** `src/agents/actions.ts` (create/update/delete/image/preset/stop); `src/agents/definitionActions.ts`, `agentZipActions.ts`, `agentZipService.ts`, `agentService.ts`, `queries.ts`; `src/agents/overrides/`; `src/agents/permissions/` (an agent's permissions at each level, strictest winning); `src/packages/`; `src/agents/pages/`
- **Ops:** createAgent, updateAgent, deleteAgent, uploadAgentImage, applyAgentPreset, stopAgent, exportAgent, importAgent, updateAgentFile, updateAgentSettings, getAgentOverride, setAgentOverride, getAgentPermissions, getAgentPermissionsHere, getAgentCardHere, getAgents, getAgent, getAgentByHandle, getAgentDetail, getAgentPromptPreview, getAgentChatStats, getAgentProfile, getAgentUsage, getAgentPlace, getAgentAssignments, getOrgAgents, getProjectAgent, getProjectAgents
- **Note:** the workspace directory browser and the agent config-file operations the earlier map listed here were removed; `updateAgentFile` and `updateAgentSettings` replaced the latter (they were named `publishAgentFile` and `publishAgentSettings` until 2026-09-27, when an agent's definition stopped having versions — ADR-0072).

### 8. Agent runs, approvals & logs
- **Files:** `src/agents/manifestActions.ts`, `manifestQueries.ts`, `kernelGuards.ts`, `TaskRunner.ts`, `taskSlotClaim.ts`, `taskStatusListener.ts`, `dispatchService.ts`; `src/sessions/runActions.ts` (run control), `src/sessions/runFeedQueries.ts`, `src/sessions/siteRuntimeStore.ts`; `src/runs/` (the Runs screen and the Runs panel's reads)
- **Ops:** triggerAgentRun, cancelAgentRun, stopAllSessions, approveManifest, rejectManifest, getToolCallLog, getSessionPendingManifest, getRunManifestStatus, getTaskRuns, getMyRuns, getMyRunsGoingCount, getRunsPage, getRunDetail, getToolCallOutput, getProjectActiveRuns

### 9. Skills
- **Files:** `src/agents/skillsLibraryService.ts`, `skillsActiveService.ts`; `src/agents/actions.ts` (skill ops); `src/agents/queries.ts` (skill queries); `src/packages/skillFiles.ts`; `src/library/pages/LibraryPage.tsx` (Library › Skills), `src/library/components/SkillDialog.tsx`, `SkillParts.tsx`
- **Ops:** createLibrarySkill, updateLibrarySkill, deleteLibrarySkill, installSkill, uninstallSkill, saveAgentSkill, deleteAgentSkill, getSkillLibrary, getInstalledSkillVersions, getAgentSkills

### 10. Agent & workforce templates
- **Files:** `src/library/agentTemplateService.ts`, `workforceTemplateService.ts`, `workforceTemplateTypes.ts`, `systemTemplates.ts`; template ops in `src/library/actions.ts`/`queries.ts`; `src/library/pages/`, `src/library/components/`
- **Ops:** getAgentTemplates, applyAgentTemplate, getWorkforceTemplates, getWorkforceTemplate, applyWorkforceTemplate, confirmWorkforceTemplate, saveWorkforceDraft, getExistingAgentHandles, getWorkforceReviewTask, getLibrary, exportLibraryItem, importLibraryItem

### 11. Sessions & Chat
- **Files:** `src/sessions/actions.ts` (session lifecycle), `src/sessions/queries.ts`, `src/sessions/sessionEntitlement.ts`, `src/sessions/runActions.ts` (stopTaskSession); `src/sessions/pages/`; `src/voice/assemblyAiTokenAction.ts`; `src/chat/` and `src/places/` (a place's conversations, and its sections in the left panel)
- **Ops:** updateSession, archiveSession, stopTaskSession, deleteTaskSession, getSession, getTaskSessions, getTaskSession, getSpeechToken, tryAgain, cancelWaitingMessage, sendWaitingMessageNow, summariseConversation
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
- **Files:** `src/settings/actions.ts`/`queries.ts` (excl. GitHub and Org ops); `src/voice/voiceSettingsActions.ts`, `voiceSettingsQueries.ts`, `voicePreviewAction.ts`; `src/voice/agentVoiceActions.ts`; `src/settings/` (timezone actions); `src/settings/pages/SettingsPage.tsx` and its sections; `src/auth/changePassword.ts` (the password change); `src/org/pages/settings/` (Organisation › Settings), `src/org/pages/infrastructure/` (Organisation › Infrastructure); `src/org/pages/people/`; `src/voice/pages/VoiceSettingsPage.tsx`
- **Ops:** getUserSettings, updateUserSettings, getSiteConfig, updateSiteConfig, updateRiskRules, getEnvStatus, syncBrowserTimezone, setMyTimezone, saveVoiceProvider, deleteVoiceProvider, getVoiceProvider, getVoiceServices, listInworldVoices, previewVoice, updateAgentVoice, changePasswordApi

### 16. Mobile & MCP
- **Files:** `src/mobile/actions.ts`; `src/server/mcp/handler.ts`, `mcpServer.ts`, `workforceTools.ts`; `src/mobile/pages/ConnectMobilePage.tsx`; `src/mobile/pages/MobileConnectPage.tsx`
- **Ops:** generateMobileAuthToken, exchangeMobileAuthToken, mcpApi
- *Removed 2026-10-05:* `generateMcpKey`, `reissueMcpKey`, `getMcpKeySummary` and the MCP settings page — the org-wide key is retired; a person's own connections are domain 22.
- *Removed 2026-08-11:* `initiateHqConnect`, `cancelInflightAuthorize`, `redeemHqInvite`, `hqConnectCallbackApi`, `hqProvisionUserApi`, `hqCreateSessionApi` — the browser-approval link flow, superseded by Execution Site registration (ADR-0044). *Removed 2026-09-15:* the pre-split link to a central service and its dial-out client (`disconnectHq`, `reconnectHqNow`, `getHqConnection`, `getHqSyncStatus`).

### 16a. Execution Site registry
- **Files:** `src/sites/` (credentials.ts, defaultSite.ts, defaultSiteRefusal.ts, registrationService.ts, revokeSite.ts, leaveApi.ts, machineLeaveApi.ts, localSite.ts, eligibleSites.ts, combinedRead.ts, siteUpgrade.ts, siteStanding.ts, siteSilence.ts, `channel/`); `src/sites/` (queries.ts, siteQueries.ts, assertAdmin.ts); `src/sites/pages/ExecutionSitesPage.tsx`, `SitePage.tsx`; `src/shared/connectSite.ts`
- **Ops:** getExecutionSites, describeExecutionSite, getSiteList, getSiteDetail, getFleetAccess, getScheduledChangeNotices, siteLeaveApi, hostLeaveApi
- *Removed 2026-10-16:* device approval and revoking or re-keying a site from hq (`getSiteDeviceApproval`, `decideSiteDeviceApproval`, `getPendingSiteApprovals`, `decidePendingSiteApproval`, `revokeExecutionSite`, `registerSiteApi`, `siteDeviceCodeApi`, `siteDeviceTokenApi`, the Connect and Approve pages) — a site is added and removed by a fleet admin in the Fleet Console. *Removed 2026-10-21:* `requestSiteCredentialRotation`, `rotateExecutionSiteCredential` and `POST /api/v1/sites/rotate-credential` — a site's credential is never rotated; a machine gets a new one by leaving the fleet and joining again.

### 17. Notifications
- **Files:** `src/notifications/` (actions.ts, queries.ts); `src/notifications/` persistent.ts, needsAttention.ts, handled.ts, staleRequests.ts (persistent notifications and the Needs attention list)
- **Ops:** getNotifications, markNotificationsRead, dismissNotification, getNeedsAttention, acknowledgeBypassedAgents

### 18. Model access
- **Files:** `src/model-access/modelCredentialActions.ts`, `modelCredentialAccess.ts`, `modelCredentialQueries.ts`, `claudeLoginActions.ts`, `talkAccess.ts`, `webSearchKeyActions.ts`, `webSearchKeyQueries.ts`; `src/model-access/modelCredential.ts`, `modelAccessGap.ts`; `src/server/identity/orgPeople.ts`; `src/sites/claudeLoginStore.ts`; `src/model-access/pages/ModelAccessPage.tsx`; `src/model-access/` (the per-person access summary and the web-search key)
- **Ops:** getModelCredentialStatus, setModelCredential, deleteModelCredential, startClaudeLogin, completeClaudeLogin, cancelClaudeLogin, getMyModelAccess, getWebSearchKeyStatus, setWebSearchKey, deleteWebSearchKey

### 19. Storage, workspaces & repositories
- **Files:** `src/storage/` (actions.ts, queries.ts, locationAccess.ts, workspaceStore.ts, repoAttachmentService.ts); `src/github/` (actions.ts, queries.ts); `src/storage/pages/`; `src/preview/` (open a project's files as a page)
- **Ops:** createWorkspace, deleteWorkspace, setWorkspaceAllowedTools, connectRepo, disconnectRepo, getRepoState, getMyStorage, getWorkspace, listLocationFiles, getFileContent, getWorkflows, getRuns, getRepoSecrets, getWorkspacesAcrossPlaces, getMyStorageSite, listArtefacts, getArtefactContent, getPlaceInstructions, listPlacePreviews, openPreview

### 20. Memory
- **Files:** `src/memory/` (memoryService.ts, scopes.ts, items.ts, ranking.ts, embedding/, maintenance.ts, tidy.ts, barTuner.ts, runPinnedMemory.ts, knowledge/); `src/memory/screen/` (the memory screen and its pages); `src/conversations/memory/` (the probe and the agent's memory tools)
- **Ops:** getMemory, getMemoryMeasurements, getMemoryChoices, saveMemoryItem, setMemoryPinned, forgetMemoryItem, setMemoryEmbeddingModel
- **Note:** rewritten 2026-10-17: memory is three scopes recalled by meaning, no longer two layers delivered whole.

### 21. Automation, routines & limits
- **Files:** `src/automation/` (automationSettings.ts, automationStore.ts, automationStatus.ts, operations.ts, pulse.ts, pulsePlan.ts, scheduler.ts, schedulerNudge.ts, scheduledStart.ts, taskSchedule.ts, scheduleRule.ts, routines.ts, routineRounds.ts, routineActions.ts, routineQueries.ts, routineTemplate.ts, queueNotes.ts); `src/projects/personalProject.ts`, `personalProjectQueries.ts`; `src/projects/finishedArchive/`; `src/agents/runLimits/`; `src/server/controlplane/` (queueGate.ts, scheduleOps.ts, routineOps.ts, runStarter.ts); `src/automation/pages/AutomationSettingsPage.tsx`; `src/agents/pages/RunLimitsSection.tsx`; `src/projects/pages/ArchiveFinishedSection.tsx`; `src/automation/pages/AutomationTool.tsx`, `AutomationRulesView.tsx`, `AutomationRoutinesView.tsx`, `TaskSchedulePanel.tsx`, `ProjectRoutinesPage.tsx`, `RoutinePage.tsx`, `RoutineDetail.tsx`, `RoutineEdit.tsx`
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
- **Files:** `src/settings/` (orgPeopleQueries.ts, personCard.ts, personProfileActions.ts, leaving.ts, erasePerson.ts, actions.ts for the role change); `src/people/`; `src/org/pages/people/`
- **Ops:** getOrgPeople, getOrgPerson, getPersonCard, setPersonName, uploadPersonPicture, removePersonPicture, removePerson, reactivatePerson, erasePerson, updateUserRole (password reset links are domain 1's)
- **Note:** removing a person deactivates them and deletes nothing; erasing is a separate act on someone who has left (adr-0100).

### 25. Home, pins & layout
- **Files:** `src/home/` (homeSignals.ts, pages, components); `src/pins/` (actions.ts, queries.ts, pinOrder.ts); `src/places/` (a place's sections, their order and addresses); `src/chat/`
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

---

## Excluded from all domains (no human actor / pure internal runtime)

`healthApi`; bootstrap-status (state endpoint); the identity endpoints (`jwksApi`, `mintSiteTokenApi`, `renewCapabilityApi`) and the control-plane data endpoint (`dataApi`); TaskRunner, the scheduler and the pulse, routine round creation, dispatch and capability minting, the control-channel server's frame handling, MCP tool handler internals, TTS adapters, dashboard compose/socket internals (unused: no client has subscribed since the dashboard page was removed). These are unit-tested runtime units (see the scenarios contract, "Internal runtime"), not user stories. The site's own runtime (agent engine, container manager, session drivers) is the `site/` module's.
