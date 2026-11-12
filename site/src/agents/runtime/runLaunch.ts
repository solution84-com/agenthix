/**
 * Split out of AgentEngine.ts's `processRun` (plan 5d-2 T13 hygiene, byte-preserving
 * — moved verbatim, only `this`/outer-scope plumbing adjusted) to keep that file
 * under the repo's 500-line convention, at the seam 5d-1 already used elsewhere for
 * this file (runQueue.ts, locationResolver.ts, containerPrep.ts, runPersistence.ts):
 * LAUNCH/CONTEXT ASSEMBLY (capability verification, fetching + marking RUNNING,
 * resolving agent/session/location, preparing the container, selecting the runtime,
 * building system prompt + MCP config + the RunContext itself) here; the
 * RUN-PROCESSING PIPELINE (the streaming loop, persistence, terminal frame, error
 * handling) stays in AgentEngine.ts's `processRun`.
 *
 * `run`, `containerName`, `runToken` and `controller` are surfaced via the mutable
 * `sink` parameter — not only in the success return — because processRun's own
 * `catch`/`finally` need them even when THIS function throws partway through (e.g.
 * a runner-claim refusal, or a container-prep failure after the run row was
 * already fetched and marked RUNNING): the exact same "declared outside try,
 * assigned as soon as each value exists" contract processRun's own body had before
 * the split, now carried across a function boundary instead of within one scope.
 */
import { selectRuntime } from './selectRuntime'
import { resolveAgentContext } from './agentUtils'
import { Logger } from '../../server/utils/logger'
import { runModel } from './runModel'
import { CLAUDE_SDK_RUNTIME, type AgentRuntime, type ApprovedManifest, type RunContext, type RunOptions } from './types'
import { AgentPromptBuilder } from '../AgentPromptBuilder'
import type { ContainerMounts } from '../AgentPromptBuilder'
import { resolveRunPackageDirs } from '../../packages/runPackages'
import { resolveBoundaryOverrideDir } from '../../packages/boundaryOverrides'
import { runSkillInputs } from './runSkillInputs'
import { loadPromptContent } from '../promptContent'
import { getAgentFacingSiteUrl } from '../../server/siteConfig'
import { runAccessOf } from '../../server/modelRelay/runAccess'
import { resolvePrimaryLocation, getLocationCwd } from '../../server/storage/primaryLocationService'
import { untilSwitched } from '../../server/storage/codeSpace'
import { prisma } from '#db'
import { siteInDemoMode } from '../../demo/runtime/noContainers'
import { siteStream } from './SiteStreamEmitter'
import { verifyHqToken } from '../../server/identity/verifyHqToken'
import { requireRunnerForBoundary } from '../../server/identity/runnerClaim'
import type { CapabilityHolder } from './capabilityRenewal'
import { issueRunToken } from '../../server/runtime/runTokens'
import { registerGateRun } from './toolGateRuns'
import { PLATFORM_AUTHORIZATION, PLATFORM_TOKEN_ENV } from './agentImage'
import { markCodeWorkspaceFolders } from './codeWorkspaceMounts'
import type { AgentSession } from '@prisma/client'
import type { CapabilityClaims, RunContextPayload } from '@agenthix/core'
import { prepareAgentContainer, resolveContainerKey } from './containerPrep'
import { runnerClaudeHome, resolveVisibleClaudeHome } from './boundaryClaudeHome'
import { joinSubscriptionLogin, type SubscriptionMembership } from './subscriptionLogins'
import { resolveRunAgenda } from './locationResolver'
import { agentContainerManager } from './AgentContainerManager'
import { requireResumableSession } from './sessionExistenceCheck'
import { ReadableRunError } from './readableRunError'
import { readContainerCounters, type ContainerCounters } from './runResourceCause'
import { homeIsShared, writePinnedMemory } from './pinnedMemoryFiles'
import { runStagingOf } from './runStaging'
import { resolveCodeWork, startCodeWork, type CodeWorkRun } from '../../server/branches/codeWorkRun'
import { withCodeWorkTools } from '../../server/mcp/forwardedCodeSchemas'
import { withAppTools } from '../../server/mcp/forwardedAppSchemas'

const logger = new Logger('AgentEngine')

/** Mutated in place as soon as each value exists — see this module's own doc comment. */
export interface RunLaunchSink {
  run: Awaited<ReturnType<typeof prisma.agentRun.findUnique>>
  containerName: string | null
  runToken: string | null
  /** Set for a run given a subscription hq granted: the run is counted into
   *  that login's copies on this site, which are kept in step and reported
   *  back against the grant (subscriptionLogins.ts) — for a person's, a
   *  project's or the organisation's login alike. */
  subscription: SubscriptionMembership | null
  /** The runner's Claude home, as this process sees it. Assigning it counts the
   *  run into the home (runCleanup.ts's `createRunLaunchSink`), and the run's
   *  credential leaves the home when the last run counted there ends — the
   *  document would otherwise outlive the authority that granted it. Null only
   *  before the launch reached the point of resolving one. */
  claudeHome: string | null
  /** The container's resource counters as the run started, for a failure to be put down to memory or processes
   *  (runResourceCause.ts). Read without waiting; null before the container is ready. */
  resourceBaseline: Promise<ContainerCounters | null> | null
  /** The run's pinned memory file, which `releaseRunResources` removes when the run ends (pinnedMemoryFiles.ts). */
  pinnedMemory?: { staging: string; sessionId: string } | null
  /** The runner's run staging as this process sees it, which holds the conversation's staged skills. */
  runStaging?: string | null
  /** A run on a branch's copy: swept while it goes, and its branch brought back at its end (codeWorkRun.ts). */
  codeWork?: CodeWorkRun | null
}

export type RunLaunchResult =
  | { kind: 'skip' }
  | {
      kind: 'ready'
      run: NonNullable<Awaited<ReturnType<typeof prisma.agentRun.findUnique>>>
      agent: Awaited<ReturnType<typeof resolveAgentContext>>['agent']
      session: Awaited<ReturnType<typeof resolveAgentContext>>['session']
      context: RunContext
      resolvedModel: string
      runtime: AgentRuntime
      controller: AbortController
      containerName: string | null
      runToken: string | null
    }

export async function assembleRunLaunch(
  runId: string,
  options: Omit<RunOptions, 'queued'>,
  ctx: RunContextPayload,
  sink: RunLaunchSink,
  abortControllers: Map<string, AbortController>,
  /**
   * The run's session row, read ONCE by AgentEngine.run before the run was
   * queued and handed down here rather than read again. The queue key and this
   * run's container are both derived from its storage-location fields, and a
   * queue wait can run to minutes — a second read is what would let the two
   * disagree. Null when the row could not be read at all, which
   * `resolveAgentContext` turns into a failed run below, before any container
   * is prepared.
   */
  sessionRow: AgentSession | null,
): Promise<RunLaunchResult> {
  // 0. Verify the §2a capability hq minted for this run — the FIRST thing this
  // try block does, before any side effect: the RUNNING row write, the RUNNING
  // status frame, and the git-key cleanup below all happen only once this
  // succeeds (previously this ran after all three). Verification
  // (not minting) is this file's half after the execution-runtime extraction:
  // hq mints and hands over the JWT at dispatch; site's own verifyHqToken
  // (ADR-0044) verifies it, self-pinning the audience to this site's own
  // siteId — the same security property hq's `verifyHqToken(jwt, 'capability',
  // mintedClaims.siteId)` call had, reached a different way.
  const capabilityJwt = options.capabilityJwt
  const verified = await verifyHqToken(capabilityJwt, 'capability')
  const capability = verified as unknown as CapabilityClaims
  // A capability with no numeric `exp` claim is a protocol violation — hq
  // always signs one. Throwing (rather than defaulting to Date.now(), i.e.
  // instantly-expired) turns it into a FAILED run with a real error; silently
  // treating it as expired would null every in-run MCP resolve with nothing in
  // any log to explain why.
  if (typeof verified.exp !== 'number') {
    throw new Error(`Capability for run ${runId} carries no numeric exp claim — refusing to treat it as valid`)
  }
  const capabilityExpiresAt = verified.exp * 1000
  // Who the run is for, checked against the boundary it works in.
  const runner = requireRunnerForBoundary(verified, sessionRow)

  // Single holder instance for this run's capability — issueRunToken, the
  // renewal loop (AgentEngine.ts), and context.capability all reference THIS
  // object. startCapabilityRenewal mutates it in place; a copy anywhere would
  // silently detach that object from renewal (see runTokens.ts's doc comment).
  const capabilityHolder: CapabilityHolder = { jwt: capabilityJwt, expiresAt: capabilityExpiresAt }

  // 1. Fetch & verify
  const run = await prisma.agentRun.findUnique({ where: { id: runId } })
  sink.run = run
  if (!run || run.status !== 'PENDING') {
    logger.info(`Run ${runId} skipped (status: ${run?.status})`)
    return { kind: 'skip' }
  }
  // 2. Mark RUNNING
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date() }
  })
  siteStream.status({
    runId,
    sessionId: run.sessionId,
    taskId: run.taskId ?? null,
    agentId: ctx.agent.id,
    agentHandle: ctx.agent.handle,
    status: 'RUNNING',
    error: null,
    sessionPatch: options.sessionTitle ? { title: options.sessionTitle } : null,
    manifestPending: null,
  })

  // 3. Resolve context — agent config arrives pre-resolved (dispatch); the
  // session row was read once, before this run was queued, and threaded in.
  // A run with no session row fails HERE, which is before `prepareAgentContainer`
  // below: it never reaches a shared container.
  const { agent, session } = await resolveAgentContext(ctx.agent, { session: sessionRow })

  // 3-1. The exact package content hq dispatched, by digest. Content not in
  // the cache fails the run here — it never runs any other content (ruling P9).
  const packages = await resolveRunPackageDirs(ctx.packages)

  // 3a. Resolve primary location — the session's working directory (ADR-0039 §8).
  const primaryLoc = resolvePrimaryLocation(session)

  // 3a-1. A Claude SDK run with no model credential fails HERE, saying which
  // boundary it was for — before any container is prepared for it, and before
  // the SDK could fall through to whatever login happens to be seeded on this
  // machine (spec §6.3). The throw becomes this run's FAILED error verbatim
  // (AgentEngine.processRun's catch persists `error.message` and emits it in
  // the terminal frame), so the text is what the person reads. hq's own
  // `credentialProblem`, when it sent one, is more specific than this generic
  // text (it knows a subscription was skipped) and is shown instead.
  //
  // Gated on the runtime, not applied to every run: a subscription login is
  // the Claude runtime's alone, and OpenCode's own key check is its own.
  //
  // The runtime is the SESSION's, recorded when it was created (adr-0078): a
  // conversation never moves to the agent's current runtime. A session with
  // none recorded predates that and takes the agent's.
  const runtimeName = session.runtime ?? agent.runtime
  // The run's providers, from hq's descriptor (or an older hq's credential).
  const access = runAccessOf(ctx)
  // The demo's runs are scripted: no model is called, so no credential is needed.
  if (runtimeName === CLAUDE_SDK_RUNTIME && !access.credential && !siteInDemoMode()) {
    const boundaryKind = primaryLoc.ownerType === 'project' ? 'project' : 'person'
    throw new ReadableRunError(
      ctx.credentialProblem ??
        `No model credential is configured for this ${boundaryKind}. ` +
        `Add an API key for it, or a subscription login on your own settings page, and run this again.`,
    )
  }

  // Selected before anything is prepared, so an unknown or unavailable runtime
  // fails the run without a container having been started for it.
  const runtime: AgentRuntime = selectRuntime(runtimeName)

  // 3b. A boundary's disk overrides (P18).
  const boundaryOverride = await resolveBoundaryOverrideDir(primaryLoc, agent.id)
  // 3b-1. The skills hq named beside the packages, staged at each turn's start.
  const skills = runSkillInputs(ctx, primaryLoc, agent.id, typeof verified.userId === 'string' ? verified.userId : null)

  // One source of truth: a run inside a task session is task-scoped even when the
  // AgentRun row carries no taskId (chat/voice turns into a task session) — the
  // container's labels and the prompt both key off this one value.
  const effectiveTaskId = run.taskId ?? session.taskId ?? null

  // Resolve projectId — pre-rendered by hq's dispatch context (null for chat runs).
  const projectId = ctx.task?.projectId ?? null

  // 3c. Build the run's authorization context FROM THE VERIFIED CLAIMS (§0
  // above) — the capability is the authorization event (spec §2a), not
  // decoration. Authorization comes from the verified capability, not a second read of the
  // agent row — same values (hq's mint reuses the same coercion helpers), but
  // the capability is the authority. immediateApproval stays agent-sourced: it is
  // HITL run behavior, not authorization, and hq sends the run's effective approval
  // on the agent row (its boundary's narrowing applied). Computed here (before container prep)
  // because prepareAgentContainer needs bypassed/allowedTools/neverTools to
  // decide locationMode (spec §6.4).
  const bypassed = capability.permissions.bypassed
  const immediateApproval = agent.approval === 'immediate'
  const toolPermissions = capability.permissions.allowedTools
  const bashPermissions = capability.permissions.allowedBashPatterns
  const neverTools = capability.permissions.neverTools

  // 3d. Where the run works: its location's own directory.
  //
  // `workingTreeDir` is the run's working tree on this machine — the same
  // directory, read by the parts of the server that touch the disk themselves
  // rather than through the container.
  //
  // A run on a code workspace works in its branch's copy instead, checked against the site's own record of it.
  const codeWork = ctx.codeWork ? await resolveCodeWork(runId, ctx.codeWork, primaryLoc, options.features) : null
  if (codeWork) {
    await startCodeWork(codeWork)
    sink.codeWork = codeWork
  }
  // A workspace becoming a repository holds new runs in it until its main is in place (codeSpace.ts).
  await untilSwitched(primaryLoc.workspaceId)
  const workingTreeDir = codeWork ? codeWork.copyDir : await getLocationCwd(primaryLoc)

  // 3d-1. Which container this run belongs to — boundary × runner (ADR-0074)
  // — and therefore which harness home it gets. Resolved here rather than
  // inside `prepareAgentContainer` because a dev run has a home but no
  // container: the home is keyed the same way either way (spec §6.1 — nothing
  // agent-scoped is mounted), and the skills staged for the run live inside it.
  const containerKey = resolveContainerKey(
    primaryLoc,
    { bypassed, allowedTools: toolPermissions, neverTools },
    runner,
  )
  const claudeHome = {
    serverDir: runnerClaudeHome(containerKey),
    visibleDir: resolveVisibleClaudeHome(containerKey),
  }
  sink.claudeHome = claudeHome.serverDir
  const runStaging = runStagingOf(containerKey)
  sink.runStaging = runStaging.serverDir

  // A granted subscription is counted into its login's copies before the
  // container is prepared, so the write at launch can hand this run the
  // freshest copy on the site and the copy is watched from the start.
  sink.subscription = joinSubscriptionLogin(claudeHome.serverDir, access.credential)

  // 3e. Prepare the container, which binds the owner's folder once. It must
  // not reveal the site's host layout (E1): every bind destination is the
  // site's id-keyed path with the site root removed (ADR-0074).
  // The demo starts no container, whatever the isolation setting says.
  const containerResult = siteInDemoMode() ? null : await prepareAgentContainer(
    { handle: agent.handle, runtime: runtimeName },
    { id: session.id, sessionType: session.sessionType, userId: session.userId ?? null },
    effectiveTaskId,
    primaryLoc,
    { mounts: ctx.mounts, credential: access.credential },
    containerKey,
    codeWork ? { copyId: codeWork.copyId, livePreview: !!codeWork.livePreviewId } : null,
    {
      // A run that has to wait for its container to be made again says why (live preview spec, *Where the copy lives*).
      onWaitForBinds: (waiting) => siteStream.waiting({ runId, sessionId: session.id, taskId: effectiveTaskId, waiting, reason: 'branch' }),
      stillWanted: async () => (await prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true } }))?.status === 'RUNNING',
    },
  )
  const containerName = containerResult?.containerName ?? null
  sink.containerName = containerName
  if (containerName) agentContainerManager.markRunStart(containerName)
  if (containerName) sink.resourceBaseline = readContainerCounters(containerName)

  // 5. Build run context
  const controller = new AbortController()
  abortControllers.set(runId, controller)

  const priorEntryCount = await prisma.transcriptEntry.count({ where: { sessionId: session.id, role: 'ASSISTANT' } })
  await requireResumableSession(runtime, { session, isNewSession: priorEntryCount === 0, harnessHomeDir: claudeHome.serverDir, workingDirectory: containerResult?.primaryContainerPath ?? workingTreeDir, containerName })
  const resolvedModel = runModel(runtimeName, session.model, run.model, agent.defaultModel)

  // Build system prompt — AgentPromptBuilder is the single owner of all prompt content.
  // Called here (after prepareAgentContainer) so it receives complete context including
  // container mounts. See ADR-0001.
  const containerMounts: ContainerMounts | undefined = containerResult
    ? {
        // A run on a branch is told of main in its own section (codeWorkPromptText).
        locations: codeWork ? containerResult.mounts.folders : markCodeWorkspaceFolders(containerResult.mounts.folders, containerResult.mounts.readOnly ?? []),
        primaryContainerPath: containerResult.primaryContainerPath,
        // Task runs: label the cwd as the task working directory so the agent knows its role.
        ...(codeWork
          ? { primaryPathDescription: `your working copy of branch ${codeWork.branch}: work and commit here. The workspace's own folder is main and is read-only` }
          : primaryLoc.taskId
          ? { primaryPathDescription: 'task working directory — create and edit task files here. Project files and workspaces are also mounted.' }
          : {}),
      }
    : undefined
  // The person's agenda in the storage this run works in (close-out spec §6.1):
  // the host path the builder reads, and the path the run itself sees, which is
  // the one the prompt prints.
  //
  // Only a CHAT has one, which is prepareAgentContainer's own invoker rule a few
  // lines above, applied to the same field for the same reason: a task
  // session carries a userId too, but nobody is acting through it. On a
  // task it is whichever administrator a findFirst returned — neither the task's
  // owner nor its assignee — so an agenda named from it would put Now and Waiting
  // items in an arbitrary person's folder, readable by every member of a project
  // they may have nothing to do with.
  const agenda = session.sessionType === 'chat' && session.userId
    ? resolveRunAgenda(primaryLoc, session.userId)
    : null
  // The memory hq found for the run (or an older hq's pinned items), as a read-only file in the runner's run staging,
  // refreshed at every start (spec, Workers) and removed at its end. A project's own holds nothing about a person:
  // every member's task runs share it.
  sink.pinnedMemory = { staging: runStaging.serverDir, sessionId: session.id }
  const pinnedMemoryPath = await writePinnedMemory(
    { ...runStaging, shared: homeIsShared(containerKey.runner) }, session.id, ctx.pinnedMemory, ctx.memory,
  )
  const builder = new AgentPromptBuilder(agent, await loadPromptContent(packages, boundaryOverride, primaryLoc))
  const { systemPrompt } = await (() => {
    if (options.taskContext) return builder.buildTaskPrompt({ ...options.taskContext, containerMounts, person: ctx.person, pinnedMemoryPath, codeWork: codeWork ? ctx.codeWork : null })
    return builder.buildChatPrompt({ ...options.chatContext, containerMounts, agenda, person: ctx.person, pinnedMemoryPath, codeWork: codeWork ? ctx.codeWork : null })
  })()

  // Resolve MCP config
  let mcpServers = options.mcpServers
  const gitCredEnv: Record<string, string> = {}
  if (!mcpServers) {
    const siteUrl = getAgentFacingSiteUrl()
    if (siteUrl) {
      // §H4: the container carries an opaque run token — never the site key and
      // never the capability JWT. site's MCP handler (Task 8) resolves it to the
      // live capability, which the renewal loop refreshes in place, so long runs
      // never hold a stale bearer and the container never holds a durable credential.
      sink.runToken = issueRunToken(capabilityHolder, runId)
      mcpServers = {
        'platform': {
          type: 'http' as const,
          url: `${siteUrl}/mcp`,
          // Names the token's variable: the connection goes on the harness's command line (PLATFORM_TOKEN_ENV).
          headers: { Authorization: PLATFORM_AUTHORIZATION },
        },
      }
      // The harness's own environment carries the run token, which its platform connection reads, and which a
      // process that lives across turns has pointed at the conversation's (ClaudeSDKRuntime's
      // withConversationToken). The command launcher removes it from every command's environment.
      gitCredEnv[PLATFORM_TOKEN_ENV] = sink.runToken
      gitCredEnv.AGENT_HANDLE = agent.handle
    }
  }

  // Resolve approved manifest — present for task/chat runs after HITL approval
  const approvedManifest = run.approvedManifest
    ? (run.approvedManifest as unknown as ApprovedManifest)
    : undefined

  const context: RunContext = {
    runId,
    sessionId: session.id,
    // The RunContext's taskId identifies THIS run's own record (unused by either
    // runtime today — no authorization reads it), so it stays run.taskId rather
    // than effectiveTaskId; the fix above is scoped to authorization inputs.
    taskId: run.taskId ?? null,
    projectId,
    model: resolvedModel,
    isNewSession: priorEntryCount === 0,
    prompt: run.inputText,
    summarise: options.summarise,
    ...(options.pickedSkill ? { pickedSkill: options.pickedSkill } : {}),
    agent: {
      id: agent.id,
      handle: agent.handle,
      name: agent.name,
      systemPrompt,
      defaultModel: agent.defaultModel,
    },
    abortSignal: controller.signal,
    mcpServers,
    bypassed,
    immediateApproval,
    allowedTools: bypassed ? undefined : codeWork ? withAppTools(withCodeWorkTools(toolPermissions), options.features) : toolPermissions,
    allowedBashPatterns: bashPermissions,
    neverTools,
    approvedManifest,
    deferredManifest: options.deferredManifest,
    ...(effectiveTaskId ? { ownTask: { id: effectiveTaskId, key: ctx.task?.taskId === effectiveTaskId ? ctx.task.taskKey : null } } : {}),
    containerName: containerName ?? undefined,
    gitCredEnv: Object.keys(gitCredEnv).length > 0 ? gitCredEnv : undefined,
    // In dev (no container): native host path of the primary location.
    // In container mode: container-side path determined in prepareAgentContainer.
    cwd: containerResult?.primaryContainerPath ?? workingTreeDir,
    capability: capabilityHolder,
    credential: access.credential,
    fallbackCredentials: access.others,
    ...(access.billingProfileId ? { billingProfileId: access.billingProfileId } : {}),
    ...(options.features ? { features: options.features } : {}),
    webSearchKey: ctx.webSearchKey,
    riskRules: ctx.riskRules,
    packages,
    boundaryOverride,
    skills,
    claudeHome,
    runStaging,
    workingTreeDir,
    runLimits: options.runLimits,
    ...(codeWork ? { codeWork: { branch: codeWork.branch, copyId: codeWork.copyId, workspace: codeWork.placed.ref } } : {}),
  }

  logger.info(`Run ${runId} | runtime=${runtimeName} model=${resolvedModel}`)

  // Findable by run id until the run stops (AgentEngine's finally), for a call
  // that names the run only through its platform token: OpenCode's gate call,
  // and the platform tools the site serves itself.
  registerGateRun(context)

  return {
    kind: 'ready',
    run, agent, session, context, resolvedModel, runtime, controller,
    containerName, runToken: sink.runToken,
  }
}
