/**
 * A workflow's definition, as `parseWorkflowDefinition` leaves it (spec part 1, *What a workflow is*): every field
 * present, defaults applied, durations in seconds, and every set — variables, hosts, files, a step's secrets — sorted,
 * so one definition has one form. Steps, parameters and a parameter's fixed values keep the order they were written
 * in, which is the order people see them.
 *
 * Type aliases rather than interfaces: these cross Wasp operations, whose superjson `Payload` needs the implicit
 * index signature an interface lacks (see `protocol/runtimeData.ts`).
 */
import type { GitHubPermissions } from './githubPermissions.js'
import type { WorkflowHost } from './hosts.js'

export type WorkflowParameter =
  /** The whole value must match `pattern` (see `patterns.ts`). */
  | { name: string; kind: 'pattern'; pattern: string }
  /** The value is one of `values`. */
  | { name: string; kind: 'values'; values: string[] }
  /** Free text, such as a commit message; meant to be read as a file argument. */
  | { name: string; kind: 'text' }

export type WorkflowParameterKind = WorkflowParameter['kind']

export type WorkflowStep = {
  name: string
  /** A command, or one of the version's files (`./deploy/upload.sh`), run from `/run/workflow`. */
  run: string
  /** The secrets this step gets, as `/run/secrets/<NAME>`, and no other step. Sorted. */
  secrets: string[]
  /** This step's own limit; null for none beyond the run's. */
  timeoutSeconds: number | null
}

export type WorkflowDefinition = {
  name: string
  description: string
  steps: WorkflowStep[]
  /** Every step has these as environment variables. Sorted. */
  variables: string[]
  parameters: WorkflowParameter[]
  /** The `host:port` pairs the steps may reach; none means no network. Sorted. */
  hosts: WorkflowHost[]
  /** The permissions each run's `GITHUB_TOKEN` is minted with; empty when no step names it. */
  github: GitHubPermissions
  /** The whole run's limit. */
  timeoutSeconds: number
  /**
   * The version's files besides the definition, relative to its folder: those `files:` lists and those a step's
   * `run` names. Sorted.
   */
  files: string[]
}

export const WORKFLOW_RUN_TIMEOUT_DEFAULT_SECONDS = 600
export const WORKFLOW_TIMEOUT_MAX_SECONDS = 6 * 60 * 60

export const WORKFLOW_LIMITS = {
  descriptionMax: 500,
  stepsMax: 50,
  stepNameMax: 100,
  runMax: 10_000,
  secretsPerStepMax: 50,
  variablesMax: 100,
  parametersMax: 50,
  valuesMax: 100,
  hostsMax: 50,
  filesMax: 200,
  /** One file of a version. */
  fileBytesMax: 4 * 1024 * 1024,
  /** All of a version's files together. */
  filesBytesMax: 16 * 1024 * 1024,
  /** A pattern or fixed-list parameter's value. */
  parameterValueMax: 1024,
  /** A text parameter's value: GitHub's limit for a pull request's body. */
  textParameterValueMax: 65_536,
} as const

/** Something wrong with a definition, at a path such as `steps[1].secrets[0]`. */
export type WorkflowDefinitionError = { path: string; message: string }

/** Something a definition may do that people should see; it is still accepted (R1 rule 11). */
export type WorkflowDefinitionNote = {
  code: 'parameter_may_start_with_dash'
  path: string
  message: string
}

export type WorkflowDefinitionParse =
  | { ok: true; definition: WorkflowDefinition; notes: WorkflowDefinitionNote[] }
  | { ok: false; errors: WorkflowDefinitionError[] }
