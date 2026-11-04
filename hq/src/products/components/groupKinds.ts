/** Products and Programs are one screen with two sets of words (every screen reviewed spec §3): both only group projects and own nothing (adr-0061). */
export type GroupKind = 'product' | 'program'

export const WORDS = {
  product: {
    plural: 'Products', one: 'product', base: '/products',
    blurb: 'What the organisation makes',
    grouping: 'a product only groups projects; it owns nothing',
    describe: 'Description',
    statuses: [['active', 'Active'], ['sunset', 'Sunset']] as Array<[string, string]>,
  },
  program: {
    plural: 'Programmes', one: 'programme', base: '/programs',
    blurb: 'A goal several projects work towards',
    grouping: 'a programme only groups projects; it owns nothing',
    describe: 'Goal',
    statuses: [['planning', 'Planning'], ['active', 'Active'], ['archived', 'Archived']] as Array<[string, string]>,
  },
} as const

export type Group = {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  _count: { projects: number }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const projectsText = (n: number) => plural(n, 'project')
