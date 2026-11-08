import * as taskOps from './taskOps'
import * as scheduleOps from './scheduleOps'
import * as routineOps from './routineOps'
import * as boardOps from './boardOps'
import * as planOps from './planOps'
import * as taskWriteOps from './taskWriteOps'
import * as orgOps from './orgOps'
import * as agentOps from './agentOps'
import * as productOps from './productOps'
import * as workforceOps from './workforceOps'
import * as memoryOps from './memoryOps'
import * as activeRunsOps from './activeRunsOp'
import * as resultOps from './resultOps'
import * as knowledgeOps from './knowledgeOps'
import { WORKFLOW_TOOL_OPERATIONS } from '../../workflows/agentTools'
import { proposeSkillOp } from '../../assets/proposals/agentTool'
import { commitOp, mergeIntoMainOp, updateFromMainOp } from '../../branches/agentTools'
import { APP_TOOL_OPERATIONS } from '../../livePreviews/appTools'
import { ControlPlaneError, type CallerContext } from './types'
import { requireConnectionGroup } from './connectionGroups'
import { actingPerson } from './runPerson'
import { requireTurnTool } from './turnCaller'
import { withTaskId } from './taskKey'
import { withProjectId } from './projectKey'
import { isNoExecutionSiteError } from '../../shared/noExecutionSite'

/** Registry keyed by MCP tool name — the single dispatch table for the MCP
 *  wrapper and the /api/v1/data endpoint. Grown by Task 4. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry boundary: tool args are caller-shaped, each op narrows its own
export const operations: Record<string, (ctx: CallerContext, args: any) => Promise<unknown>> = {
  // org
  get_org: orgOps.getOrgOp,
  update_org: orgOps.updateOrgOp,
  list_teams: orgOps.listTeamsOp,
  create_team: orgOps.createTeamOp,
  get_github_config: orgOps.getGithubConfigOp,
  // agent / project
  list_agents: agentOps.listAgentsOp,
  create_agent: agentOps.createAgentOp,
  list_presets: agentOps.listPresetsOp,
  apply_agent_preset: agentOps.applyAgentPresetOp,
  list_projects: agentOps.listProjectsOp,
  create_project: agentOps.createProjectOp,
  // product
  list_products: productOps.listProductsOp,
  get_product: productOps.getProductOp,
  create_product: productOps.createProductOp,
  update_product: productOps.updateProductOp,
  delete_product: productOps.deleteProductOp,
  // workforce
  list_workforce_templates: workforceOps.listWorkforceTemplatesOp,
  propose_workforce_template: workforceOps.proposeWorkforceTemplateOp,
  // board
  list_boards: boardOps.listBoardsOp,
  get_board: boardOps.getBoardOp,
  create_board: boardOps.createBoardOp,
  finish_sprint: boardOps.finishSprintOp,
  rename_sprint: boardOps.renameSprintOp,
  // milestones (adr-0098)
  list_milestones: planOps.listMilestonesOp,
  create_milestone: planOps.createMilestoneOp,
  update_milestone: planOps.updateMilestoneOp,
  delete_milestone: planOps.deleteMilestoneOp,
  // task
  fetch_my_queued_tasks: taskOps.fetchMyQueuedTasksOp,
  list_tasks: taskOps.listTasksOp,
  get_task_details: taskOps.getTaskDetailsOp,
  update_task: taskWriteOps.updateTaskOp,
  create_task: taskWriteOps.createTaskOp,
  change_tasks: taskOps.changeTasksOp,
  archive_task: taskOps.archiveTaskOp,
  delete_task: taskOps.deleteTaskOp,
  tick_subtask: taskOps.tickSubtaskOp,
  attach_file: taskOps.attachFileOp,
  run_task: taskOps.runTaskOp,
  set_task_schedule: scheduleOps.setTaskScheduleOp,
  create_routine: routineOps.createRoutineOp,
  update_routine: routineOps.updateRoutineOp,
  add_comment: taskOps.addCommentOp,
  // run visibility (person-scoped execution spec §3)
  list_active_runs: activeRunsOps.listActiveRunsOp,
  // memory (memory and knowledge spec) — data-path-only; who it is for is
  // memory/principal.ts's one rule.
  remember: memoryOps.rememberOp,
  forget: memoryOps.forgetOp,
  recall: memoryOps.recallOp,
  // a run's result (workers and results spec) — data-path-only: only a run states one
  set_result: resultOps.setResultOp,
  // knowledge (agent knowledge spec, part 3) — data-path-only: a run's reach is its capability's (knowledgeOps.ts)
  search_knowledge: knowledgeOps.searchKnowledgeOp,
  read_knowledge: knowledgeOps.readKnowledgeOp,
  write_knowledge: knowledgeOps.writeKnowledgeOp,
  edit_knowledge: knowledgeOps.editKnowledgeOp,
  delete_knowledge: knowledgeOps.deleteKnowledgeOp,
  // workflows (adr-0148) — data-path-only: an agent's run lists, proposes and runs its place's workflows
  ...WORKFLOW_TOOL_OPERATIONS,
  // skills (skills spec part 5) — data-path-only: an agent's run drafts or proposes a skill, never publishes one
  propose_skill: proposeSkillOp,
  // code work on branches (live preview spec, part 2) — data-path-only: the branch is the calling run's own
  commit: commitOp,
  merge_into_main: mergeIntoMainOp,
  update_from_main: updateFromMainOp,
  // a live preview's app tools (live preview spec section 4) — data-path-only: the live preview is the run's signed one
  ...APP_TOOL_OPERATIONS,
}

/** Memory, which a run nobody commissioned still reaches for its place: its tools check their own principal. */
const OWN_PRINCIPAL: ReadonlySet<string> = new Set(['remember', 'forget', 'recall'])

export async function callOperation(name: string, ctx: CallerContext, args: unknown): Promise<unknown> {
  // hasOwnProperty, not `operations[name]` truthiness (plan 5b-2 task 5
  // review, I2): `operations` is a plain object, so a caller-supplied name
  // like "constructor" or "__proto__" resolves through Object.prototype to a
  // real function unless every lookup is guarded — a 200 that echoes back
  // whatever that inherited value produces, never the intended 404.
  if (!Object.prototype.hasOwnProperty.call(operations, name)) {
    throw new ControlPlaneError('not_found', `Unknown operation: ${name}`)
  }
  // A person's connection reaches only the tools its permission groups cover (adr-0090).
  if (ctx.kind === 'connection') requireConnectionGroup(ctx.connection, name)
  else {
    // A conversation's turn reaches only the quick tools its agent may use in its place (adr-0082).
    if (ctx.kind === 'turn') requireTurnTool(ctx, name)
    // Every run's and turn's call needs a person behind it who is still in the
    // organisation (adr-0101); each operation then checks what that person may
    // do. Memory checks its own principal.
    if (ctx.kind === 'turn' || !OWN_PRINCIPAL.has(name)) await actingPerson(ctx, name)
  }
  try {
    return await operations[name](ctx, await withProjectId(await withTaskId(args)))
  } catch (err) {
    // An operation that needs a site throws the shared HTTP error; an agent or
    // the data API caller must read it as what it is, not as an internal fault.
    if (isNoExecutionSiteError(err)) throw new ControlPlaneError('unavailable', (err as Error).message)
    throw err
  }
}
