/**
 * SystemCapabilitiesSection
 * =========================
 * Renders platform tool groups in PermissionsTab, organised by domain —
 * matching the canonical tool reference in docs/domains/tools/tools.md.
 *
 * Always-injected tools (PLATFORM + CORE) are shown as greyed-out chips.
 * Configurable tools are grouped by domain with always/ask/never toggles.
 */
import { SYSTEM_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS } from '../mcpTools'
import type { SystemMcpTool } from '../mcpTools'
import type { ToolPermission, ToolPermissionState } from '../permissionTypes'
import { ToolStateToggle, SetAllControl } from './ToolStateToggle'

// ── Default state for null toolPermissions ────────────────────────────────────

import { ADMINISTRATIVE_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS } from '../mcpTools'

function defaultState(rawName: string): ToolPermissionState {
  if (ALWAYS_INJECTED_MCP_TOOLS.includes(rawName)) return 'always'
  if ((DEFAULT_ON_MCP_TOOLS as string[]).includes(rawName)) return 'always'
  if ((ADMINISTRATIVE_MCP_TOOLS as string[]).includes(rawName)) return 'never'
  return 'never'
}

// ── Tool catalogue with user-facing labels ────────────────────────────────────

interface ToolDef { rawName: string; label: string }

function tool(rawName: SystemMcpTool, label: string): ToolDef {
  return { rawName, label }
}

export const DOMAIN_GROUPS: { title: string; tools: ToolDef[] }[] = [
  {
    title: 'ORG',
    tools: [
      tool(SYSTEM_MCP_TOOLS.ORG.GET_ORG,     'Read organisation info'),
      tool(SYSTEM_MCP_TOOLS.ORG.LIST_TEAMS,  'List teams'),
      tool(SYSTEM_MCP_TOOLS.ORG.UPDATE_ORG,  'Update organisation settings'),
      tool(SYSTEM_MCP_TOOLS.ORG.CREATE_TEAM, 'Create teams'),
    ],
  },
  {
    title: 'PRODUCT',
    tools: [
      tool(SYSTEM_MCP_TOOLS.PRODUCT.LIST_PRODUCTS,       'List products this agent is a member of'),
      tool(SYSTEM_MCP_TOOLS.PRODUCT.GET_PRODUCT,         'Read product details'),
      tool(SYSTEM_MCP_TOOLS.PRODUCT.CREATE_PRODUCT,      'Create products'),
      tool(SYSTEM_MCP_TOOLS.PRODUCT.UPDATE_PRODUCT,      'Update product details'),
      tool(SYSTEM_MCP_TOOLS.PRODUCT.DELETE_PRODUCT,      'Delete products'),
      tool(SYSTEM_MCP_TOOLS.PRODUCT.REQUEST_PRODUCT_GIT, 'Product wiki git access'),
    ],
  },
  {
    title: 'PROJECT',
    tools: [
      tool(SYSTEM_MCP_TOOLS.PROJECT.LIST_PROJECTS,       'List projects'),
      tool(SYSTEM_MCP_TOOLS.PROJECT.REQUEST_PROJECT_GIT, 'Project codebase git access'),
      tool(SYSTEM_MCP_TOOLS.PROJECT.CREATE_PROJECT,      'Create projects'),
    ],
  },
  {
    title: 'BOARD',
    tools: [
      tool(SYSTEM_MCP_TOOLS.BOARD.LIST_BOARDS,  'List boards'),
      tool(SYSTEM_MCP_TOOLS.BOARD.GET_BOARD,    'Read board stages'),
      tool(SYSTEM_MCP_TOOLS.BOARD.CREATE_BOARD, 'Create boards'),
    ],
  },
  {
    title: 'TASK',
    tools: [
      tool(SYSTEM_MCP_TOOLS.TASK.LIST_TASKS,   'List & search tasks'),
      tool(SYSTEM_MCP_TOOLS.TASK.CREATE_TASK,  'Create tasks'),
      tool(SYSTEM_MCP_TOOLS.TASK.UPDATE_TASK,  'Update tasks'),
      tool(SYSTEM_MCP_TOOLS.TASK.ATTACH_FILE,  'Attach files to tasks'),
      tool(SYSTEM_MCP_TOOLS.TASK.ARCHIVE_TASK, 'Archive tasks'),
      tool(SYSTEM_MCP_TOOLS.TASK.DELETE_TASK,  'Delete tasks'),
    ],
  },
  {
    title: 'AGENT',
    tools: [
      tool(SYSTEM_MCP_TOOLS.AGENT.LIST_AGENTS,       'List agents'),
      tool(SYSTEM_MCP_TOOLS.AGENT.CREATE_AGENT,       'Create agents'),
      tool(SYSTEM_MCP_TOOLS.AGENT.GENERATE_AGENT_PICTURE, "Make agents' pictures"),
    ],
  },
  {
    title: 'LIBRARY',
    tools: [
      tool(SYSTEM_MCP_TOOLS.LIBRARY.LIST_WORKFORCE_TEMPLATES,   'List workforce templates'),
      tool(SYSTEM_MCP_TOOLS.LIBRARY.PROPOSE_WORKFORCE_TEMPLATE, 'Propose workforce templates'),
    ],
  },
  {
    title: 'GIT',
    tools: [
      tool(SYSTEM_MCP_TOOLS.GIT.GET_GITHUB_CONFIG, 'GitHub configuration'),
    ],
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function AlwaysInjectedChips() {
  const names = ALWAYS_INJECTED_MCP_TOOLS.map(n => n.replace(/_/g, ' '))
  return (
    <div>
      <p className="text-micro font-medium uppercase tracking-wide text-text-muted/70 mb-1">Core — always injected</p>
      <p className="text-micro text-text-muted/70 mb-2">Always available — required for basic agent operation.</p>
      <div className="flex flex-wrap gap-1.5">
        {names.map(name => (
          <span key={name} className="px-2 py-0.5 rounded-full text-micro font-mono text-text-muted bg-surface-1 border border-border-subtle">
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

interface DomainGroupProps {
  title: string
  tools: ToolDef[]
  getState: (rawName: string) => ToolPermissionState
  onStateChange: (rawName: string, state: ToolPermissionState) => void
  onSetAll: (state: ToolPermissionState) => void
}

function DomainGroup({ title, tools, getState, onStateChange, onSetAll }: DomainGroupProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-micro font-medium uppercase tracking-wide text-text-secondary pl-2 border-l-2 border-border">{title}</p>
        <SetAllControl onSetAll={onSetAll} />
      </div>
      <div className="space-y-1.5">
        {tools.map(({ rawName, label }) => (
          <div key={rawName} className="flex items-center justify-between gap-3">
            <span className="text-body text-text-secondary">{label}</span>
            <ToolStateToggle
              state={getState(rawName)}
              onChange={(s) => onStateChange(rawName, s)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  toolPermissions: ToolPermission[] | null
  onStateChange: (rawName: string, state: ToolPermissionState) => void
  onSetAll: (state: ToolPermissionState) => void
}

export function SystemCapabilitiesSection({ toolPermissions, onStateChange, onSetAll }: Props) {
  const getState = (rawName: string): ToolPermissionState => {
    if (toolPermissions === null) return defaultState(rawName)
    const entry = toolPermissions.find(p => p.name === rawName)
    return entry?.state ?? defaultState(rawName)
  }

  return (
    <div className="space-y-5">
      <AlwaysInjectedChips />
      <div className="flex items-center justify-between">
        <p className="text-micro font-medium uppercase tracking-wide text-text-muted/70">Configurable capabilities</p>
        <SetAllControl onSetAll={onSetAll} />
      </div>
      {DOMAIN_GROUPS.map(group => (
        <DomainGroup
          key={group.title}
          title={group.title}
          tools={group.tools}
          getState={getState}
          onStateChange={onStateChange}
          onSetAll={(s) => group.tools.forEach(t => onStateChange(t.rawName, s))}
        />
      ))}
    </div>
  )
}
