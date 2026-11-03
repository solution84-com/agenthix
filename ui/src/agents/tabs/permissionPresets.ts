/**
 * permissionPresets
 * =================
 * Named permission presets for PermissionsTab — tool catalogues and preset definitions. A preset fills in
 * only the tools and bash patterns; it never sets approval, which is where bypassing lives. A preset that offers
 * bash sets it — "Any other command", what a command matching none of its patterns gets — to Ask.
 * Kept in a separate module to keep PermissionsTab.tsx focused on component logic.
 */
import { SYSTEM_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, ADMINISTRATIVE_MCP_TOOLS } from '../mcpTools'
import { RUNTIME_TOOLS, DEFAULT_RUNTIME_TOOLS } from '../runtimeTools'
import { DOMAIN_GROUPS } from './SystemCapabilitiesSection'
import { DEFAULT_TOOL_PERMISSIONS } from '../toolPermissions'
import type { ToolPermission, BashPatternPermission, ToolPermissionState } from '../permissionTypes'

// ── Tool catalogues ───────────────────────────────────────────────────────────

export const FILESYSTEM_TOOLS: { name: string; label: string }[] = [
  { name: RUNTIME_TOOLS.FILESYSTEM.READ_FILE,  label: 'Read' },
  { name: RUNTIME_TOOLS.FILESYSTEM.EDIT_FILE,  label: 'Edit' },
  { name: RUNTIME_TOOLS.FILESYSTEM.WRITE_FILE, label: 'Write' },
  { name: RUNTIME_TOOLS.FILESYSTEM.GLOB_FILES, label: 'Glob (find files by pattern)' },
  { name: RUNTIME_TOOLS.FILESYSTEM.GREP_FILES, label: 'Grep (search file contents)' },
  { name: 'Agent',                             label: 'Agent (spawn sub-agents)' },
]

export const WEB_TOOLS: { name: string; label: string }[] = [
  { name: RUNTIME_TOOLS.WEB.WEB_FETCH,  label: 'WebFetch — fetch a specific URL' },
  { name: RUNTIME_TOOLS.WEB.WEB_SEARCH, label: 'WebSearch — run search queries' },
]

export const ALL_CONFIGURABLE_TOOL_NAMES: string[] = [
  ...FILESYSTEM_TOOLS.map(t => t.name),
  RUNTIME_TOOLS.BASH.BASH,
  ...WEB_TOOLS.map(t => t.name),
  ...DOMAIN_GROUPS.flatMap(g => g.tools.map(t => t.rawName)),
]

// ── Preset builder ────────────────────────────────────────────────────────────

function perms(entries: { names: string[]; state: ToolPermissionState }[]): ToolPermission[] {
  const map = new Map<string, ToolPermission>()
  for (const { names, state } of entries) {
    for (const name of names) map.set(name, { name, state })
  }
  return [...map.values()]
}

const READ_ONLY_MCP_TOOLS = [
  SYSTEM_MCP_TOOLS.ORG.GET_ORG,
  SYSTEM_MCP_TOOLS.ORG.LIST_TEAMS,
  SYSTEM_MCP_TOOLS.PRODUCT.REQUEST_PRODUCT_GIT,
  SYSTEM_MCP_TOOLS.PROJECT.LIST_PROJECTS,
  SYSTEM_MCP_TOOLS.PROJECT.REQUEST_PROJECT_GIT,
  SYSTEM_MCP_TOOLS.BOARD.LIST_BOARDS,
  SYSTEM_MCP_TOOLS.BOARD.GET_BOARD,
  SYSTEM_MCP_TOOLS.TASK.LIST_TASKS,
  SYSTEM_MCP_TOOLS.AGENT.LIST_AGENTS,
]

// ── Preset definitions ────────────────────────────────────────────────────────

export interface PermissionPreset {
  id: string
  label: string
  /** What the preset grants, in words a person reads before picking it: never more than its tools and patterns allow. */
  description: string
  dot: string  // tailwind bg color for the indicator dot
  tools: ToolPermission[]
  bashPatterns: BashPatternPermission[]
}

export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    id: 'safe',
    label: 'Safe',
    description: 'Filesystem + standard MCP. No bash or web.',
    dot: 'bg-emerald-500',
    tools: DEFAULT_TOOL_PERMISSIONS,
    bashPatterns: [],
  },
  {
    id: 'read-only',
    label: 'Read only',
    description: 'Read files and observe workspace. No mutations.',
    dot: 'bg-blue-500',
    tools: perms([
      { names: [RUNTIME_TOOLS.FILESYSTEM.READ_FILE, RUNTIME_TOOLS.FILESYSTEM.GLOB_FILES, RUNTIME_TOOLS.FILESYSTEM.GREP_FILES], state: 'always' },
      { names: [RUNTIME_TOOLS.FILESYSTEM.EDIT_FILE, RUNTIME_TOOLS.FILESYSTEM.WRITE_FILE, 'Agent', RUNTIME_TOOLS.BASH.BASH, RUNTIME_TOOLS.WEB.WEB_FETCH, RUNTIME_TOOLS.WEB.WEB_SEARCH], state: 'never' },
      { names: READ_ONLY_MCP_TOOLS, state: 'always' },
      { names: [...DEFAULT_ON_MCP_TOOLS.filter(t => !(READ_ONLY_MCP_TOOLS as string[]).includes(t)), ...ADMINISTRATIVE_MCP_TOOLS], state: 'never' },
    ]),
    bashPatterns: [],
  },
  {
    id: 'developer',
    label: 'Developer',
    description: 'Reads and changes files, and uses the standard platform tools. Runs git, npm run, pnpm and ls without asking: these run the project\'s own scripts and Git hooks. Any other command is asked about.',
    dot: 'bg-amber-500',
    tools: perms([
      { names: DEFAULT_RUNTIME_TOOLS, state: 'always' },
      { names: ['Agent', RUNTIME_TOOLS.WEB.WEB_FETCH, RUNTIME_TOOLS.BASH.BASH], state: 'ask' },
      { names: [RUNTIME_TOOLS.WEB.WEB_SEARCH], state: 'never' },
      { names: DEFAULT_ON_MCP_TOOLS, state: 'always' },
      { names: ADMINISTRATIVE_MCP_TOOLS, state: 'never' },
    ]),
    bashPatterns: [
      { pattern: 'git',     state: 'always' },
      { pattern: 'npm run', state: 'always' },
      { pattern: 'pnpm',    state: 'always' },
      { pattern: 'ls',      state: 'always' },
    ],
  },
  {
    id: 'product-manager',
    label: 'Product manager',
    description: 'Writes documents, and manages tasks and products. Runs git without asking, which can run the repository\'s own Git hooks. Any other command, and the web, is asked about.',
    dot: 'bg-purple-500',
    tools: perms([
      { names: [RUNTIME_TOOLS.FILESYSTEM.READ_FILE, RUNTIME_TOOLS.FILESYSTEM.GLOB_FILES, RUNTIME_TOOLS.FILESYSTEM.GREP_FILES, RUNTIME_TOOLS.FILESYSTEM.EDIT_FILE, RUNTIME_TOOLS.FILESYSTEM.WRITE_FILE], state: 'always' },
      { names: ['Agent'], state: 'never' },
      { names: [RUNTIME_TOOLS.BASH.BASH, RUNTIME_TOOLS.WEB.WEB_FETCH, RUNTIME_TOOLS.WEB.WEB_SEARCH], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.ORG.GET_ORG, SYSTEM_MCP_TOOLS.ORG.LIST_TEAMS], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.ORG.UPDATE_ORG, SYSTEM_MCP_TOOLS.ORG.CREATE_TEAM], state: 'never' },
      { names: [SYSTEM_MCP_TOOLS.PRODUCT.LIST_PRODUCTS, SYSTEM_MCP_TOOLS.PRODUCT.GET_PRODUCT, SYSTEM_MCP_TOOLS.PRODUCT.UPDATE_PRODUCT, SYSTEM_MCP_TOOLS.PRODUCT.REQUEST_PRODUCT_GIT], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.PRODUCT.CREATE_PRODUCT], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.PRODUCT.DELETE_PRODUCT], state: 'never' },
      { names: [SYSTEM_MCP_TOOLS.PROJECT.LIST_PROJECTS], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.PROJECT.REQUEST_PROJECT_GIT], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.PROJECT.CREATE_PROJECT], state: 'never' },
      { names: [SYSTEM_MCP_TOOLS.BOARD.LIST_BOARDS, SYSTEM_MCP_TOOLS.BOARD.GET_BOARD], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.BOARD.CREATE_BOARD], state: 'never' },
      { names: [SYSTEM_MCP_TOOLS.TASK.LIST_TASKS, SYSTEM_MCP_TOOLS.TASK.CREATE_TASK, SYSTEM_MCP_TOOLS.TASK.UPDATE_TASK, SYSTEM_MCP_TOOLS.TASK.ATTACH_FILE], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.TASK.ARCHIVE_TASK], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.TASK.DELETE_TASK], state: 'never' },
      { names: [SYSTEM_MCP_TOOLS.AGENT.LIST_AGENTS], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.AGENT.CREATE_AGENT, SYSTEM_MCP_TOOLS.AGENT.LIST_PRESETS, SYSTEM_MCP_TOOLS.AGENT.APPLY_AGENT_PRESET], state: 'never' },
      { names: [SYSTEM_MCP_TOOLS.LIBRARY.LIST_WORKFORCE_TEMPLATES], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.LIBRARY.PROPOSE_WORKFORCE_TEMPLATE], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.GIT.GET_GITHUB_CONFIG], state: 'never' },
    ]),
    bashPatterns: [
      { pattern: 'git', state: 'always' },
    ],
  },
  {
    id: 'project-manager',
    label: 'Project manager',
    description: 'Full project & board ops, task lifecycle management.',
    dot: 'bg-indigo-500',
    tools: perms([
      { names: [RUNTIME_TOOLS.FILESYSTEM.READ_FILE, RUNTIME_TOOLS.FILESYSTEM.GLOB_FILES, RUNTIME_TOOLS.FILESYSTEM.GREP_FILES, RUNTIME_TOOLS.FILESYSTEM.EDIT_FILE, RUNTIME_TOOLS.FILESYSTEM.WRITE_FILE], state: 'always' },
      { names: ['Agent', RUNTIME_TOOLS.BASH.BASH], state: 'never' },
      { names: [RUNTIME_TOOLS.WEB.WEB_FETCH, RUNTIME_TOOLS.WEB.WEB_SEARCH], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.ORG.GET_ORG, SYSTEM_MCP_TOOLS.ORG.LIST_TEAMS], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.ORG.UPDATE_ORG], state: 'never' },
      { names: [SYSTEM_MCP_TOOLS.ORG.CREATE_TEAM], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.PRODUCT.REQUEST_PRODUCT_GIT], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.PROJECT.LIST_PROJECTS, SYSTEM_MCP_TOOLS.PROJECT.CREATE_PROJECT], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.PROJECT.REQUEST_PROJECT_GIT], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.BOARD.LIST_BOARDS, SYSTEM_MCP_TOOLS.BOARD.GET_BOARD, SYSTEM_MCP_TOOLS.BOARD.CREATE_BOARD], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.TASK.LIST_TASKS, SYSTEM_MCP_TOOLS.TASK.CREATE_TASK, SYSTEM_MCP_TOOLS.TASK.UPDATE_TASK, SYSTEM_MCP_TOOLS.TASK.ATTACH_FILE, SYSTEM_MCP_TOOLS.TASK.ARCHIVE_TASK], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.TASK.DELETE_TASK], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.AGENT.LIST_AGENTS], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.AGENT.CREATE_AGENT, SYSTEM_MCP_TOOLS.AGENT.LIST_PRESETS, SYSTEM_MCP_TOOLS.AGENT.APPLY_AGENT_PRESET], state: 'never' },
      { names: [SYSTEM_MCP_TOOLS.LIBRARY.LIST_WORKFORCE_TEMPLATES], state: 'always' },
      { names: [SYSTEM_MCP_TOOLS.LIBRARY.PROPOSE_WORKFORCE_TEMPLATE], state: 'ask' },
      { names: [SYSTEM_MCP_TOOLS.GIT.GET_GITHUB_CONFIG], state: 'never' },
    ]),
    bashPatterns: [],
  },
]
