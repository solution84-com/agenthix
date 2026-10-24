/**
 * The agent's four workflow tools (spec part 1, *The agent's tools*): served by the site's MCP server and forwarded
 * to hq's data API like the site's other forwarded tools (`site/src/server/mcp/forwardedToolSchemas.ts`), and
 * answered by hq. Declared once here so the two sides can't drift. Core carries no schema library, and hq and the
 * site use different majors of theirs, so each argument is described plainly and each side builds its own validator
 * from `WORKFLOW_TOOL_DECLARATIONS`.
 *
 * Every tool acts for the calling run: the site fills in its `runId` (`runIdFromCaller`), which tells hq the place,
 * the workspace, the agent and the person the run is for. The agent can't name another. Nothing any tool answers
 * holds a secret's value; output is masked on the site before it leaves (adr-0148).
 */
import type { WorkflowParameter } from './definition.js'
import type { WorkflowRunState, WorkflowStepState } from './runStates.js'

export const WORKFLOW_TOOL_NAMES = {
  list: 'list_workflows',
  propose: 'propose_workflow',
  run: 'run_workflow',
  runState: 'workflow_run',
} as const
export type WorkflowToolName = (typeof WORKFLOW_TOOL_NAMES)[keyof typeof WORKFLOW_TOOL_NAMES]

/** How many times an agent may run one workflow in an hour, unless an administrator changes it for that workflow. */
export const AGENT_WORKFLOW_RUNS_PER_HOUR_DEFAULT = 30
/** How much of each step's masked output an agent is given: its last lines. People see all of it. */
export const AGENT_STEP_OUTPUT_LINES = 200

/** One argument: text, or a map of text to text. */
export type WorkflowToolArg = { type: 'string' | 'stringMap'; description: string; optional?: true; maxLength?: number }

export type WorkflowToolDeclaration = {
  name: WorkflowToolName
  description: string
  args: Record<string, WorkflowToolArg>
  runIdFromCaller: true
}

export const WORKFLOW_TOOL_DECLARATIONS: WorkflowToolDeclaration[] = [
  {
    name: WORKFLOW_TOOL_NAMES.list,
    description:
      'List the workflows of this place: each one\'s name, description, whether it is on, the parameters its approved ' +
      'version takes, the secrets and variables it uses, and any version waiting for a person. Secrets are named, ' +
      'never shown. Use a workflow for anything that needs a secret, such as pushing to GitHub or deploying.',
    args: {},
    runIdFromCaller: true,
  },
  {
    name: WORKFLOW_TOOL_NAMES.propose,
    description:
      'Propose a new version of a workflow from a definition file (workflow.yaml) in your workspace and the files it ' +
      'names. A person reviews and approves it before it can run. Answers the version\'s number and what the plain ' +
      'checks flagged.',
    args: { path: { type: 'string', description: 'The definition file\'s path in your workspace, such as .workflows/deploy-staging/workflow.yaml', maxLength: 1024 } },
    runIdFromCaller: true,
  },
  {
    name: WORKFLOW_TOOL_NAMES.run,
    description:
      'Run the approved version of a workflow, and wait for it. Answers each step\'s result and the last lines of its ' +
      'output, with every secret masked. A long run can be checked later with workflow_run.',
    args: {
      name: { type: 'string', description: 'The workflow\'s name, such as push', maxLength: 64 },
      parameters: { type: 'stringMap', description: 'A value for each of the workflow\'s parameters, by name', optional: true },
    },
    runIdFromCaller: true,
  },
  {
    name: WORKFLOW_TOOL_NAMES.runState,
    description: 'A workflow run\'s state: each step\'s result and the last lines of its output, with every secret masked.',
    args: { id: { type: 'string', description: 'The run\'s id, as run_workflow answered it', maxLength: 64 } },
    runIdFromCaller: true,
  },
]

export type WorkflowToolArgs = {
  list_workflows: Record<string, never>
  propose_workflow: { path: string }
  run_workflow: { name: string; parameters?: Record<string, string> }
  workflow_run: { id: string }
}

export type WorkflowListEntry = {
  name: string
  description: string
  /** Off: nobody can run it; the agent can say so instead of trying something else. */
  enabled: boolean
  /** The approved version's number; null while none is approved. */
  approvedVersion: number | null
  /** The approved version's parameters. */
  parameters: WorkflowParameter[]
  secrets: string[]
  variables: string[]
  /** The newest version waiting for a person, if any. */
  waitingVersion: number | null
}

export type ListWorkflowsResult = { workflows: WorkflowListEntry[] }

/**
 * One of the plain checks' flags (R1): the rule's number, whether it is high, and what it found. `path` is a version
 * file, or a place in the definition such as `steps[1].run` or `github.issues`; `line` counts from 1 within it.
 */
export type WorkflowCheckFlag = { rule: number; high: boolean; message: string; path?: string; line?: number }

export type ProposeWorkflowResult = {
  workflow: string
  version: number
  hash: string
  flags: WorkflowCheckFlag[]
  /** Always true: a person approves a version, never an agent. */
  waitsForPerson: true
}

/** What `run_workflow` and `workflow_run` answer. */
export type WorkflowRunToolResult = {
  id: string
  workflow: string
  version: number
  state: WorkflowRunState
  /** Why it failed or stopped, in words for the agent; null otherwise. */
  failure: string | null
  durationMs: number | null
  steps: { name: string; state: WorkflowStepState; durationMs: number | null; exitCode: number | null; output: string }[]
  /** Files the run changed that were written back to the workspace. */
  filesChanged: string[]
  /** Files the agent also changed during the run: the run's copy is kept beside each, at `keptAs`. */
  conflicts: { path: string; keptAs: string }[]
}
