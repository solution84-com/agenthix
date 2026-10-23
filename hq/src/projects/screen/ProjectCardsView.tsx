import { useState } from 'react'
import { Link } from 'react-router'
import { FolderKanban, X } from 'lucide-react'
import { FilterSelect } from '@agenthix/ui/primitives'
import { ProjectCard } from '@agenthix/ui/projects'
import type { ProjectCardLine } from '../projectCardQueries'
import { EmptyState } from '../../shared/components/ui/EmptyState'
import { projectCardNow } from '../pages/projectCardNow'
import { ProjectsControls } from './ProjectsControls'
import { useProjectsScreenUrl } from './projectsScreenUrl'

type Named = { id: string; name: string }

/** The fields of `getProjects` rows that the Projects screen reads. */
export interface ProjectRow {
  id: string
  key: string
  name: string
  description: string | null
  productId: string | null
  programId: string | null
  executionSiteId: string | null
  /** Set on a personal project: the person's own, in the list under *Your personal projects*. */
  personalOwnerId: string | null
  /** Your space, which is Chat and has its own entry in the navigation. */
  personalSpace?: boolean
  isMember: boolean
  myRole: 'ADMIN' | 'MEMBER' | 'VIEWER' | null
  boards?: { id: string }[]
  tasks?: { status: string }[]
}

/** The Projects view: a card for each project the person can see, filtered by product and programme. */
export function ProjectCardsView({ projects, products, programs, lineOf, isLoading }: {
  projects: ProjectRow[]
  products: Named[]
  programs: Named[]
  lineOf: Map<string, ProjectCardLine>
  isLoading: boolean
}) {
  const { toProjectBoards } = useProjectsScreenUrl()
  const [productId, setProductId] = useState('')
  const [programId, setProgramId] = useState('')
  const [search, setSearch] = useState('')
  const nowAt = new Date()

  const shown = projects.filter(p => {
    if (p.personalSpace) return false
    if (productId && p.productId !== productId) return false
    if (programId && p.programId !== programId) return false
    if (search.trim() && !`${p.name} ${p.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
  const personal = shown.filter(p => p.personalOwnerId)
  const organisation = shown.filter(p => !p.personalOwnerId)
  const card = (project: ProjectRow) => (
    <div key={project.id} className="relative">
      {project.personalOwnerId && (
        <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-surface-3 px-2 py-0.5 text-micro text-text-secondary">Only you</span>
      )}
      <ProjectCard
        as={Link}
        to={`/projects/${project.key}`}
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          now: project.isMember === false ? { state: 'quiet' as const } : projectCardNow(lineOf.get(project.id), nowAt),
          notJoined: project.isMember === false,
          boardCount: project.boards?.length ?? 0,
          doneTaskCount: project.tasks?.filter(t => t.status === 'DONE').length ?? 0,
          totalTaskCount: project.tasks?.length ?? 0,
          onOpenBoards: () => toProjectBoards(project.key),
        }}
      />
    </div>
  )
  const product = products.find(p => p.id === productId)
  const program = programs.find(p => p.id === programId)

  return (
    <>
      <ProjectsControls search={search} onSearch={setSearch} searchLabel="Search projects">
        {products.length > 0 && (
          <FilterSelect label="Product" value={productId} onChange={setProductId}>
            <option value="">All products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
        )}
        {programs.length > 0 && (
          <FilterSelect label="Programme" value={programId} onChange={setProgramId}>
            <option value="">All programmes</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
        )}
        {product && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/15 px-2.5 py-1 text-micro font-medium text-accent">
            {product.name}
            <button type="button" aria-label={`Clear ${product.name}`} onClick={() => setProductId('')} className="hover:text-text-primary"><X size={10} /></button>
          </span>
        )}
        {program && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/15 px-2.5 py-1 text-micro font-medium text-success">
            {program.name}
            <button type="button" aria-label={`Clear ${program.name}`} onClick={() => setProgramId('')} className="hover:text-text-primary"><X size={10} /></button>
          </span>
        )}
      </ProjectsControls>

      {isLoading ? (
        <div className="text-body text-text-muted">Loading...</div>
      ) : !projects.some(p => !p.personalSpace) ? (
        <EmptyState icon={FolderKanban} title="No projects yet" hint="Create your first project to start managing tasks" />
      ) : !shown.length ? (
        <div className="text-body text-text-muted">No projects match the current filters.</div>
      ) : (
        <div className="space-y-6">
          {personal.length > 0 && (
            <section aria-labelledby="personal-projects-heading">
              <h2 id="personal-projects-heading" className="text-body font-medium text-text-primary">Your personal projects</h2>
              <p className="mb-2 text-small text-text-muted">Only you see these.</p>
              <div className="grid grid-cols-1 gap-1 md:grid-cols-2 md:gap-4 lg:grid-cols-3">{personal.map(card)}</div>
            </section>
          )}
          {organisation.length > 0 && (
            <section aria-label="Projects">
              {personal.length > 0 && <h2 className="mb-2 text-body font-medium text-text-primary">Projects</h2>}
              <div className="grid grid-cols-1 gap-1 md:grid-cols-2 md:gap-4 lg:grid-cols-3">{organisation.map(card)}</div>
            </section>
          )}
        </div>
      )}
    </>
  )
}
