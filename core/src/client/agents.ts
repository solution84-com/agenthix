/** The organisation's agents as a client lists them (`getAgents`): its pickers and the agent's facts. */
import type { Approval } from '../protocol/capability.js'

export type AgentListItem = {
  id: string
  name: string
  handle: string
  role: string | null
  /** Server-relative; loading it needs the person's session. */
  avatarUrl: string | null
  /** The organisation's built-in agent. */
  isKernel: boolean
  /** When a person is asked about a tool set to Ask (`APPROVALS`). */
  approval: Approval
}
