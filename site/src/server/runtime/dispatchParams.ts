/**
 * Zod wire schemas for the dispatch/control channel handlers
 * (dispatchHandler.ts) — split out at the file-size line (plan 5d-2 task 8;
 * see dispatchHandler.ts's own header for the validation-boundary rationale).
 */
import { z } from 'zod'
import { APPROVALS, SESSION_TYPES, WORKSPACE_OWNER_TYPES, PACKAGE_KINDS, PACKAGE_KEY_PATTERN, PACKAGE_DIGEST_PATTERN, RUN_TIME_LIMIT_MINUTES_BOUNDS, RUN_TURN_LIMIT_BOUNDS, TASK_COMMENTS_FOR_RUN_MAX, TASK_COMMENT_TEXT_MAX } from '@agenthix/core'
import { BRANCH_LIST_MAX, isCopyId, isGitBranchName } from '@agenthix/core'
import type { AiProviderVendor, RunCancelReason } from '@agenthix/core'
import { gitPerson, workspaceRef } from '../branches/branchSchemas'

export const packageRefParams = z
  .object({
    kind: z.enum(PACKAGE_KINDS),
    key: z.string().regex(PACKAGE_KEY_PATTERN),
    digest: z.string().regex(PACKAGE_DIGEST_PATTERN),
  })

export const runPackagesParams = z
  .object({ agent: packageRefParams, org: packageRefParams.nullable(), platform: packageRefParams })

const providerId = z.string().min(1).max(100)
const API_KEY_VENDORS = ['anthropic', 'openai', 'google', 'openrouter', 'openai_compatible', 'assemblyai', 'inworld'] as const satisfies readonly Exclude<AiProviderVendor, 'cloud'>[]

// A run's provider descriptor (core's RunProviderDescriptor). A keyless
// OpenAI-compatible endpoint carries an empty key and names its address; every
// other API key is a key and names none.
const providerDescriptorParams = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('api_key'),
    providerId,
    vendor: z.enum(API_KEY_VENDORS),
    apiKey: z.string(),
    baseUrl: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('subscription'),
    providerId,
    vendor: z.literal('anthropic'),
    oauthJson: z.string().min(1),
    grantId: z.string().min(1).max(100),
    loginId: z.string().min(1).max(100),
  }),
  z.object({
    kind: z.literal('cloud'),
    providerId,
    vendor: z.literal('cloud'),
    api: z.enum(['anthropic', 'openai']),
    baseUrl: z.string().url(),
  }),
]).refine(
  d => d.kind !== 'api_key' || (d.vendor === 'openai_compatible' ? !!d.baseUrl : !!d.apiKey && !d.baseUrl),
  { message: 'provider descriptor does not fit its vendor' },
)

// What the run is given to reach its models (core's RunModelAccess, runAccess.ts).
const modelAccessParams = z.object({
  model: z.object({ providerId, model: z.string().max(300) }),
  provider: providerDescriptorParams,
  others: z.array(providerDescriptorParams).max(20).optional(),
  // Empty while hq has no billing profile yet.
  billingProfileId: z.string().max(100),
})

export const agentConfigParams = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    handle: z.string().min(1),
    role: z.string().nullable(),
    runtime: z.string(),
    approval: z.enum(APPROVALS),
    defaultModel: z.string(),
    allowedTools: z.unknown(),
    allowedBashPatterns: z.unknown(),
    isKernel: z.boolean(),
  })
  .passthrough()

export const runContextParams = z
  .object({
    agent: agentConfigParams,
    chat: z
      .object({
        sessionContext: z.string().nullable(),
      })
      .optional(),
    task: z
      .object({
        taskId: z.string().min(1),
        taskKey: z.string(),
        title: z.string(),
        description: z.string(),
        projectId: z.string().min(1),
        projectName: z.string(),
        projectSlug: z.string(),
        boardName: z.string(),
        columns: z.string(),
        // The newest comments not by this agent; runTask keeps those since its last run.
        comments: z
          .array(z.object({ author: z.string().max(200), at: z.string().datetime(), text: z.string().max(TASK_COMMENT_TEXT_MAX) }))
          .max(TASK_COMMENTS_FOR_RUN_MAX)
          .optional(),
      })
      .optional(),
    // A run reaches one owner's storage, so the only mount input is that
    // owner's slug — there is no owner set here to widen the mount set with.
    mounts: z.object({
      ownerSlugs: z.record(z.string(), z.string()),
    }),
    riskRules: z.unknown(),
    // The run's providers (core's RunModelAccess); absent when hq found none, and `credentialProblem` says why.
    modelAccess: modelAccessParams.optional(),
    // Why hq found nothing the run may use; the run fails with this text.
    credentialProblem: z.string().min(1).max(2000).optional(),
    // The org's web-search key for this turn; absent when it has none. Carried
    // on the run's context for the `web_search` tool, never put in a container.
    webSearchKey: z.string().min(1).optional(),
    packages: runPackagesParams,
    // The person the run is on behalf of; absent when there is none or they set no timezone.
    person: z.object({ timezone: z.string().min(1).max(64) }).optional(),
    // What memory found for this run at its start; the site writes it as a file in the run's staging.
    memory: z
      .object({
        items: z.array(z.object({
          key: z.string().min(1).max(200),
          kind: z.string().min(1).max(32),
          title: z.string().min(1).max(300),
          body: z.string().max(2000),
        })).max(50),
        hinted: z.array(z.object({ key: z.string().min(1).max(200), title: z.string().min(1).max(300) })).max(50),
      })
      .optional(),
    // A run on a code workspace: its branch's copy is its working folder (core's RunCodeWork). Checked
    // again against the site's own record of the copy when the run starts (`codeWorkRun.ts`).
    codeWork: z
      .object({
        workspace: workspaceRef,
        copyId: z.string().refine(isCopyId),
        branch: z.string().refine(isGitBranchName),
        main: z.string().refine(isGitBranchName),
        behindMain: z.number().int().min(0),
        otherBranches: z
          .array(z.object({
            name: z.string().refine(isGitBranchName),
            whose: z.string().max(300),
            ahead: z.number().int().min(0),
            agentWorking: z.string().max(200).nullable(),
          }))
          .max(BRANCH_LIST_MAX),
        // Whom the run-end commit names: the agent, and the person in an `On-behalf-of:` line.
        author: gitPerson,
        onBehalfOf: gitPerson.nullable(),
        // A run on a branch whose live preview is on this site, in that live preview's own copy (`livePreviewRuns.ts`).
        livePreviewId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
      })
      .optional(),
  })
  .passthrough()

export const runDispatchParams = z
  .object({
    kind: z.enum(['chat', 'task']),
    startedBy: z.enum(['person', 'pulse', 'schedule', 'agent']),
    capabilityJwt: z.string().min(1),
    session: z
      .object({
        id: z.string().min(1),
        sessionKey: z.string().min(1),
        agentId: z.string().min(1),
        userId: z.string().min(1),
        sessionType: z.enum(SESSION_TYPES),
        taskId: z.string().min(1).nullable(),
        title: z.string().max(500).nullable(),
        model: z.string().nullable(),
        metadata: z.record(z.string(), z.unknown()),
        primaryOwnerType: z.enum(WORKSPACE_OWNER_TYPES).nullable(),
        primaryOwnerId: z.string().min(1).nullable(),
        primaryWorkspaceId: z.string().min(1).nullable(),
        runtime: z.string().min(1).nullable(),
        createdAt: z.string().datetime(),
      })
      ,
    inputText: z.string(),
    // The skill the person picked with `/`: read by its shape alone (core's pickedSkillOf), and a malformed one is
    // dropped rather than refusing the run. Whether it is staged is checked when the turn's skills are.
    skill: z.unknown().optional(),
    // Empty only when hq found no model the run may use: the run is still
    // recorded, and fails with hq's `credentialProblem` (runLaunch.ts).
    model: z.string(),
    hideUserMessage: z.boolean(),
    context: runContextParams,
    // The run's time and turn limits (core's RunLimits).
    runLimits: z
      .object({
        timeLimitMinutes: z.number().int().min(RUN_TIME_LIMIT_MINUTES_BOUNDS.min).max(RUN_TIME_LIMIT_MINUTES_BOUNDS.max),
        turnLimit: z.number().int().min(RUN_TURN_LIMIT_BOUNDS.min).max(RUN_TURN_LIMIT_BOUNDS.max),
      })
      ,
    // The person the run is on behalf of, and the author of its message; absent when no person is behind the run.
    onBehalfOfUserId: z.string().min(1).max(100).optional(),
    // hq's routine whose firing this run is: a chat run only, recorded on the run.
    routineId: z.string().min(1).max(100).optional(),
  })
  // A chat dispatch missing context.chat would otherwise silently degrade to
  // a context-free prompt (chatExecution.ts's `context.chat ?? { ... null ... }`
  // fallback exists for defensive typing, not because hq is ever expected to
  // omit it) — a state hq's own ChatRunner could never reach, since it always
  // builds `context.chat` for a chat dispatch (dispatchService.ts's buildContext).
  // Caught here, at the boundary, with a message that names exactly what's missing.
  .superRefine((data, ctx) => {
    if (!data.model && !data.context.credentialProblem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['model'],
        message: 'a run with no model must carry context.credentialProblem, the reason it has none',
      })
    }
    if (data.kind === 'chat' && !data.context.chat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['context', 'chat'],
        message: 'a chat dispatch requires context.chat — hq\'s ChatRunner never dispatches without it',
      })
    }
    if (data.routineId !== undefined && (data.kind !== 'chat' || data.session.taskId !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['routineId'],
        message: "a routine's run is a chat run with no task",
      })
    }
  })

export const runIdParams = z.object({ runId: z.string().min(1) })
/** `decidedBy`: the person who approved, as hq knows them. */
export const runApproveParams = z.object({ runId: z.string().min(1), decidedBy: z.string().min(1).optional() })

/**
 * `run.cancel`'s params (core's `RunCancelParams`). `reason` is optional and
 * additive over `runIdParams`; the values the site understands are
 * `'interrupted'` (hq's interrupt-if-busy path), `'withdrawn'` (a waiting
 * message cancelled) and `'paused'` (a scheduled change about to happen) —
 * an unrecognised string is read as no reason, so a Stop is never refused for a
 * reason a newer hq knows. `by` is the name of the person who stopped it,
 * or for a pause, the change that paused it.
 */
const CANCEL_REASONS = ['interrupted', 'withdrawn', 'paused'] as const satisfies readonly RunCancelReason[]
export const runCancelParams = z
  .object({ runId: z.string().min(1), reason: z.preprocess(r => (CANCEL_REASONS.includes(r as RunCancelReason) ? r : undefined), z.enum(CANCEL_REASONS).optional()) as z.ZodType<RunCancelReason | undefined>, by: z.string().min(1).max(200).optional() })
/** `replaced`: the request was replaced by something newer, not answered by a person. */
export const runRejectParams = z
  .object({ runId: z.string().min(1), reason: z.string().optional(), replaced: z.literal(true).optional(), decidedBy: z.string().min(1).optional() })
export const agentStopParams = z.object({ handle: z.string().min(1) })
/** The handler derives the directory from this site's own root: a `path` (or anything
 *  else) in the params is dropped by the parse and never reaches it. */
export const agentRemoveDirectoryParams = z.object({ handle: z.string().min(1) })
export const agentPromptPreviewParams = z
  .object({
    agent: agentConfigParams,
    sessionType: z.enum(SESSION_TYPES),
    packages: runPackagesParams,
  })
