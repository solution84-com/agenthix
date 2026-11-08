/**
 * MCP tool registry
 * =================
 * Single source of truth for all system MCP tool identifiers, organised by
 * domain group — matching the canonical tool reference in docs/domains/tools/tools.md.
 *
 * Domain groups: PLATFORM, ORG, PRODUCT, PROJECT, BOARD, MILESTONE, TASK, AGENT, LIBRARY, GIT, MEMORY
 *
 * Access tiers (cross-cutting):
 *   ALWAYS_INJECTED  — PLATFORM tools + task execution lifecycle; never user-configurable
 *   DEFAULT_ON       — included when allowedTools is null
 *   ADMINISTRATIVE   — off by default; must be explicitly granted
 *
 * Tool names are stored and passed around in our raw format (e.g. 'create_task').
 * Runtime adapters are responsible for translating to their own naming scheme.
 */

// ── Tool registry (by domain) ─────────────────────────────────────────────────

export const SYSTEM_MCP_TOOLS = {

  /** Infrastructure — always injected, never user-configurable, not shown in UI. */
  PLATFORM: {
    PING:               'ping',
    GET_SITE_INFO:      'get_site_info',
  },

  /** Organisation and team management. */
  ORG: {
    GET_ORG:     'get_org',
    UPDATE_ORG:  'update_org',
    LIST_TEAMS:  'list_teams',
    CREATE_TEAM: 'create_team',
  },

  /** Product wiki and vision. */
  PRODUCT: {
    LIST_PRODUCTS:       'list_products',
    GET_PRODUCT:         'get_product',
    CREATE_PRODUCT:      'create_product',
    UPDATE_PRODUCT:      'update_product',
    DELETE_PRODUCT:      'delete_product',
    REQUEST_PRODUCT_GIT: 'request_product_git',
  },

  /** Dev projects. */
  PROJECT: {
    LIST_PROJECTS:       'list_projects',
    CREATE_PROJECT:      'create_project',
    REQUEST_PROJECT_GIT: 'request_project_git',
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
    CHANGE_TASKS:          'change_tasks',
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

  /** What the agent knows about the person it is talking to. Always injected. */
  MEMORY: {
    REMEMBER: 'remember',
    FORGET:   'forget',
  },

} as const

// ── Access tier views ─────────────────────────────────────────────────────────

/** Always injected — not user-configurable. */
export const ALWAYS_INJECTED_MCP_TOOLS: string[] = [
  ...Object.values(SYSTEM_MCP_TOOLS.PLATFORM),
  SYSTEM_MCP_TOOLS.TASK.FETCH_MY_QUEUED_TASKS,
  SYSTEM_MCP_TOOLS.TASK.GET_TASK_DETAILS,
  SYSTEM_MCP_TOOLS.TASK.ADD_COMMENT,
  SYSTEM_MCP_TOOLS.TASK.RUN_TASK,
  SYSTEM_MCP_TOOLS.MEMORY.REMEMBER,
  SYSTEM_MCP_TOOLS.MEMORY.FORGET,
]

/** Included by default when allowedTools is null. */
export const DEFAULT_ON_MCP_TOOLS: string[] = [
  SYSTEM_MCP_TOOLS.ORG.GET_ORG,
  SYSTEM_MCP_TOOLS.ORG.LIST_TEAMS,
  SYSTEM_MCP_TOOLS.PRODUCT.LIST_PRODUCTS,
  SYSTEM_MCP_TOOLS.PRODUCT.GET_PRODUCT,
  SYSTEM_MCP_TOOLS.PRODUCT.CREATE_PRODUCT,
  SYSTEM_MCP_TOOLS.PRODUCT.UPDATE_PRODUCT,
  SYSTEM_MCP_TOOLS.PRODUCT.REQUEST_PRODUCT_GIT,
  SYSTEM_MCP_TOOLS.PROJECT.LIST_PROJECTS,
  SYSTEM_MCP_TOOLS.PROJECT.REQUEST_PROJECT_GIT,
  SYSTEM_MCP_TOOLS.BOARD.LIST_BOARDS,
  SYSTEM_MCP_TOOLS.BOARD.GET_BOARD,
  SYSTEM_MCP_TOOLS.BOARD.RENAME_SPRINT,
  SYSTEM_MCP_TOOLS.MILESTONE.LIST_MILESTONES,
  SYSTEM_MCP_TOOLS.MILESTONE.CREATE_MILESTONE,
  SYSTEM_MCP_TOOLS.MILESTONE.UPDATE_MILESTONE,
  SYSTEM_MCP_TOOLS.TASK.LIST_TASKS,
  SYSTEM_MCP_TOOLS.TASK.CREATE_TASK,
  SYSTEM_MCP_TOOLS.TASK.UPDATE_TASK,
  SYSTEM_MCP_TOOLS.TASK.CHANGE_TASKS,
  SYSTEM_MCP_TOOLS.TASK.ATTACH_FILE,
  SYSTEM_MCP_TOOLS.TASK.SET_TASK_SCHEDULE,
  SYSTEM_MCP_TOOLS.TASK.CREATE_ROUTINE,
  SYSTEM_MCP_TOOLS.TASK.UPDATE_ROUTINE,
  SYSTEM_MCP_TOOLS.AGENT.LIST_AGENTS,
]

/** Off by default — must be explicitly granted. */
export const ADMINISTRATIVE_MCP_TOOLS: string[] = [
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

// ── Type ──────────────────────────────────────────────────────────────────────

export type SystemMcpTool =
  | typeof SYSTEM_MCP_TOOLS.PLATFORM[keyof typeof SYSTEM_MCP_TOOLS.PLATFORM]
  | typeof SYSTEM_MCP_TOOLS.ORG[keyof typeof SYSTEM_MCP_TOOLS.ORG]
  | typeof SYSTEM_MCP_TOOLS.PRODUCT[keyof typeof SYSTEM_MCP_TOOLS.PRODUCT]
  | typeof SYSTEM_MCP_TOOLS.PROJECT[keyof typeof SYSTEM_MCP_TOOLS.PROJECT]
  | typeof SYSTEM_MCP_TOOLS.BOARD[keyof typeof SYSTEM_MCP_TOOLS.BOARD]
  | typeof SYSTEM_MCP_TOOLS.MILESTONE[keyof typeof SYSTEM_MCP_TOOLS.MILESTONE]
  | typeof SYSTEM_MCP_TOOLS.TASK[keyof typeof SYSTEM_MCP_TOOLS.TASK]
  | typeof SYSTEM_MCP_TOOLS.AGENT[keyof typeof SYSTEM_MCP_TOOLS.AGENT]
  | typeof SYSTEM_MCP_TOOLS.LIBRARY[keyof typeof SYSTEM_MCP_TOOLS.LIBRARY]
  | typeof SYSTEM_MCP_TOOLS.GIT[keyof typeof SYSTEM_MCP_TOOLS.GIT]
  | typeof SYSTEM_MCP_TOOLS.MEMORY[keyof typeof SYSTEM_MCP_TOOLS.MEMORY]
