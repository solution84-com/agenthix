/**
 * MCP tool registry
 * =================
 * Single source of truth for all system MCP tool identifiers, organised by
 * domain group — matching the canonical tool reference in docs/domains/tools/tools.md.
 *
 * Domain groups: PLATFORM, ORG, PRODUCT, PROJECT, BOARD, MILESTONE, RUN, TASK, AGENT, LIBRARY, GIT, MEMORY, WORKFLOW,
 * KNOWLEDGE, SKILL
 *
 * Access tiers (cross-cutting):
 *   ALWAYS_INJECTED  — PLATFORM tools + task execution lifecycle; never user-configurable
 *   DEFAULT_ON       — included when allowedTools is null
 *   ADMINISTRATIVE   — off by default; must be explicitly granted
 *
 * Tool names are stored and passed around in our raw format (e.g. 'create_task').
 * Runtime adapters are responsible for translating to their own naming scheme.
 */

import { PROPOSE_SKILL_TOOL, WORKFLOW_TOOL_NAMES } from '@agenthix/core'
import { ALL_RUNTIME_TOOL_NAMES } from './runtimeTools'

// ── Tool registry (by domain) ─────────────────────────────────────────────────

export const SYSTEM_MCP_TOOLS = {

  /**
   * Infrastructure — not shown in UI. Always injected and never user-configurable.
   */
  PLATFORM: {
    PING:               'ping',
    GET_SITE_INFO:      'get_site_info',
    START_PREVIEW:      'start_preview',
    STOP_PROCESSES:     'stop_processes',
  },

  /** Organisation and team management. */
  ORG: {
    GET_ORG:     'get_org',
    UPDATE_ORG:  'update_org',
    LIST_TEAMS:  'list_teams',
    CREATE_TEAM: 'create_team',
  },

  /** Product vision and membership. */
  PRODUCT: {
    LIST_PRODUCTS:  'list_products',
    GET_PRODUCT:    'get_product',
    CREATE_PRODUCT: 'create_product',
    UPDATE_PRODUCT: 'update_product',
    DELETE_PRODUCT: 'delete_product',
  },

  /** Dev projects. */
  PROJECT: {
    LIST_PROJECTS:  'list_projects',
    CREATE_PROJECT: 'create_project',
  },

  /** Kanban boards within projects. */
  BOARD: {
    LIST_BOARDS:  'list_boards',
    GET_BOARD:    'get_board',
    CREATE_BOARD: 'create_board',
    RENAME_SPRINT: 'rename_sprint',
    FINISH_SPRINT: 'finish_sprint',
  },

  /** A project's milestones: dated goals its epics belong to (adr-0098). */
  MILESTONE: {
    LIST_MILESTONES:  'list_milestones',
    CREATE_MILESTONE: 'create_milestone',
    UPDATE_MILESTONE: 'update_milestone',
    DELETE_MILESTONE: 'delete_milestone',
  },

  /**
   * What is running now, in the caller's own boundary (person-scoped
   * execution spec §3, ADR-0077). Scope follows the run's own capability —
   * a project run sees the project's runs, a personal run sees only its own
   * — never an argument the caller supplies.
   */
  RUN: {
    LIST_ACTIVE_RUNS: 'list_active_runs',
    /** A run states what it achieved, at its end (workers and results spec, Results). */
    SET_RESULT:       'set_result',
  },

  /**
   * Tasks — includes execution lifecycle tools (always injected) and
   * configurable read/write/destructive tools.
   */
  TASK: {
    // Always injected — task execution lifecycle
    FETCH_MY_QUEUED_TASKS: 'fetch_my_queued_tasks',
    GET_TASK_DETAILS:      'get_task_details',
    ADD_COMMENT:           'add_comment',
    RUN_TASK:              'run_task',
    // Default on
    LIST_TASKS:            'list_tasks',
    CREATE_TASK:           'create_task',
    UPDATE_TASK:           'update_task',
    ATTACH_FILE:           'attach_file',
    SET_TASK_SCHEDULE:     'set_task_schedule',
    CREATE_ROUTINE:        'create_routine',
    UPDATE_ROUTINE:        'update_routine',
    // Administrative
    ARCHIVE_TASK:          'archive_task',
    DELETE_TASK:           'delete_task',
  },

  /** Agent management. */
  AGENT: {
    LIST_AGENTS:        'list_agents',
    CREATE_AGENT:       'create_agent',
    LIST_PRESETS:       'list_presets',
    APPLY_AGENT_PRESET: 'apply_agent_preset',
  },

  /** Workforce templates. */
  LIBRARY: {
    LIST_WORKFORCE_TEMPLATES:   'list_workforce_templates',
    PROPOSE_WORKFORCE_TEMPLATE: 'propose_workforce_template',
  },

  /** GitHub integration configuration. */
  GIT: {
    GET_GITHUB_CONFIG: 'get_github_config',
  },

  /**
   * What an agent learned as it worked, recalled by meaning (memory and
   * knowledge spec). Always injected: every run reaches at least the memory of
   * its place, and hq's own operation decides which scopes a run may use.
   */
  MEMORY: {
    REMEMBER: 'remember',
    FORGET:   'forget',
    RECALL:   'recall',
  },

  /**
   * The workflow tools (workflows spec part 1, *The agent's tools*; adr-0148), declared in core. Always injected:
   * they reach only the run's own place, and run only what a person approved, so there is nothing to turn off.
   */
  WORKFLOW: {
    LIST_WORKFLOWS:   WORKFLOW_TOOL_NAMES.list,
    PROPOSE_WORKFLOW: WORKFLOW_TOOL_NAMES.propose,
    RUN_WORKFLOW:     WORKFLOW_TOOL_NAMES.run,
    WORKFLOW_RUN:     WORKFLOW_TOOL_NAMES.runState,
  },

  /**
   * Knowledge at every level, shaped like the native Grep, Read, Write and Edit, forwarded to hq. Always injected:
   * they reach only the run's own place, the organisation and the platform guide; write, edit and delete are left
   * out of the list of a run that may change no files (server/mcp/handler.ts).
   */
  KNOWLEDGE: {
    SEARCH_KNOWLEDGE: 'search_knowledge',
    READ_KNOWLEDGE:   'read_knowledge',
    WRITE_KNOWLEDGE:  'write_knowledge',
    EDIT_KNOWLEDGE:   'edit_knowledge',
    DELETE_KNOWLEDGE: 'delete_knowledge',
  },

  /**
   * Proposing a skill (skills spec part 5), forwarded to hq: a draft or a proposal a person reviews, never a live
   * skill. Always injected: hq lets it reach only the run's own place, its person's own space and the Library.
   */
  SKILL: {
    PROPOSE_SKILL: PROPOSE_SKILL_TOOL,
  },

} as const

// ── Access tier views ─────────────────────────────────────────────────────────

/** Always injected — not user-configurable. */
export const ALWAYS_INJECTED_MCP_TOOLS: string[] = [
  SYSTEM_MCP_TOOLS.PLATFORM.PING,
  SYSTEM_MCP_TOOLS.PLATFORM.GET_SITE_INFO,
  SYSTEM_MCP_TOOLS.PLATFORM.START_PREVIEW,
  // Stops only the calling conversation's own processes, which a sandboxed
  // command cannot signal (served by the site itself, siteTools.ts there)
  SYSTEM_MCP_TOOLS.PLATFORM.STOP_PROCESSES,
  SYSTEM_MCP_TOOLS.TASK.FETCH_MY_QUEUED_TASKS,
  SYSTEM_MCP_TOOLS.TASK.GET_TASK_DETAILS,
  SYSTEM_MCP_TOOLS.TASK.ADD_COMMENT,
  SYSTEM_MCP_TOOLS.TASK.RUN_TASK,
  SYSTEM_MCP_TOOLS.RUN.SET_RESULT,
  SYSTEM_MCP_TOOLS.MEMORY.REMEMBER,
  SYSTEM_MCP_TOOLS.MEMORY.FORGET,
  SYSTEM_MCP_TOOLS.MEMORY.RECALL,
  ...Object.values(SYSTEM_MCP_TOOLS.WORKFLOW),
  ...Object.values(SYSTEM_MCP_TOOLS.KNOWLEDGE),
  ...Object.values(SYSTEM_MCP_TOOLS.SKILL),
]

/** Included by default when allowedTools is null. */
export const DEFAULT_ON_MCP_TOOLS: string[] = [
  SYSTEM_MCP_TOOLS.ORG.GET_ORG,
  SYSTEM_MCP_TOOLS.ORG.LIST_TEAMS,
  SYSTEM_MCP_TOOLS.PRODUCT.LIST_PRODUCTS,
  SYSTEM_MCP_TOOLS.PRODUCT.GET_PRODUCT,
  SYSTEM_MCP_TOOLS.PROJECT.LIST_PROJECTS,
  SYSTEM_MCP_TOOLS.BOARD.LIST_BOARDS,
  SYSTEM_MCP_TOOLS.BOARD.GET_BOARD,
  SYSTEM_MCP_TOOLS.BOARD.RENAME_SPRINT,
  SYSTEM_MCP_TOOLS.MILESTONE.LIST_MILESTONES,
  SYSTEM_MCP_TOOLS.MILESTONE.CREATE_MILESTONE,
  SYSTEM_MCP_TOOLS.MILESTONE.UPDATE_MILESTONE,
  SYSTEM_MCP_TOOLS.TASK.LIST_TASKS,
  SYSTEM_MCP_TOOLS.TASK.CREATE_TASK,
  SYSTEM_MCP_TOOLS.TASK.UPDATE_TASK,
  SYSTEM_MCP_TOOLS.TASK.ATTACH_FILE,
  SYSTEM_MCP_TOOLS.TASK.SET_TASK_SCHEDULE,
  SYSTEM_MCP_TOOLS.TASK.CREATE_ROUTINE,
  SYSTEM_MCP_TOOLS.TASK.UPDATE_ROUTINE,
  SYSTEM_MCP_TOOLS.AGENT.LIST_AGENTS,
  SYSTEM_MCP_TOOLS.RUN.LIST_ACTIVE_RUNS,
]

/** Off by default — must be explicitly granted. */
export const ADMINISTRATIVE_MCP_TOOLS: string[] = [
  SYSTEM_MCP_TOOLS.PRODUCT.CREATE_PRODUCT,
  SYSTEM_MCP_TOOLS.PRODUCT.UPDATE_PRODUCT,
  SYSTEM_MCP_TOOLS.PRODUCT.DELETE_PRODUCT,
  SYSTEM_MCP_TOOLS.ORG.UPDATE_ORG,
  SYSTEM_MCP_TOOLS.ORG.CREATE_TEAM,
  SYSTEM_MCP_TOOLS.PROJECT.CREATE_PROJECT,
  SYSTEM_MCP_TOOLS.BOARD.CREATE_BOARD,
  SYSTEM_MCP_TOOLS.BOARD.FINISH_SPRINT,
  SYSTEM_MCP_TOOLS.MILESTONE.DELETE_MILESTONE,
  SYSTEM_MCP_TOOLS.TASK.ARCHIVE_TASK,
  SYSTEM_MCP_TOOLS.TASK.DELETE_TASK,
  SYSTEM_MCP_TOOLS.AGENT.CREATE_AGENT,
  SYSTEM_MCP_TOOLS.AGENT.LIST_PRESETS,
  SYSTEM_MCP_TOOLS.AGENT.APPLY_AGENT_PRESET,
  SYSTEM_MCP_TOOLS.LIBRARY.LIST_WORKFORCE_TEMPLATES,
  SYSTEM_MCP_TOOLS.LIBRARY.PROPOSE_WORKFORCE_TEMPLATE,
  SYSTEM_MCP_TOOLS.GIT.GET_GITHUB_CONFIG,
]

/** All MCP tool names — used by the runtime layer for translation lookup. */
export const ALL_SYSTEM_MCP_TOOL_NAMES = new Set<string>([
  ...ALWAYS_INJECTED_MCP_TOOLS,
  ...DEFAULT_ON_MCP_TOOLS,
  ...ADMINISTRATIVE_MCP_TOOLS,
])

/**
 * Every tool name a workspace cap can meaningfully name — for the workspace
 * settings UI (spec §H6). Combines every MCP tool group in this file with the
 * runtime built-ins (filesystem/bash/web), deduplicated and sorted.
 */
export function listKnownToolNames(): string[] {
  return Array.from(new Set<string>([...ALL_SYSTEM_MCP_TOOL_NAMES, ...ALL_RUNTIME_TOOL_NAMES])).sort()
}

// ── Type ──────────────────────────────────────────────────────────────────────

export type SystemMcpTool =
  | typeof SYSTEM_MCP_TOOLS.PLATFORM[keyof typeof SYSTEM_MCP_TOOLS.PLATFORM]
  | typeof SYSTEM_MCP_TOOLS.ORG[keyof typeof SYSTEM_MCP_TOOLS.ORG]
  | typeof SYSTEM_MCP_TOOLS.PRODUCT[keyof typeof SYSTEM_MCP_TOOLS.PRODUCT]
  | typeof SYSTEM_MCP_TOOLS.PROJECT[keyof typeof SYSTEM_MCP_TOOLS.PROJECT]
  | typeof SYSTEM_MCP_TOOLS.BOARD[keyof typeof SYSTEM_MCP_TOOLS.BOARD]
  | typeof SYSTEM_MCP_TOOLS.MILESTONE[keyof typeof SYSTEM_MCP_TOOLS.MILESTONE]
  | typeof SYSTEM_MCP_TOOLS.RUN[keyof typeof SYSTEM_MCP_TOOLS.RUN]
  | typeof SYSTEM_MCP_TOOLS.TASK[keyof typeof SYSTEM_MCP_TOOLS.TASK]
  | typeof SYSTEM_MCP_TOOLS.AGENT[keyof typeof SYSTEM_MCP_TOOLS.AGENT]
  | typeof SYSTEM_MCP_TOOLS.LIBRARY[keyof typeof SYSTEM_MCP_TOOLS.LIBRARY]
  | typeof SYSTEM_MCP_TOOLS.GIT[keyof typeof SYSTEM_MCP_TOOLS.GIT]
  | typeof SYSTEM_MCP_TOOLS.MEMORY[keyof typeof SYSTEM_MCP_TOOLS.MEMORY]
  | typeof SYSTEM_MCP_TOOLS.KNOWLEDGE[keyof typeof SYSTEM_MCP_TOOLS.KNOWLEDGE]
