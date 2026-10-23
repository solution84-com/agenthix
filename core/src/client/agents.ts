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
  // The model is decided for each call by the resolver, not by the agent; `defaultModel` and `runtime` are filled with defaults.
  /** @deprecated since 1.4; stops working in 3.0. Nothing replaces it. */
  defaultModel: string
  /** @deprecated since 1.4; stops working in 3.0. Nothing replaces it. */
  runtime: AgentRuntimeName
  /** The organisation's built-in agent. */
  isKernel: boolean
  /** When a person is asked about a tool set to Ask (`APPROVALS`). */
  approval: Approval
  /** @deprecated since 1.3; stops working in 3.0. Nothing replaces it. */
  voiceEnabled: boolean
  /** @deprecated since 1.3; stops working in 3.0. Nothing replaces it. */
  voiceId: string | null
  /** @deprecated since 1.3; stops working in 3.0. Nothing replaces it. */
  voiceTtsModel: string | null
}
