export type AgentStatus = 'online' | 'offline'

export interface Agent {
  id: string
  siteId: string
  name: string
  handle: string
  status: AgentStatus
  lastSeenAt: string
  activeTaskCount: number
}
