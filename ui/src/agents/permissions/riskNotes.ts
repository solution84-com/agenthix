import { SYSTEM_MCP_TOOLS } from '../mcpTools'
import { RUNTIME_TOOLS } from '../runtimeTools'
import { toolsShown, type PermissionsDraft } from './permissionsModel'

const TASK_WRITES = new Set<string>([SYSTEM_MCP_TOOLS.TASK.CREATE_TASK, SYSTEM_MCP_TOOLS.TASK.UPDATE_TASK, SYSTEM_MCP_TOOLS.TASK.ATTACH_FILE])
const ADMINISTRATIVE = new Set<string>([
  ...Object.values(SYSTEM_MCP_TOOLS.AGENT),
  ...Object.values(SYSTEM_MCP_TOOLS.LIBRARY),
  SYSTEM_MCP_TOOLS.ORG.UPDATE_ORG,
  SYSTEM_MCP_TOOLS.ORG.CREATE_TEAM,
  SYSTEM_MCP_TOOLS.PROJECT.CREATE_PROJECT,
  SYSTEM_MCP_TOOLS.BOARD.CREATE_BOARD,
  SYSTEM_MCP_TOOLS.TASK.ARCHIVE_TASK,
  SYSTEM_MCP_TOOLS.TASK.DELETE_TASK,
  SYSTEM_MCP_TOOLS.GIT.GET_GITHUB_CONFIG,
])
const FILE_ACCESS = new Set<string>([
  RUNTIME_TOOLS.FILESYSTEM.READ_FILE, RUNTIME_TOOLS.FILESYSTEM.EDIT_FILE, RUNTIME_TOOLS.FILESYSTEM.WRITE_FILE, RUNTIME_TOOLS.BASH.BASH,
])

export type RiskNote = { tone: 'warning' | 'danger'; title: string; text: string }

/** What a page the agent reads could steer it into, when web tools and tools that change things both run unasked. */
export function riskNotes(d: PermissionsDraft): RiskNote[] {
  if (!toolsShown(d)) return []
  const always = (names: Set<string>) => d.tools.some(t => names.has(t.name) && t.state === 'always')
  const web = d.tools.some(t => (t.name === RUNTIME_TOOLS.WEB.WEB_FETCH || t.name === RUNTIME_TOOLS.WEB.WEB_SEARCH) && t.state === 'always')
  if (!web) return []
  const notes: RiskNote[] = []
  if (always(FILE_ACCESS)) notes.push({ tone: 'warning', title: 'File access.', text: 'With web on Always and files or commands on Always, a page it reads could steer it into changing files without anyone asking.' })
  if (always(TASK_WRITES)) notes.push({ tone: 'warning', title: 'Changing tasks.', text: 'With web and creating or changing tasks both on Always, a page it reads could make it change tasks without anyone asking.' })
  if (always(ADMINISTRATIVE)) notes.push({ tone: 'danger', title: 'High risk.', text: 'With web and administrative tools both on Always, a page it reads could make it create agents or change organisation settings without anyone asking.' })
  return notes
}
