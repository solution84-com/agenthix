export interface ProductListItem {
  id: string
  siteId?: string
  name: string
  slug: string
  description: string | null
  status: string
  projectCount: number
}

export interface ProductProject {
  id: string
  name: string
  key: string
  description: string | null
  taskCount: number
  tasks: { runState: string; status: string }[]
}

export interface ProductDetail extends ProductListItem {
  visionStatement: string | null
  projects: ProductProject[]
}

export interface AllProject {
  id: string
  name: string
  key: string
  description: string | null
  productId: string | null
  programId: string | null
}

export interface CreateProductInput {
  name: string
  slug: string
  description?: string
  vision?: string
}

export interface ProductActions {
  createProduct?: (input: CreateProductInput) => Promise<{ id: string; slug: string }>
  updateProduct: (input: { productId: string; name?: string; slug?: string; description?: string | null; vision?: string | null; status?: 'active' | 'sunset' }) => Promise<void>
  deleteProduct: (productId: string) => Promise<void>
  createProject: (input: { name: string; description?: string; productId: string; siteId: string }) => Promise<void>
  assignProject: (input: { projectId: string; productId: string }) => Promise<void>
}
