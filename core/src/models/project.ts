export interface ProjectTaskCounts {
  todo: number
  inProgress: number
  done: number
}

export interface Project {
  id: string
  siteId: string
  name: string
  key: string
  taskCounts: ProjectTaskCounts
  agentMemberCount: number
  updatedAt: string
}
