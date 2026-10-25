/**
 * The tools reference of the platform guide, written from hq's tool registry (shared/mcpTools.ts) and the schemas
 * beside it (server/controlplane/toolSchemas.ts), never by hand, so it cannot disagree with the tools. A tool in no access tier
 * (such as the lead's own suggest_place) is offered to no run and is left out.
 */
import type { ZodRawShape } from 'zod'
import { ADMINISTRATIVE_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, SYSTEM_MCP_TOOLS } from '../../shared/mcpTools'
import { ALL_CONTROL_PLANE_TOOLS } from '../../server/controlplane/toolSchemas'

type Described = { description?: string; schema: ZodRawShape }

/** The knowledge tools that change a page: a run's site gives them only to a run that may change files. */
const KNOWLEDGE_CHANGE_TOOLS: string[] = [
  SYSTEM_MCP_TOOLS.KNOWLEDGE.WRITE_KNOWLEDGE,
  SYSTEM_MCP_TOOLS.KNOWLEDGE.EDIT_KNOWLEDGE,
  SYSTEM_MCP_TOOLS.KNOWLEDGE.DELETE_KNOWLEDGE,
]

const TIERS = [
  { title: 'Given to every run', who: 'Every run has these.', names: ALWAYS_INJECTED_MCP_TOOLS.filter(n => !KNOWLEDGE_CHANGE_TOOLS.includes(n)) },
  { title: 'Given to runs that may change files', who: 'A run has these only when it may change files, and a change to the organisation\'s knowledge only when it acts for an organisation admin. Every run can search and read knowledge.', names: KNOWLEDGE_CHANGE_TOOLS },
  { title: 'Given unless an agent limits its tools', who: 'A run has these unless its agent was set up with a narrower list of tools.', names: DEFAULT_ON_MCP_TOOLS },
  { title: 'Given only when granted', who: 'A run has these only when its agent was explicitly allowed them.', names: ADMINISTRATIVE_MCP_TOOLS },
] as const

/** What a parameter is, in a line: its name, and what it says when it says anything. */
function parameterLine(name: string, shape: ZodRawShape): string {
  const field = shape[name]
  const said = (field as { description?: string } | undefined)?.description
  return said ? `${name} (${said})` : name
}

function whatItDoes(tool: Described | undefined): string {
  if (tool?.description) return tool.description
  const names = tool ? Object.keys(tool.schema) : []
  if (!tool || names.length === 0) return 'Takes no arguments.'
  return `Takes: ${names.map(n => parameterLine(n, tool.schema)).join('; ')}.`
}

export function toolsReference(): string {
  const byName = new Map(ALL_CONTROL_PLANE_TOOLS.map(t => [t.name, t]))
  const sections = TIERS.map(tier => {
    const entries = [...tier.names].sort().map(name => `### ${name}\n\n${whatItDoes(byName.get(name))}`)
    return `## ${tier.title}\n\n${tier.who}\n\n${entries.join('\n\n')}`
  })
  return [
    '---',
    'title: Agent tools',
    'description: The tools an agent has in a run, what each does and which runs get it.',
    '---',
    '',
    '# Agent tools',
    '',
    'The tools an agent has in a run. A person sees them in an agent\'s permissions; an agent may use only what it is given.',
    '',
    sections.join('\n\n'),
    '',
  ].join('\n')
}
