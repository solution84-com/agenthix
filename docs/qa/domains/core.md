---
name: Domain map — core
description: Feature-domain carving of the core module for a QA audit's accuracy code pass. Stable domain order keeps US-numbering stable across runs. Written 2026-11-03 from the source tree; update when files are added, moved or removed.
updated: 2026-11-03
---

# Domain map — `core/`

16 domains. Every source file of `core/` (`@agenthix/core`) belongs to exactly one domain below or to the excluded list. `core/` holds shared TypeScript types and protocol definitions consumed by `hq`, `site`, `host`, `console` and `console-web`; its exports are what those modules depend on, so the "operations" of each domain are the exported protocols, schemas and functions. Security-sensitive pieces (token formats, signing, and the validation of what crosses a boundary) are marked in each domain's note: they sit in domains 2, 5, 7, 8, 9, 10, 12 and 16. Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness. Ownership is by concern: a file that serves two protocols sits with the one that defines its shapes.

| # | Domain | Aggregate root(s) or concern | One-line scope |
|---|---|---|---|
| 1 | Control channel, versioning & site methods | hq-to-site channel, ProtocolVersion | the site channel's messages and named methods, version compatibility checks, site registration, health, diagnostics and restore reports, content streams, and the recorded protocol snapshots |
| 2 | Capability tokens, run credentials & relay tickets | Capability token, RunCredential, relay ticket | the signed tokens that cross a boundary: identity and capability tokens, run credentials and the model-access descriptor, the relay's door, signed tickets and their verification, usage reports, Claude login |
| 3 | Runs, sessions & transcript | AgentRun, AgentSession, TranscriptEntry (wire shapes) | what a run and a conversation look like on the wire: runtime methods and parameters, run events, status, limits, pause and resource causes, the manifest and approval wording, the transcript and work lines |
| 4 | Branch work, git & code work | branch, main line, repository | code work on branches: the git names and status, branch reads, bundles, packages in use, errors, work on the main line, repository connect and operations, and the commit, merge and update tools given to an agent |
| 5 | Location files, Knowledge & storage | location, Knowledge page, file reference | the files at a location (project, person, organisation): the file methods, find, Knowledge and skills scans, page rules and link checks, file kinds and sniffing, upload paths, and the storage location reference |
| 6 | Packages, skills & agent harness | Package, Skill, harness plugin | agent content delivered by digest (packages), the skill identity, manifest, fingerprint and version rules, the skill-proposal tool, and what is written for the agent harness |
| 7 | Agent file tools | read, write, edit, grep tools | the file tools agents use inside their boundary: read, write, edit and grep, their path checks, refusals and verified file-system access |
| 8 | Workflows | workflow definition | the workflow definition format and its parser, parameters and names, host and path patterns, masks, run states, version hash, GitHub permissions, and the workflow tools given to agents, with the workflow-run wire shapes |
| 9 | Live preview & dev-server previews | live preview, preview | running and reaching a workspace's dev server and a branch's live app: its methods and refusals, app and service files, install scripts, capacity, canonical forms and guards, and the Fleet Console's view of previews |
| 10 | Host service: signed envelopes & crypto | host envelope, join code, move check | the host service's signed and sealed commands: keys, envelopes, replay protection, join codes and bindings, the move check, transfer, and the operations the console may send |
| 11 | Host: fleet records & operations | fleet record, host figures | what the Fleet Console shows and does about a machine: fleet records, figures, hq facts, stopping, scheduled changes, versions, causes, export downloads, and the Agenthix Cloud operations |
| 12 | Cloud connection & sign-in | hq-to-Cloud connection | how an organisation's hq connects to Agenthix Cloud: its address, connection and state, the pledge, sign-in (PKCE) and the checks on the identity token, keys for model access, and the Cloud protocol version |
| 13 | Client API | client wire shapes | the shapes that browser and mobile clients exchange with hq: agents, boards, conversations and their sockets, people, projects, rooms, runs, tasks, voice, the workplace, with their JSON guards |
| 14 | Model catalogue, providers, pricing & billing | model list, price list, provider | which models exist and what they cost: the model list and its generator, the price lists and pricing, voice prices, providers and their resolution, and the billing ledger and profiles |
| 15 | Domain model & shared helpers | Task, Project, Board, Agent types | the entity types and small pure helpers every module shares: tasks, projects, boards, products, programs and agents; status and priority; identifiers and slugs; validation; time zones; formatting; dashboard types |
| 16 | Feature flags, ports, naming, logging & test support | FeatureFlag, port plan, log line | feature flags with stages and their release dates and test switches, the port plan, product naming, the rolling log with redaction and log queries, and the helpers tests use to switch a feature on |

---

## Domain scopes (files + operations)

### 1. Control channel, versioning & site methods
- **Files (20):** `snapshot/` (client.json, cloud.json, host.json, relay.json, site.json); `src/protocol/` (channelMessages.ts, combinedRead.ts, compatibility.ts, connection.ts, content.ts, contentMux.ts, hqAddress.ts, index.ts, membership.ts, siteData.ts, siteDiagnostics.ts, siteHealth.ts, siteMethods.ts, siteRegistration.ts, siteRestore.ts)
- **Ops:** `SITE_PROTOCOL_VERSION`, `parseProtocolVersion`, `checkProtocolCompatibility`, `protocolRefusalMessage`, `peerRefusalMessage`, `HQConnectionMessage` and its payloads, `SiteMethods` (`SiteMethodName`, `SiteMethodParams`, `SiteMethodResult`), `SiteContentMethods`, `StreamMux`, `CombinedRead`, `SiteHealth`, `parseSiteRestoreReport`, `MembershipMethod`, `SiteDataMethod`
- **Note:** Consumed by `hq`, `site`, `console`. The snapshot files are what the protocol-snapshot tests compare the exported shapes against (the comparison code in `src/__tests__/protocolSnapshot/` is test support, so excluded); a shape change moves the version per `docs/architecture/versioning.md`.

### 2. Capability tokens, run credentials & relay tickets
- **Files (19):** `src/protocol/` (appStream.ts, capability.ts, claudeLogin.ts, credential.ts, relayFiles.ts, runProvider.ts, usageReport.ts); `src/relay/` (appDoor.ts, appTickets.ts, byteRange.ts, door.ts, index.ts, previewAddress.ts, protocol.ts, rs256.ts, streamHead.ts, tokens.ts, verifyAppTicket.ts, verifyToken.ts)
- **Ops:** `IdentityTokenClaims`, `CapabilityClaims`, `CapabilityRenewRequest`/`Result`, `HqDataRequest`/`Response`, `ToolPermission`, `parseCapabilityRunner` and the other capability parsers, `RunCredential` (subscription and API-key forms), `RunProviderDescriptor`, `CloudAiTokenForSite`, `ClaudeLoginStart*`/`Finish*`, `UsageReport`, `RelayDoor`, the relay protocol messages, `RelayTokenType`, `readAppTicket`, `readBundleTicket`, `readTicketRoute`, `parseCompactJwt`, `JsonWebKeySet`, RS256 verification, `parseByteRange`, `refusalHead`, `newAppId`, `isAppId`, `previewPatternForDomain`
- **Note:** **Security-sensitive:** every token format, signature check and expiry/audience rule is here (`capability.ts`, `relay/rs256.ts`, `relay/tokens.ts`, `relay/verifyToken.ts`, `relay/verifyAppTicket.ts`, `relay/appTickets.ts`, `credential.ts`). Consumed by `hq`, `site`, and the relay.

### 3. Runs, sessions & transcript
- **Files (20):** `src/protocol/` (activeRuns.ts, approvalWording.ts, contextUse.ts, conversationOrder.ts, runFailureReason.ts, runFeed.ts, runLimits.ts, runList.ts, runManifest.ts, runPause.ts, runResource.ts, runUsage.ts, runtimeData.ts, runtimeEvents.ts, runtimeParams.ts, sessionState.ts, sharedSessions.ts, transcript.ts, workLine.ts, workSteps.ts)
- **Ops:** `RuntimeMethod` and its params and results, `SessionSeed`, `RunStatusEvent`, `SessionPatchEvent`, `RunWaitingEvent`, `RunLimits`, `PendingManifest`, `ApprovedManifest`, `RiskRule`, `approvalItems`, `approvalAnswer`, `plainFailureReason`, `runFeedKey`, `parseRunPageCursor`, `parseRunResourceShortage`, `TranscriptEntryKind` and its detail types, `foldSteps`, `canonicalToolName`, `orderTranscript`, `latestFailure`, `contextShare`
- **Note:** Consumed by `hq`, `site`, `console-web`-adjacent clients through `@agenthix/core`.

### 4. Branch work, git & code work
- **Files (15):** `src/codeWork/` (codeWorkPrompt.ts, commitTool.ts, index.ts, mergeTool.ts, updateTool.ts); `src/protocol/` (branchBundles.ts, branchErrors.ts, branchPackages.ts, branchReads.ts, branchWork.ts, codeWork.ts, gitNames.ts, gitStatus.ts, mainWork.ts, repoWork.ts)
- **Ops:** `BranchWorkErrorCode`, `encodeBranchWorkError`, `decodeBranchWorkError`, `BranchPackageUseParams`, `GitStatusParams`, `GitInitParams`, `RepoWorkMethod`, `RepoConnectParams`, `RunOtherBranch`, `RunCodeWork`, the commit, merge and update tool definitions, the code-work prompt text
- **Note:** Consumed by `hq` and `site`.

### 5. Location files, Knowledge & storage
- **Files (23):** `src/files/` (contract.ts, index.ts, kind.ts, open.ts, refs.ts, sniff.ts, uploadPaths.ts); `src/knowledge/` (changes.ts, frontMatter.ts, index.ts, limits.ts, links.ts, pageNames.ts, problems.ts, rules.ts); `src/protocol/` (fileAbout.ts, locationFiles.ts, locationFind.ts, locationKnowledge.ts, locationSkills.ts); `src/storage/` (agenda.ts, index.ts, locationRef.ts)
- **Ops:** `LocationFileMethod`, `KnowledgeGrepParams`, `KnowledgeOwnerRef`, `KnowledgeChangeKind`, `FileAboutParams`, the Knowledge page-name, front-matter, link and limit rules (`rules.ts`, `problems.ts`), file kind detection (`kind.ts`, `sniff.ts`), `uploadPaths`, `refs`, `open`, the storage location reference and agenda
- **Note:** **Security-sensitive:** page names, link targets and upload paths decide what may be read or written (`knowledge/pageNames.ts`, `knowledge/links.ts`, `files/uploadPaths.ts`, `files/sniff.ts`). Consumed by `hq`, `site`, `console-web`.

### 6. Packages, skills & agent harness
- **Files (12):** `src/assets/` (fingerprint.ts, identity.ts, index.ts, manifest.ts, semver.ts, skillTools.ts); `src/harness/` (index.ts, openCodePlugin.ts, openCodeSkills.ts, platformToolsInstructions.ts, processTag.ts); `src/protocol/` (packages.ts)
- **Ops:** `PackageContents`, the package digest input, `PackageKind`, skill identity, `semver` helpers, asset `manifest` and `fingerprint`, `propose_skill` tool definition, harness plugin and skill files, platform tools instructions, `processTag`
- **Note:** The package digest is what hq and a site must agree on; a change moves the protocol version.

### 7. Agent file tools
- **Files (13):** `src/fileTools/` (edit.ts, grep.ts, grepArgs.ts, grepGuards.ts, grepOutput.ts, index.ts, paths.ts, read.ts, refusals.ts, systemFdPaths.ts, textFile.ts, verifiedFs.ts, write.ts)
- **Ops:** `read`, `write`, `edit`, `grep` tool implementations and definitions, `paths`, `refusals`, `verifiedFs`, `systemFdPaths`, `textFile`, `grepArgs`, `grepGuards`, `grepOutput`
- **Note:** **Security-sensitive:** path containment, symbolic-link and system-descriptor refusals (`paths.ts`, `verifiedFs.ts`, `systemFdPaths.ts`, `grepGuards.ts`). Exported as `@agenthix/core/file-tools`; consumed by `site`.

### 8. Workflows
- **Files (14):** `src/protocol/` (workflowRuns.ts); `src/workflows/` (agentTools.ts, definition.ts, githubPermissions.ts, hosts.ts, index.ts, maskForms.ts, names.ts, parameters.ts, parse.ts, paths.ts, patterns.ts, runStates.ts, versionHash.ts)
- **Ops:** `parseWorkflowDefinition`, `parseWorkflowDuration` and the definition types, parameter validation, `WorkflowRunState`, version hash, mask forms, host and path patterns, the workflow agent tools (`agentTools.ts`), `WorkflowWireFile`
- **Note:** **Security-sensitive:** what a workflow may reach (`hosts.ts`, `paths.ts`, `patterns.ts`, `githubPermissions.ts`, `maskForms.ts`). Consumed by `hq` and `site`.

### 9. Live preview & dev-server previews
- **Files (18):** `src/host/` (livePreviews.ts, previews.ts); `src/livePreview/` (appTools.ts, apps.ts, canonical.ts, capacity.ts, guard.ts, index.ts, installScripts.ts, livePreview.ts, livePreviewRequest.ts, serviceValues.ts, services.ts, servicesFile.ts); `src/protocol/` (livePreviewApps.ts, livePreviewParse.ts, livePreviews.ts, preview.ts)
- **Ops:** `PreviewMethod` and its params, `LivePreviewRefusalCode`, `LivePreviewAppStartParams`, the `parseLivePreview*Params` parsers, the app and services file formats, install script rules, capacity rules, the app tools
- **Note:** The parsers validate what a caller sends to a site: security-sensitive. Behind an experimental feature flag. Consumed by `hq`, `site`, `host`, `console`.

### 10. Host service: signed envelopes & crypto
- **Files (17):** `src/host/crypto/` (envelope.ts, index.ts, join.ts, keys.ts, moveCheck.ts, moveCheckClient.ts, replay.ts, transfer.ts, webCrypto.ts); `src/host/` (envelope.ts, index.ts, join.ts, moveCheck.ts, operationParse.ts, operations.ts, relay.ts, transfer.ts)
- **Ops:** `HostKeys`, seal and open of envelopes (`SealOptions`, `OpenResult`), `EnvelopeReplayGuard`, `generateJoinCode`, `generateConsoleCode`, `verifyHostJoinBinding`, `verifyConsoleJoinBinding`, `moveTagMatches`, `MoveCheckState`, the host operation set and its parser, the host and console link versions
- **Note:** **Security-sensitive:** all signing, sealing, replay and pairing logic for host management. Exported as `@agenthix/core/host-crypto`; consumed by `host`, `console`, `hq`.

### 11. Host: fleet records & operations
- **Files (11):** `src/host/` (cloud.ts, cloudOperations.ts, cloudRemoteAccess.ts, exportDownload.ts, figures.ts, fleetRecord.ts, hqFacts.ts, scheduledChange.ts, siteCauses.ts, stopping.ts, versions.ts)
- **Ops:** `FleetActivityPage`, `FleetNotice`, `HqAccount` and their parsers (`fleetRecord.ts`), the figures and hq-facts shapes, the stop word, `ScheduledChange` and `parseScheduledChangeNotice`, `SiteCause` and `parseSiteCause`, version reports, the cloud operation and remote-access shapes, export download
- **Note:** Consumed by `host`, `console`, `console-web`.

### 12. Cloud connection & sign-in
- **Files (12):** `src/cloud/` (ai.ts, aiKeys.ts, answers.ts, connection.ts, hqAddress.ts, hqState.ts, index.ts, pledge.ts, signIn.ts, version.ts); `src/cloud/crypto/` (index.ts, signIn.ts)
- **Ops:** `parseHqCloudState`, `parseCloudConnecting`, `parseCloudOrganisationConnection`, `cloudHqAddressOf`, `configuredCloudUrl`, `checkHqCloudProtocol`, `CloudProtocolRefusal`, `CloudBearerError`, `CloudPledgeStatus`, `newCloudFlowValue`, `checkCloudIdToken`, `cloudAssertionClientId`, `CloudConnectionKeys`, `CloudAssertionCheck`
- **Note:** **Security-sensitive:** `crypto/signIn.ts`, `crypto/index.ts`, `signIn.ts`, `aiKeys.ts`. Exported with `@agenthix/core/cloud-crypto`; consumed by `hq`, `console`.

### 13. Client API
- **Files (19):** `src/client/` (agents.ts, boards.ts, conversation.ts, conversationSocket.ts, conversationWork.ts, index.ts, json.ts, mobileApp.ts, people.ts, projects.ts, protocol.ts, rooms.ts, runEvents.ts, runs.ts, taskSession.ts, tasks.ts, voice.ts, workplace.ts, workspaceSocket.ts)
- **Ops:** `@agenthix/core/client` exports: the conversation and workspace socket event types, run events, the mobile app's shapes, `json` parsing helpers, project, board, task, agent and people wire types
- **Note:** Exported as `@agenthix/core/client`; consumed by `hq`, `console-web`, and the mobile app.

### 14. Model catalogue, providers, pricing & billing
- **Files (14):** `scripts/` (generate-model-list.mjs); `src/billing/` (index.ts, ledger.ts, profiles.ts); `src/models/` (modelList.ts, openCodeModels.generated.ts, priceList.ts, pricing.ts, voicePrices.ts); `src/providers/` (index.ts, modelLists.ts, providers.ts, records.ts, resolver.ts)
- **Ops:** the model list and `generate-model-list`, `priceList`, `pricing` helpers, `voicePrices`, provider records and `resolver`, model lists per provider, billing `ledger` and `profiles`
- **Note:** Consumed by `hq`, `site`, `console-web`. `openCodeModels.generated.ts` is generated by the script.

### 15. Domain model & shared helpers
- **Files (17):** `src/` (dashboard.ts, index.ts); `src/models/` (agent.ts, board.ts, index.ts, product.ts, program.ts, project.ts, task.ts); `src/shared/` (derive.ts, exactType.ts, format.ts, identifiers.ts, index.ts, status.ts, timezone.ts, validate.ts)
- **Ops:** `Task`, `Project`, `Board`, `Agent` and related types, `groupTasksByStatus`, `countTasksByStatus`, `isOverdue`, `timeAgo`, `statusLabel`, `deriveSlug`, `deriveProjectKey`, `normalizeTimezone`, `validateTaskTitle`, `validateProjectKey`, `validateSlug`, `validateEmail`, the root barrel `src/index.ts`
- **Note:** Validators here are the shared first check of user input. Consumed by every module.

### 16. Feature flags, ports, naming, logging & test support
- **Files (16):** `src/logging/` (index.ts, logLine.ts, logQuery.ts, redact.ts, rollingLog.ts); `src/naming/` (branding.ts, index.ts); `src/ports/` (index.ts, livePreviewPart.ts, ports.ts); `src/shared/` (featureFlagReleases.ts, featureFlags.ts, featureTestSwitches.ts); `src/testing/` (experimentalFailures.ts, index.ts, withFeature.ts)
- **Ops:** `FeatureFlag`, `FeatureStage`, `flagsOverdue`, `isSwitchedOnForTest`, the port plan (`ports.ts`), branding names, `redact`, `logLine`, `logQuery`, `rollingLog`, `withFeature`
- **Note:** **Security-sensitive:** `logging/redact.ts` decides what is kept out of logs. Every port comes from `ports.ts`. `src/testing` is exported as `@agenthix/core/testing`.

## Excluded from all domains

Test files (`*.test.ts`) and test support (`__tests__/` folders, including `src/__tests__/protocolSnapshot/`, `src/fileTools/__tests__/helpers.ts`, `src/relay/__tests__/tokenSigner.ts`, `src/workflows/__tests__/fixtures.ts`, `src/testing/__tests__/`, `src/ports/__tests__/raw.d.ts`); build and package configuration (`.gitignore`, `package-lock.json`, `package.json`, `scripts/check-package.mjs`, `tsconfig.build.json`, `tsconfig.json`, `vitest.config.ts`); `dist/` and `node_modules/`. The check script `scripts/check-package.mjs` verifies the built package and is tooling, not product behaviour.
