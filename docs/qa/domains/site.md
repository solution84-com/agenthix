---
name: Domain map — site
description: Feature-domain carving of the site module (the Execution Site) for a QA audit's accuracy code pass. Stable domain order keeps numbering stable across runs. Written 2026-11-03 from site/src (405 source files). Update only when the operation set or the file layout changes.
updated: 2026-11-03
---

# Domain map — `site/`

20 domains. Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness. Paths are relative to `site/`. Every source file under `site/src` (tests and `node_modules` aside) is in exactly one domain or in the excluded section; where a directory is listed, it means every file in it, and where a directory is split between domains, its files are named.

The site is a plain Node server (ADR-0086), not a Wasp app, so it has no operation declarations. Its operations are of four kinds, all listed per domain:

- **HTTP routes** — the route table in `src/server/app.ts` (seven rows: `/health`, `/api/v1/identity/whoami`, `/mcp`, the two harness endpoints, the Claude key endpoint, and the model relay). Each authenticates in its own handler.
- **Control-channel methods** — what hq may ask over the channel, the closed map in `src/server/hq/channelMethods.ts` (one handler per method of core's `SiteMethods`; an unknown method is answered with an error). Method names are the constants in `@agenthix/core` (`RUNTIME_METHODS`, `SITE_DATA_METHODS`, `LOCATION_FILE_METHODS`, `BRANCH_WORK_METHODS` and the like).
- **Events and the content transport** — frames the site sends hq (run status, streamed output, `workflow.step`, `workflow.result`, usage reports) and the byte streams on the content channel.
- **Command and background jobs** — the `agenthix-site` command (`status`, `unregister`) over the control socket, and the timers the site runs itself.

**Ownership is by what the code guards.** Security-sensitive concerns each have one home: the control channel's authentication is domain 2; hq-token verification and run tokens are domain 3; credentials and sign-in are domain 4; the model relay is domain 5; container isolation and the tool gate are domain 6; git in agent folders is domain 14 (the repository) and domain 15 (branch copies); the live-preview guard and handed secrets are domain 17; the executor's masking and egress policy are domain 19.

| # | Domain | Aggregate root(s) or concern | One-line scope |
|---|---|---|---|
| 1 | Site boot, health & host figures | SiteConfig, process | start-up, `/health`, shutdown, environment checks, feature gate, host-service figures, health and diagnostics reports |
| 2 | Registration & the link to hq | HqConnection | pairing, the control channel's connection and authentication, the method table, the `agenthix-site` command, following hq's new address |
| 3 | Identity & run tokens | hq-issued tokens, run and conversation tokens | local verification of hq tokens (audience pinned to this site), `whoami`, run and conversation platform tokens, capability renewal |
| 4 | Credentials & sign-in | model credentials on disk, subscription logins | stored secrets' encryption, the credential file, Claude subscription sign-in, the one-use key tickets |
| 5 | Model relay & usage | model relay, usage outbox | the streaming relay that adds a turn's key, relay tokens and run access, call metering, usage reports to hq |
| 6 | Agent containers & isolation | agent container, tool gate | spawning and removing agent containers, mounts, limits, network, protections, the tool permission gate and risk rating |
| 7 | Run engine & dispatch | AgentRun (execution) | dispatch, queue, run lifecycle, pause, completion and failure, approvals, conversations' processes, ending runs on membership change |
| 8 | Sessions, runs & transcripts (records) | AgentSession, AgentRun, TranscriptEntry, ToolCallLog | the site's runtime rows and their reads for hq, session naming |
| 9 | Session drivers (Claude Code, OpenCode) | harness session | the two harness drivers, their processes and events, the harness turn and gate endpoints |
| 10 | Prompts, agenda & memory | prompt, agenda, memory file | building an agent's prompt from sections, place instructions, agenda, memory files and supersession |
| 11 | Skills & packages | skill, package, package cache | staging skills for a run, skill folders, package delivery, the cache and its eviction, boundary overrides |
| 12 | MCP server & tools | MCP endpoint, tool registry | the local `/mcp` endpoint, tools served here and tools forwarded to hq, web search |
| 13 | Workspace storage & files | Workspace, storage boundary, location | storage paths and boundaries, a location's files, owners' folders, workspace rows, removal, containment |
| 14 | Repositories & git | RepoAttachment, a repository on disk | connecting a repository, git status, the git runner, canonical URLs, the primary location |
| 15 | Code workspaces & branches | branch, branch copy, main | creating, committing, merging, restoring and removing branches in the commit helper |
| 16 | Live previews — lifecycle, apps & bundles | LivePreview, app, bundle | opening and stopping a preview, tickets, apps and their proxy, bundles carrying a branch between sites |
| 17 | Live previews — containers, installs, services, guard & secrets | preview container | the preview container, package installs, services, the guard, handed secrets and masks |
| 18 | Knowledge | knowledge pages, versions | the gate on knowledge writes, page locks, versions, pruning, reads and itemising |
| 19 | Workflow executor | workflow run, executor step | `workflow.run`, step containers, egress policy, masking, change sets, write-back |
| 20 | File serving & the content transport | ticketed file read, relay line | `files.serve`, the relay line and its slots, file facts, the content transport and its reads |

**Co-owned seams — settled here:** the harness homes and path rules (`harnessHomes`, `harnessPathRule`, `harnessRealPath`) are domain 6 (isolation) though the drivers use them. `capabilityRenewal.ts` (the runtime's renewal timer) and `capabilityRenewClient.ts` are domain 3 though the run engine starts the timer. `server/mcp/previewInstallTools.ts` is domain 12 though its tools call into domain 17. `server/storage/scanSkills.ts` and the skill-folder files are domain 11 though they read a location. `server/storage/knowledgeSearch.ts` is domain 18.

---

## Domain scopes (files + operations)

### 1. Site boot, health & host figures
- **Files:** `src/server/main.ts`, `app.ts`, `setup.ts`, `shutdown.ts`, `db.ts`, `health.ts`, `siteConfig.ts`, `validateEnv.ts`; `src/server/http/`; `src/server/utils/`; `src/server/features/`; `src/server/host/`; `src/server/hq/macMemory.ts`, `runtimeCheck.ts`, `siteHealthReport.ts`, `executorImageReport.ts`, `diagnosticsMethods.ts`, `restoreReport.ts`, `branchCopiesSize.ts`
- **Ops:** `GET /health`; the 404 and error handler for unmatched routes; boot (migrations already run by the image, `setup.ts`), clean shutdown on `SIGTERM`/`SIGINT`; control-channel methods `SITE_DIAGNOSTICS_METHODS.readLogs`, `healthNow`, `SITE_RESTORE_METHODS.report`; background jobs: the host-figures reader (figures socket) and the scheduled-change relay (notices passed up to hq)
- **Note:** `app.ts` also carries the route table for every domain; each route's handler is assessed in the domain named in its row. The site serves no operator page (`/` answers 404).

### 2. Registration & the link to hq
- **Files:** `src/server/registration/`; `src/server/control/`; `src/server/hq/hqConnection.ts`, `connectionToken.ts`, `connectionStatus.ts`, `linkProblem.ts`, `resolveChannelUrl.ts`, `addressFollow.ts`, `channelMethods.ts`, `channelAnswer.ts`, `hqAnswers.ts`, `dataClient.ts`, `runtimeChannelMethods.ts`, `previewGone.ts`
- **Ops:** pairing at start from `HQ_URL` and `HQ_PAIRING_SECRET` (hq's own site) and registration by the host service's credential (`HqConnection.connectionToken` as bearer); dial-out, reconnect with backoff, reconcile on reconnect; control-channel methods `site.describe`, `SITE_HQ_ADDRESS_METHOD`, `relay.assign` (handler in domain 20); the dispatch table `channelMethods` itself (closed map; unknown method is an error); the `agenthix-site` command's `status` and `unregister` over `control.sock`
- **Note:** the authentication of the channel (bearer, URL policy in `hqUrlPolicy.ts`, the protocol-version check) is here. The handlers the table points to belong to the domains named on each row.

### 3. Identity & run tokens
- **Files:** `src/server/identity/`; `src/server/runtime/runTokens.ts`, `conversationTokens.ts`; `src/server/hq/capabilityRenewClient.ts`; `src/agents/runtime/capabilityRenewal.ts`
- **Ops:** `GET /api/v1/identity/whoami`; local verification of an hq-issued token with the audience pinned to this site's `siteId` (used by `/mcp` and the relay); minting and resolving a run's token and a conversation's platform token; capability renewal before expiry; the runner claim

### 4. Credentials & sign-in
- **Files:** `src/server/crypto/`; `src/server/login/`; `src/server/runtime/claudeKeyApi.ts`, `claudeKeyTickets.ts`; `src/agents/runtime/agentCredentials.ts`, `credentialFile.ts`, `subscriptionLogins.ts`, `boundaryClaudeHome.ts`
- **Ops:** `POST` the Claude key path (apiKeyHelper trades its key for a one-use ticket); control-channel methods `CLAUDE_LOGIN_METHODS.start`, `finish`, `cancel`; event `site.subscriptionRefreshed`, `site.credentialHealth`; encryption and decryption of stored secrets
- **Note:** adr-0147 applies: no credential may reach an agent's container except the one-use ticket and the turn key. Read what writes and mounts the credential file with that in mind.

### 5. Model relay & usage
- **Files:** `src/server/modelRelay/`
- **Ops:** `ALL` the model relay path `/:provider/*` (body streamed unread to the provider; the turn's key added); relay token check and run access; per-call metering; usage outbox and report to hq; usage reader
- **Note:** the route is mounted without a body parser (`parseBody: false`) on purpose.

### 6. Agent containers & isolation
- **Files:** `src/agents/agentDiskPaths.ts`; `src/agents/runtime/AgentContainerManager.ts`, `DockerSpawner.ts`, `agentImage.ts`, `bindsDrain.ts`, `codeWorkspaceMounts.ts`, `containedFile.ts`, `containerDestroyed.ts`, `containerLabels.ts`, `containerLifecycle.ts`, `containerLimits.ts`, `containerNetwork.ts`, `containerPrep.ts`, `containerRemoval.ts`, `containerRunArgs.ts`, `containerRuns.ts`, `containerTypes.ts`, `ipv6Off.ts`, `landlockCheck.ts`, `locationResolver.ts`, `mountSignature.ts`, `harnessHomes.ts`, `harnessPathRule.ts`, `harnessRealPath.ts`, `toolGate.ts`, `toolGateRuns.ts`, `toolPermissions.ts`, `sdkToolGate.ts`, `riskRating.ts`
- **Ops:** control-channel methods `RUNTIME_METHODS.agentStop`, `agentRemoveDirectory` (handled in domain 7, acting on these); container create, start, stop, remove and orphan sweep; mounts, limits and network per storage boundary; the tool permission gate, allowed tools and risk rating of a call
- **Note:** container isolation lives here. The launcher programs and images are outside `src` (see Excluded).

### 7. Run engine & dispatch
- **Files:** `src/agents/runtime/AgentEngine.ts`, `SiteStreamEmitter.ts`, `selectRuntime.ts`, `types.ts`, `manifestParser.ts`, `deferredTerminal.ts`, `turnStop.ts`, `providerRetry.ts`, `readableRunError.ts`, `agentUtils.ts`, `sdkNames.ts`, `conversationHolds.ts`, `conversationLifecycle.ts`, `conversationProcessStop.ts`, `conversationProcesses.ts`, `runCleanup.ts`, `runCompletion.ts`, `runEventLoop.ts`, `runFailure.ts`, `runLaunch.ts`, `runLimitWatch.ts`, `runModel.ts`, `runPause.ts`, `runPersistence.ts`, `runQueue.ts`, `runQueueKey.ts`, `runResourceCause.ts`, `runRoadmap.ts`, `sessionExistenceCheck.ts`; `src/server/runtime/dispatchHandler.ts`, `dispatchParams.ts`, `chatExecution.ts`, `taskExecution.ts`, `taskComments.ts`, `bootSweep.ts`, `conversationEnding.ts`, `membershipEnding.ts`, `nextRunApproval.ts`, `deferredManifestReport.ts`
- **Ops:** control-channel methods `RUNTIME_METHODS.runDispatch`, `runCancel`, `runApprove`, `runReject`, `agentStop`, `agentRemoveDirectory`, `agentPromptPreview`; `MEMBERSHIP_METHODS.memberLeftProject`, `personLeftOrganisation`, `projectDeleted`; events `run.status`, `run.stream`; boot sweep of runs left running; run queue and limit watch
- **Note:** a chat message and a task run both arrive as `run.dispatch`.

### 8. Sessions, runs & transcripts (records)
- **Files:** `src/server/runtime/runRows.ts`, `activeRunsRows.ts`, `runUsageRows.ts`, `sessionRows.ts`, `toolCallRows.ts`, `transcriptRows.ts`; `src/agents/runtime/currentSessionTitle.ts`, `sessionTitleFrame.ts`; `src/sessions/`
- **Ops:** control-channel methods `RUNTIME_METHODS.sessionCreate`, `sessionGet`, `sessionRename`, `sessionArchive`, `sessionDelete`, `sessionDeleteMany`, `sessionClearRuns`, `runGet`, `runList`, `runListPage`, `runCount`, `runStats`, `runListActive`, `runUsage`, `transcriptList`, `toolCallList`; session naming
- **Note:** `AgentSession` has one writer per field (hq the creation fields, the site every runtime field); `schema.prisma` and `migrations/` are the data model.

### 9. Session drivers (Claude Code, OpenCode)
- **Files:** `src/agents/runtime/ClaudeSDKRuntime.ts`, `OpenCodeRuntime.ts`, `claudeSessionFile.ts`, `openCodeConfigMounts.ts`; `src/agents/runtime/claude/` (`claudeMessages.ts`, `claudeProcess.ts`, `claudeProcessProbe.ts`, `claudeProcesses.ts`, `claudeStart.ts`, `turnInput.ts`); `src/agents/runtime/opencode/` (all but `openCodeSkills.ts` and `skillDescription.ts`); `src/server/harness/`
- **Ops:** `POST` the harness turn path (the OpenCode plugin asks for a session's current turn; checked against the key given to that container's server); `POST` the harness gate path (asked before every tool call; bearer is the conversation's platform token); translating each harness's events into run events; the OpenCode server and its relay script
- **Note:** the plugin that calls the two endpoints is `opencode-plugin/` outside `src`.

### 10. Prompts, agenda & memory
- **Files:** `src/agents/AgentPromptBuilder.ts`, `agendaService.ts`, `memorySupersede.ts`, `placeInstructions.ts`, `promptContent.ts`, `promptSectionLists.ts`, `promptSectionText.ts`; `src/agents/runtime/pinnedMemoryFiles.ts`, `claude/claudeMemory.ts`; `src/shared/promptSections.ts`
- **Ops:** prompt build for a run and for `agentPromptPreview`; agenda file; memory files pinned into a run and superseded when replaced

### 11. Skills & packages
- **Files:** `src/packages/`; `src/agents/runtime/pickedSkill.ts`, `runSkillInputs.ts`, `skillFrontmatter.ts`, `skillMetadata.ts`, `skillSources.ts`, `skillStaging.ts`, `skillTree.ts`, `skillUseRecord.ts`, `skillsStagingDir.ts`, `claude/claudeSkills.ts`, `opencode/openCodeSkills.ts`, `opencode/skillDescription.ts`; `src/server/storage/scanSkills.ts`, `skillFolderTransfer.ts`, `skillFolderWrite.ts`
- **Ops:** control-channel methods `PACKAGE_METHODS.missing`, `LOCATION_FILE_METHODS.scanSkills`, `removeSkill`; package cache fill and the eviction scheduler (background job); staging a run's skills into its container; recording a skill's use

### 12. MCP server & tools
- **Files:** `src/server/mcp/`; `src/server/search/`; `src/shared/mcpTools.ts`, `runtimeTools.ts`
- **Ops:** `POST /mcp` (verifies the run token and its hq capability, then serves tools locally or forwards to hq); the tools in `siteTools.ts` and the forwarded schemas for app, code, knowledge, planning, skill and workflow tools; web search; preview install tools
- **Note:** a tool that needs hq's authority is forwarded; no tool answer may return a secret (adr-0147).

### 13. Workspace storage & files
- **Files:** `src/server/storage/paths.ts`, `storageBoundaries.ts`, `locationContainment.ts`, `locationFileMethods.ts`, `locationRemove.ts`, `ownerFolderMethods.ts`, `findFiles.ts`, `workspaceRows.ts`
- **Ops:** control-channel methods `SITE_DATA_METHODS.workspaceGet`, `workspaceList`, `workspaceListByOwner`, `workspaceListByIds`, `workspaceCreate`, `workspaceSetAllowedTools`, `workspaceDelete`; `LOCATION_FILE_METHODS.listFiles`, `findFiles`, `statFile`, `seedFiles`, `ensureDir`, `removeLocation`, `listArtefacts`
- **Note:** hq checks entitlement before it asks; this site checks containment (a path may not leave its location, links are refused).

### 14. Repositories & git
- **Files:** `src/storage/`; `src/server/storage/canonicalRepoUrl.ts`, `gitStatusMethod.ts`, `primaryLocationService.ts`, `repoWorkMethods.ts`, `repoWorkRefusals.ts`
- **Ops:** control-channel methods `SITE_DATA_METHODS.repoGetForTarget`, `repoFindByUrl`, `repoList`, `repoCreate`, `repoDelete`, `REPO_WORK_METHODS.connect`, `state`, `GIT_STATUS_METHOD`; git commands run in a process group; no git credential is written to the agent's folder

### 15. Code workspaces & branches
- **Files:** `src/server/branches/`
- **Ops:** control-channel methods `BRANCH_WORK_METHODS.create`, `copy`, `commit`, `bringBack`, `updateFromMain`, `rename`, `delete`, `removeCopy`; `BRANCH_READ_METHODS.list`, `changes`, `commits`, `readFile`, `listTree`, `versions`; `MAIN_WORK_METHODS.init`, `merge`, `restore`, `pushMain`, `pullMain`
- **Note:** every Git command on a code workspace runs in the commit helper container (`helperContainer.ts`, `helperSlots.ts`, `program/`), and every call naming a copy is checked against this site's own record of it.

### 16. Live previews — lifecycle, apps & bundles
- **Files:** `src/server/livePreviews/*.ts` (the files directly in the folder); `src/server/livePreviews/apps/`; `src/server/livePreviews/bundles/`
- **Ops:** the live-preview channel methods (`livePreviewChannelMethods`): open, stop, resume, reload, mark in use, auto-stop and status of a preview; app methods `app.open`, `app.serve`, `app.test`; bundle methods `bundle.make`, `bundle.read`, `bundle.write`; capacity (background job; the idle stop is hq's, which sends the site `idleMinutes` only to hold); tickets
- **Note:** behind the `livePreview` flag at experimental.

### 17. Live previews — containers, installs, services, guard & secrets
- **Files:** `src/server/livePreviews/container/`; `src/server/livePreviews/installs/`; `src/server/livePreviews/services/`; `src/server/livePreviews/guard/`; `src/server/livePreviews/secrets/`
- **Ops:** none of its own on the channel; the preview container's creation, budget and exec; package installs and their scan; declared services and their approvals; the guard (looks at processes and rates, responds); handed secrets and the masks over a preview's output
- **Note:** behind the `livePreview` flag at experimental. The secrets a person hands a preview are held here and masked from every output.

### 18. Knowledge
- **Files:** `src/server/knowledge/`; `src/server/storage/knowledgeSearch.ts`
- **Ops:** control-channel methods `LOCATION_FILE_METHODS.listKnowledge`, `searchKnowledge`, `writeKnowledge`, `editKnowledge`, `deleteKnowledge`, `restoreKnowledge`, `knowledgeVersions`; the gate on every write (page rules are core's); per-page lock; version store and pruning (background job)

### 19. Workflow executor
- **Files:** `src/executor/`
- **Ops:** control-channel methods `WORKFLOW_RUN_METHODS.run`, `stop`, `get`, `readFiles`; events `workflow.step`, `workflow.result`; one executor container per step from `docker/executor.Dockerfile`; egress proxy and per-run network; masking of secrets in every output (including git objects and encoded forms); safe-tree and change-set checks; write-back to the workspace
- **Note:** the run instruction is held in memory only, never stored or logged. This is the only place a secret meets a container (adr-0147).

### 20. File serving & the content transport
- **Files:** `src/server/relay/`; `src/server/files/`; `src/server/hq/content/`
- **Ops:** `files.serve` (ticket-checked reader on the relay line; refused on hq's own channel), `file.about` (`FILE_ABOUT_METHOD`), `LOCATION_FILE_METHODS.readFile` on the content transport, `relay.assign` (`RELAY_ASSIGN_METHOD`, which relay this site holds a line to); read slots and `busy` refusals; hq's key set for verifying tickets
- **Note:** a browser's file reads never reach hq's bytes (adr-0153); the site trusts nothing the relay says beyond its signed ticket.

## Excluded from all domains (no human actor / pure internal runtime)

`src/test/` (test helpers, setup files and factories: `db.ts`, `factories.ts`, `integration-setup.ts`, `provider-guard-setup.ts`, `noProviderCalls.ts`, `experimental-failures-setup.ts`) and `src/node_modules/` (a test-runner cache). Files outside `src/` that are not in any domain: `scripts/agenthix-site.mjs` (the command's entry, covered with domain 2), `scripts/build.mjs`, `docker/` (images, launcher programs, executor helper; isolation review reads `docker/launcher/` with domain 6 and `docker/executor*` with domain 19), `opencode-plugin/` (with domain 9), `schema.prisma` and `migrations/` (with domain 8).
