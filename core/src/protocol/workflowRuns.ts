/**
 * Workflow runs between hq and the site that holds the place's storage (spec part 2, *From run to result*). hq sends
 * a run instruction on the control channel; the site rechecks the version's hash, runs each step in an executor
 * container of its own, and reports step events and the result as site events. Added in site protocol 1.4.
 *
 * ## The run instruction carries secrets
 *
 * `WorkflowRunInstruction.steps[].secrets` holds the plain values of the secrets each step names, base64 encoded
 * because they are bytes. It is the most dangerous message on this channel, and it travels one way only: the site
 * holds it in memory, writes each step's values to that step's tmpfs and nowhere else, never stores it, never logs it,
 * and nothing it sends back carries a value — not a result, a refusal, an event or a log line. Every output and every
 * changed file is masked or scanned against `masking` before it leaves the site (adr-0148).
 *
 * ## Masking material
 *
 * Masking covers every secret of the place, not only the run's (spec part 2, *Masking*), yet hq sends no more values
 * in plain than the run itself is given. So `masking` holds, for each form of each value — as it is, base64 at the
 * three alignments, hex in both cases, URL-encoded, and each line of a file secret — only its length and its
 * HMAC-SHA-256 under a key made for this run. The site finds a form by the keyed hash of each stretch of output of
 * that length. hq makes the forms; the site only matches them.
 *
 * Events may be lost, like every site event: hq recovers a run's state with `workflow.get`.
 *
 * Type aliases rather than interfaces, for the reason `runtimeData.ts` gives.
 */
import type { StorageOwnerType } from '../storage/locationRef.js'
import type { WorkflowDefinition } from '../workflows/definition.js'
import type { WorkflowRunState, WorkflowStepState } from '../workflows/runStates.js'

export const WORKFLOW_RUN_METHODS = {
  /** Control channel: start a run. Answers at once; the run reports by events. */
  run: 'workflow.run',
  /** Control channel: stop a run; its step's container is stopped and nothing is written back. */
  stop: 'workflow.stop',
  /** Control channel: a run's state and, once it has ended, its result, while the site keeps it. */
  get: 'workflow.get',
  /** Control channel: read a proposal's files from a workspace, refusing any link. */
  readFiles: 'workflow.readFiles',
} as const

export const WORKFLOW_STEP_EVENT = 'workflow.step'
export const WORKFLOW_RESULT_EVENT = 'workflow.result'

/** How much masked output a step event carries: the end of the step's output so far. */
export const WORKFLOW_STEP_EVENT_OUTPUT_MAX = 64 * 1024
/** How much of a step's masked output the result keeps; beyond it, the start is dropped. */
export const WORKFLOW_STEP_OUTPUT_MAX = 4 * 1024 * 1024

/** A version's file on the wire. */
export type WorkflowWireFile = { path: string; contentBase64: string; executable: boolean }

/** The workspace a run works on: a workspace, or an owner's own files when `workspaceId` is null. */
export type WorkflowRunWorkspace = { ownerType: StorageOwnerType; ownerId: string; workspaceId: string | null }

/** One step's values, by the step's position: each secret it names, by name, as base64 of its bytes. */
export type WorkflowStepValues = { secrets: Record<string, string> }

export type WorkflowContainerLimits = { memoryMb: number; processes: number; cpus: number }
export const WORKFLOW_CONTAINER_LIMITS: WorkflowContainerLimits = { memoryMb: 1024, processes: 256, cpus: 1 }

/** One form of one secret's value: its length in bytes and its HMAC-SHA-256 under `WorkflowMaskingMaterial.key`, in hex. */
export type WorkflowMaskForm = { length: number; hmac: string; secretName: string }

export type WorkflowMaskingMaterial = {
  /** Made for this run, base64; never reused. */
  key: string
  forms: WorkflowMaskForm[]
}

/** The repository a run's `GITHUB_TOKEN` is for, from the workspace's own connection, never from the workspace's files. */
export type WorkflowRunGitHub = { repository: string; repositoryId: number; cloneUrl: string }

export type WorkflowRunInstruction = {
  /** hq's id for the run. */
  runId: string
  /** The approved version's hash, which the site recomputes from what follows and refuses on a difference. */
  versionHash: string
  definition: WorkflowDefinition
  files: WorkflowWireFile[]
  githubSecretNames: string[]
  executorImageDigest: string
  workspace: WorkflowRunWorkspace
  /** One entry per step of `definition.steps`, in order. */
  steps: WorkflowStepValues[]
  /** The value of each variable the definition names. */
  variables: Record<string, string>
  /** Checked by hq against the definition; each is written to `/run/params/<name>`. */
  parameters: Record<string, string>
  limits: WorkflowContainerLimits
  masking: WorkflowMaskingMaterial
  /** Set when a step names `GITHUB_TOKEN`. */
  github: WorkflowRunGitHub | null
}

export const WORKFLOW_RUN_REFUSALS = [
  'hash_mismatch', 'invalid_instruction', 'workspace_missing', 'image_missing', 'already_known', 'busy',
] as const
export type WorkflowRunRefusal = (typeof WORKFLOW_RUN_REFUSALS)[number]

export type WorkflowRunAcceptance =
  | { accepted: true }
  | { accepted: false; reason: WorkflowRunRefusal; message: string }

export type WorkflowStopParams = { runId: string; reason: 'stopped' | 'turned_off' }
export type WorkflowStopResult = { stopped: boolean }

/** site → hq, as each step starts and ends, and while it runs. */
export type WorkflowStepEvent = {
  runId: string
  index: number
  name: string
  state: WorkflowStepState
  startedAt: string | null
  endedAt: string | null
  exitCode: number | null
  /** The end of the step's masked output so far, at most `WORKFLOW_STEP_EVENT_OUTPUT_MAX`. */
  outputTail: string
  outputTruncated: boolean
}

export const WORKFLOW_RUN_FAILURES = [
  'step_failed', 'step_timeout', 'run_timeout', 'secret_in_files', 'stopped', 'turned_off', 'write_back_failed', 'site_error',
] as const
export type WorkflowRunFailure = (typeof WORKFLOW_RUN_FAILURES)[number]

export type WorkflowStepResult = {
  index: number
  name: string
  state: WorkflowStepState
  startedAt: string | null
  endedAt: string | null
  exitCode: number | null
  /** The step's masked output, at most `WORKFLOW_STEP_OUTPUT_MAX`. */
  output: string
  outputTruncated: boolean
}

/** A secret the changed-file scan found: for the people of the place; the agent is told only that one was found. */
export type WorkflowLeak = { path: string; secretName: string }

export type WorkflowWriteBack = {
  changed: string[]
  /** Files the agent also changed during the run: the run's copy is kept beside each. */
  conflicts: { path: string; keptAs: string }[]
}

/** site → hq when a run ends. */
export type WorkflowRunResult = {
  runId: string
  state: Extract<WorkflowRunState, 'passed' | 'failed' | 'stopped'>
  startedAt: string
  endedAt: string
  failure: { code: WorkflowRunFailure; message: string } | null
  steps: WorkflowStepResult[]
  /** Secrets masking found in the output: the run is flagged *printed a secret*. */
  printedSecretNames: string[]
  leaks: WorkflowLeak[]
  /** Null when nothing was written back. */
  writeBack: WorkflowWriteBack | null
}

export type WorkflowGetParams = { runId: string }
export type WorkflowRunReport = {
  runId: string
  state: WorkflowRunState
  steps: WorkflowStepEvent[]
  result: WorkflowRunResult | null
}

/** Paths relative to the workspace, as `normaliseWorkflowPath` writes them. */
export type WorkflowReadFilesParams = { workspace: WorkflowRunWorkspace; paths: string[] }

export const WORKFLOW_READ_REFUSALS = ['missing', 'link', 'not_a_file', 'too_large', 'invalid_path', 'workspace_missing'] as const
export type WorkflowReadRefusal = (typeof WORKFLOW_READ_REFUSALS)[number]

export type WorkflowReadFilesResult =
  | { ok: true; files: WorkflowWireFile[] }
  | { ok: false; reason: WorkflowReadRefusal; path: string | null; message: string }
