export interface CreateProjectInput {
  name: string
  description?: string
  productId?: string
  programId?: string
  key?: string
}

export interface ProjectActions {
  createProject: (input: CreateProjectInput & { siteId: string }) => Promise<{ id: string }>
}
