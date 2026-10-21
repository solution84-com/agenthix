export interface ProgramListItem {
  id: string
  siteId?: string
  name: string
  slug: string
  description: string | null
  projectCount: number
  status?: string
}

export interface ProgramProject {
  id: string
  name: string
  key: string
  description: string | null
}

export interface ProgramDetail extends ProgramListItem {
  projects: ProgramProject[]
}

export interface AllProject {
  id: string
  name: string
  key: string
  description: string | null
  productId: string | null
  programId: string | null
}

export interface ProgramActions {
  createProgram?: (input: { name: string; slug?: string; description?: string }) => Promise<{ id: string; slug: string }>
  updateProgram: (input: { programId: string; name?: string; slug?: string; description?: string | null; status?: string }) => Promise<void>
  deleteProgram: (programId: string) => Promise<void>
  createProject: (input: { name: string; description?: string; programId: string; siteId: string }) => Promise<void>
  assignProject: (input: { projectId: string; programId: string }) => Promise<void>
}
