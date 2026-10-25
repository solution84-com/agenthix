/**
 * The socket event a workflow run's page and its card in a conversation listen for. Safe for the client: it imports
 * nothing from the server.
 */
export const WORKFLOW_RUN_SOCKET_EVENT = 'workflowRun:changed'

/** Ids and a state only; a screen reads the run itself. `state` is core's `WorkflowRunState`. */
export type WorkflowRunSocketEvent = { runId: string; workflowId: string; state: string }
