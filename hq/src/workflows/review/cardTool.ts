/** The tool name of a workflow card's operation; no agent is ever offered a tool of this name. */
export const WORKFLOW_APPROVAL_TOOL = 'approve_workflow_version'

/** What a workflow card's operation holds: the version it shows. */
export type WorkflowCardArgs = { workflowId: string; versionId: string; hash: string }
