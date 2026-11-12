/**
 * The permission group every control-plane tool belongs to, for a caller that
 * is a person's connection (adr-0090). One table, beside the tool list
 * (toolSchemas.ts): a tool added there must be placed here, and
 * connectionGroups.test.ts fails until it is. A tool with no group — the
 * data-path-only ones, which act for an agent's run — is refused to every
 * connection.
 *
 * Making or changing a task is *Change tasks*. Starting a run — run_task, or
 * create_task asked to start one — is *Start work* (startGate.ts), whichever
 * tool asks: no column or pulse starts work (adr-0175).
 */
import { CONNECTION_GROUP_INFO, type ConnectionGroup } from '../../shared/connections'
import { ControlPlaneError, type ConnectionGrant } from './types'

export const TOOL_GROUPS: Readonly<Record<string, ConnectionGroup>> = {
  // Read
  get_org: 'read',
  list_agents: 'read',
  list_teams: 'read',
  list_projects: 'read',
  list_boards: 'read',
  get_board: 'read',
  list_milestones: 'read',
  fetch_my_queued_tasks: 'read',
  list_tasks: 'read',
  get_task_details: 'read',
  list_active_runs: 'read',
  list_products: 'read',
  get_product: 'read',
  get_github_config: 'read',
  list_workforce_templates: 'read',
  // Change tasks
  update_task: 'change_tasks',
  create_task: 'change_tasks',
  change_tasks: 'change_tasks',
  archive_task: 'change_tasks',
  delete_task: 'change_tasks',
  tick_subtask: 'change_tasks',
  attach_file: 'change_tasks',
  add_comment: 'change_tasks',
  finish_sprint: 'change_tasks',
  rename_sprint: 'change_tasks',
  create_milestone: 'change_tasks',
  update_milestone: 'change_tasks',
  delete_milestone: 'change_tasks',
  // Start work
  run_task: 'start_work',
  set_task_schedule: 'start_work',
  create_routine: 'start_work',
  update_routine: 'start_work',
  // Manage — each still under its own role floor or project entitlement
  create_board: 'manage',
  propose_workforce_template: 'manage',
  update_org: 'manage',
  create_team: 'manage',
  create_product: 'manage',
  update_product: 'manage',
  delete_product: 'manage',
  create_project: 'manage',
  create_agent: 'manage',
  generate_agent_picture: 'manage',
}

/** Refuses a tool a connection's groups do not cover, naming the group to turn on. */
export function requireConnectionGroup(grant: ConnectionGrant, tool: string): void {
  const group = Object.prototype.hasOwnProperty.call(TOOL_GROUPS, tool) ? TOOL_GROUPS[tool] : undefined
  if (!group) {
    throw new ControlPlaneError('forbidden', `${tool} is not available through a connection`)
  }
  if (!grant.groups.has(group)) {
    throw new ControlPlaneError(
      'forbidden',
      `${tool} needs this connection's "${CONNECTION_GROUP_INFO[group].label}" permission, which is off. ` +
        'Its person can turn it on in Settings → Connections.',
    )
  }
}
