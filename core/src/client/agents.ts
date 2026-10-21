/** The organisation's agents as a client lists them (`getAgents`): its pickers, the agent's facts and its voice. */
import type { AgentRuntimeName } from '../models/modelList.js'
import type { Approval } from '../protocol/capability.js'

export type AgentListItem = {
  id: string
  name: string
  handle: string
  role: string | null
  /** Server-relative; loading it needs the person's session. */
  avatarUrl: string | null
  defaultModel: string
  runtime: AgentRuntimeName
  /** The organisation's built-in agent. */
  isKernel: boolean
  /** When a person is asked about a tool set to Ask (`APPROVALS`). */
  approval: Approval
  voiceEnabled: boolean
  voiceId: string | null
  voiceTtsModel: string | null
}
