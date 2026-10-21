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
  /** Set on a person's own project, which is their Chat. */
  personalOwnerId: string | null
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
    if (productId && p.productId !== productId) return false
    if (programId && p.programId !== programId) return false
    if (search.trim() && !`${p.name} ${p.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
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
      ) : !projects.length ? (
        <EmptyState icon={FolderKanban} title="No projects yet" hint="Create your first project to start managing tasks" />
      ) : !shown.length ? (
        <div className="text-body text-text-muted">No projects match the current filters.</div>
      ) : (
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {shown.map(project => (
            <ProjectCard
              key={project.id}
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
                onOpenBoards: project.personalOwnerId ? undefined : () => toProjectBoards(project.key),
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
