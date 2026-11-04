/**
 * The run context hq sends with a dispatch: the agent's resolved config and everything the site stages for the run.
 * Split out of `runtimeData.ts` when that file passed the repository's size limit; `runtimeData.ts` re-exports these
 * names. Type aliases, not interfaces, for the reason it gives.
 */
import type { FileSkillEntry, InstalledSkillEntry, PersonSkillEntry, RunPackages } from './packages.js'
import type { ApiKeyRunCredential, RunCredential } from './credential.js'
import type { RunModelAccess } from './runProvider.js'
import type { TaskCommentForRun } from './sharedSessions.js'
import type { Approval, BashPatternPermission, ToolPermission } from './capability.js'
import type { RiskRule } from './runManifest.js'
import type { RunCodeWork } from './codeWork.js'

/** The agent's config row, pre-resolved by hq at dispatch. */
export type AgentConfigPayload = {
  id: string
  name: string
  handle: string
  role: string | null
  runtime: string
  /** The run's effective approval: the strictest of the agent's own and its boundary's narrowing. */
  approval: Approval
  defaultModel: string
  /**
   * The run's effective tools and bash patterns — the agent's own with its boundary's narrowing applied, the same
   * resolution the capability is minted from. Each state per entry; a list of bare names gives each `always`; null
   * is the runtime's defaults (tools) or none (patterns). Read from a stored JSON column, so the site still reads it
   * through its own coercion (`coerceToolPermissions`), never trusting the form.
   */
  allowedTools: ToolPermission[] | string[] | null
  allowedBashPatterns: BashPatternPermission[] | string[] | null
  isKernel: boolean
}

export type RunContextPayload = {
  agent: AgentConfigPayload
  /** Chat-only. Carried no `userHandle` since the agenda stopped being keyed by
   *  one: the agenda is the person's within a location, and the member folder
   *  holding it is keyed by the immutable user id like every other storage path
   *  (close-out spec §6.1). Nothing else ever read the handle. */
  chat?: { sessionContext: string | null }
  /** Task-only. All strings pre-rendered by hq; `columns` is the board's columns, formatted. */
  task?: {
    taskId: string
    taskKey: string // e.g. "WEB-42" — number + project key
    title: string
    description: string
    projectId: string
    projectName: string
    projectSlug: string
    boardName: string
    columns: string
    /** The newest comments not by this agent, oldest first (`sharedSessions.ts`); the site keeps those since its last run. */
    comments?: TaskCommentForRun[]
  }
  /** Since 1.12: set when the run's workspace is a code workspace (`codeWork.ts`). */
  codeWork?: RunCodeWork
  /**
   * Mount inputs, pre-resolved by hq. A run reaches one owner's storage — its
   * own — so this carries slugs, not a set of owners: the mount set follows
   * `primaryLoc`, and nothing here can widen it.
   */
  mounts: {
    /** locationResolver's slug lookups, pre-resolved by owner id. */
    ownerSlugs: Record<string, string>
  }
  /** SiteConfig.riskRules (sdkToolGate), null when unset. */
  riskRules: RiskRule[] | null
  /**
   * The one model credential this run may use, decided by the boundary it acts
   * for (spec §6.3, ADR-0060) — an API key, or the subscription login of the
   * person the run acts as. Null when the boundary has none configured and
   * neither does the org, which the site turns into a failed run naming the
   * boundary rather than falling through to whatever the container holds.
   *
   * REQUIRED, and it replaced `llmApiKey` — a removal, which is why the
   * protocol major moved (see connection.ts).
   *
   * @deprecated since 1.1; stops working in 3.0. Use `modelAccess` instead.
   */
  credential: RunCredential | null
  /**
   * The API keys for the turn's other providers — one per provider of a
   * fallback model the turn may switch to, resolved by the same rules as
   * `credential` (spec §6, "Every provider the turn may use has its
   * credential"). Never `credential`'s own provider again, never a
   * subscription. The site's model relay picks a request's key from
   * `credential` and these by provider. ABSENT when there are none.
   *
   * @deprecated since 1.1; stops working in 3.0. Use `modelAccess` instead.
   */
  fallbackCredentials?: ApiKeyRunCredential[]
  /**
   * The run's model via its provider, the provider descriptor the site's relay adds the key from, any other provider
   * a helper of the run may use, and the billing profile its calls are costed to (runProvider.ts). Decided by hq's
   * resolver. ABSENT from an hq before 1.1, which sends `credential`; a site reads this first when both are there.
   */
  modelAccess?: RunModelAccess
  /**
   * The org's web-search key (Exa), for this turn only. ABSENT when the org has
   * none. The site holds it on the run's context for the `web_search` platform
   * tool and never puts it in a container's environment.
   */
  webSearchKey?: string
  /** Why `credential` is null, when hq knows — the site shows it verbatim as the run's error. */
  credentialProblem?: string
  /**
   * The content this run loads, each package named by its digest (ADR-0072). hq
   * has delivered every one the site lacked before sending the dispatch; the
   * site fails the run rather than load any other content (`package_unavailable`).
   */
  packages: RunPackages
  /** Built-in and installed skills this agent has, at their pinned versions, by digest. ABSENT from an hq before 1.9. */
  installedSkills?: InstalledSkillEntry[]
  /** The place's switched-on skills in files, by place, path and fingerprint. ABSENT from an hq before 1.9. */
  fileSkills?: FileSkillEntry[]
  /** The person's own published skills, only on a turn of their own conversation. ABSENT from an hq before 1.9. */
  personSkills?: PersonSkillEntry[]
  /**
   * The person this run is on behalf of, so the agent can read "tomorrow at 9"
   * on their clock: their IANA timezone. The site adds the current local time
   * from its own clock when it builds the prompt. ABSENT when the run has no
   * person or the person has set none. The agent's scheduling tools read the
   * person's timezone on hq's side either way.
   */
  person?: { timezone: string }
  /**
   * The pinned memory this run may read (memory and knowledge spec, Workers and helpers): the pinned items of
   * the person the run is for, in their two scopes for this agent, and of the agent in the run's place. hq
   * resolves them under the one rule; the site writes them as a read-only file in the run's home at every run
   * start. ABSENT when there are none; the run still reaches memory through `recall`.
   */
  pinnedMemory?: PinnedMemoryItem[]
}

export type PinnedMemoryItem = {
  key: string
  /** `person`, `agent_person` or `agent_place`, as the memory tools name the scopes. */
  scope: 'person' | 'agent_person' | 'agent_place'
  title: string
  body: string
}
