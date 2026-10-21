export interface Product {
  id: string
  siteId: string
  name: string
  slug: string
  description: string | null
  status: 'active' | 'sunset'
  projectCount: number
  visionStatement: string | null
  updatedAt: string
}
