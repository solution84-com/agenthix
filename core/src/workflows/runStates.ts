/**
 * A workflow run's states and its steps' (spec part 2, *Steps and progress*). A run waits while the site starts it;
 * the first step that fails ends it and the rest are skipped; Stop, or turning the workflow off, stops it. A reader
 * that meets a state it doesn't know shows it as unknown, never refuses it.
 */
export const WORKFLOW_RUN_STATES = ['waiting', 'running', 'passed', 'failed', 'stopped'] as const
export type WorkflowRunState = (typeof WORKFLOW_RUN_STATES)[number]

export const WORKFLOW_STEP_STATES = ['waiting', 'running', 'passed', 'failed', 'skipped', 'stopped'] as const
export type WorkflowStepState = (typeof WORKFLOW_STEP_STATES)[number]
