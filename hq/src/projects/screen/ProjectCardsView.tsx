import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { FolderKanban, X } from 'lucide-react'
import { FilterSelect } from '@agenthix/ui/primitives'
import { ProjectCard } from '@agenthix/ui/projects'
import { useQuery, useAction, getPins, joinProject } from 'wasp/client/operations'
import { PinButton } from '../../pins/components/PinButton'
import { pinnedProjectIds, splitPinned, type PinRef } from '../../shared/components/sidebar/projectChoices'
import { EmptyState } from '../../shared/components/ui/EmptyState'
import { useAttention } from '../../shared/components/AttentionDialog'
import type { ProjectCardLine } from '../projectCardQueries'
import { CARD_GRID, PinnedProjects } from './PinnedProjects'
import { ListControls } from './ListControls'
import { byLatestActivity, cardCounts, noMatchLine, PIN_SAYS } from './projectList'

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
  updatedAt?: string | Date
}

/**
 * The Projects page: a card for each project the person can see, filtered by product and programme. Their pinned
 * projects lead, then theirs by latest activity, then the open projects they are not in, under *Other projects you
 * can join*, each with *Join*.
 */
export function ProjectCardsView({ projects, products, programs, lineOf, isLoading, failure }: {
  projects: ProjectRow[]
  products: Named[]
  programs: Named[]
  lineOf: Map<string, ProjectCardLine>
  isLoading: boolean
  /** The list could not be read and nothing is held: said in place of the cards, never "No projects yet". */
  failure?: ReactNode
}) {
  const [productId, setProductId] = useState('')
  const [programId, setProgramId] = useState('')
  const [search, setSearch] = useState('')
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const { data: pinData } = useQuery(getPins)
  const join = useAction(joinProject)
  const attention = useAttention()
  const pins = (pinData ?? []) as PinRef[]

  const shown = projects.filter(p => {
    if (p.personalSpace) return false
    if (productId && p.productId !== productId) return false
    if (programId && p.programId !== programId) return false
    if (search.trim() && !`${p.name} ${p.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
  const ordered = byLatestActivity(shown, lineOf)
  const { pinned, rest } = splitPinned(ordered.filter(p => p.isMember), pinnedProjectIds(pins))
  const personal = rest.filter(p => p.personalOwnerId)
  const organisation = rest.filter(p => !p.personalOwnerId)
  const joinable = ordered.filter(p => !p.isMember)

  const joinIt = async (project: ProjectRow) => {
    setJoiningId(project.id)
    try {
      await join({ projectId: project.id })
    } catch (err) {
      attention.show({ title: `You did not join ${project.name}`, text: err instanceof Error ? err.message : 'HQ did not add you.', retry: () => void joinIt(project) })
    } finally {
      setJoiningId(null)
    }
  }

  const card = (project: ProjectRow) => (
    <div key={project.id} className="relative h-full">
      {project.personalOwnerId && (
        <span className="pointer-events-none absolute right-12 top-3 z-10 rounded-full bg-chip px-2 py-0.5 text-micro text-text-secondary">Only you</span>
      )}
      {project.isMember && <PinButton kind="PROJECT" itemId={project.id} says={PIN_SAYS} className="absolute right-2 top-2 z-10" />}
      <ProjectCard
        as={Link}
        to={`/projects/${project.key}`}
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          counts: cardCounts(lineOf.get(project.id), project.isMember),
          notJoined: !project.isMember,
          onJoin: () => void joinIt(project),
          joining: joiningId === project.id,
        }}
      />
    </div>
  )
  const product = products.find(p => p.id === productId)
  const program = programs.find(p => p.id === programId)

  return (
    <>
      <ListControls search={search} onSearch={setSearch} searchLabel="Search projects">
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-micro font-medium text-text-primary">
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
      </ListControls>

      {failure ? (
        failure
      ) : isLoading ? (
        <div className="text-body text-text-muted">Loading…</div>
      ) : !projects.some(p => !p.personalSpace) ? (
        <EmptyState icon={FolderKanban} title="No projects yet" hint="New project makes the first one." />
      ) : !shown.length ? (
        <div className="text-body text-text-muted">{noMatchLine(search, [product?.name, program?.name])}</div>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && <PinnedProjects projects={pinned} pins={pins} card={card} />}
          {personal.length > 0 && (
            <section aria-labelledby="personal-projects-heading">
              <h2 id="personal-projects-heading" className="text-body font-medium text-text-primary">Your personal projects</h2>
              <p className="mb-2 text-small text-text-muted">Only you see these.</p>
              <div className={CARD_GRID}>{personal.map(card)}</div>
            </section>
          )}
          {organisation.length > 0 && (
            <section aria-label="Projects">
              {(personal.length > 0 || pinned.length > 0) && <h2 className="mb-2 text-body font-medium text-text-primary">Your projects</h2>}
              <div className={CARD_GRID}>{organisation.map(card)}</div>
            </section>
          )}
          {joinable.length > 0 && (
            <section aria-labelledby="joinable-projects-heading">
              <h2 id="joinable-projects-heading" className="mb-2 text-body font-medium text-text-primary">Other projects you can join · {joinable.length}</h2>
              <div className={CARD_GRID}>{joinable.map(card)}</div>
            </section>
          )}
        </div>
      )}
      {attention.dialog}
    </>
  )
}
