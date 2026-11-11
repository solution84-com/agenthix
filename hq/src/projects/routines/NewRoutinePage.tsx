import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Pencil } from 'lucide-react'
import { useAction, createRoutine } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { AppShell } from '../../shared/layouts/AppShell'
import { FormTopBar } from '../../shared/layouts/TopBar'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { refusalText } from '../../shared/refusal'
import { placeNavOf } from '../../places/placeNav'
import { useProjectPlace } from '../place/useProjectPlace'
import { useProjectAgents } from '../hooks/useProjectAgents'
import { useWorkroomClock } from '../workroom/useWorkroomLive'
import { AgentField, ModelField, RoutineDetails, WhereFact } from './RoutineDetails'
import { NewInstructions } from './RoutineInstructions'
import { ScheduleBuilder } from './ScheduleBuilder'
import { ROUTINES_SECTION, routineHref, routinesHref } from './routineAddresses'
import { FIELD } from './routineStyles'
import { NEW_ROUTINE_CRON, draftOf, draftProblem, ownTimezone } from './scheduleDraft'

/** Why Create routine is greyed, said on it: what is still missing, in the order the page asks for it. */
export function createWhy(v: { title: string; instructions: string; agentId: string | null }, scheduleProblem: string | null, viewer: boolean): string | undefined {
  if (viewer) return VIEWER_CANNOT_WORK
  if (!v.title.trim()) return 'Give it a name'
  if (!v.instructions.trim()) return 'Write what the agent should do each time'
  if (!v.agentId) return 'Choose its agent'
  return scheduleProblem ?? undefined
}

/**
 * New routine (the Routines design, "New routine"): the routine's page with nothing in it, at
 * `/projects/:key/routines/new` — its name, its instructions open in Write, then its Details with the schedule builder
 * open. It starts on, on behalf of whoever makes it, and its first run is the first time the read-back lists. On a
 * phone a focused form: ✕, the title and Create routine. `?space=1`: the person's own space, where it goes back to.
 */
export function NewRoutinePage() {
  const { key = '' } = useParams<{ key: string }>()
  const [params] = useSearchParams()
  const space = params.get('space') === '1'
  const navigate = useNavigate()
  const { project, place } = useProjectPlace(key)
  const mayWork = useMayWork(project?.id)
  const agents = useProjectAgents(project?.id)
  const { now } = useWorkroomClock()
  const create = useAction(createRoutine)
  const attention = useAttention()
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [agentId, setAgentId] = useState<string | null>(null)
  const [modelChoice, setModelChoice] = useState('')
  const [draft, setDraft] = useState(() => draftOf(NEW_ROUTINE_CRON, ownTimezone()))
  const [busy, setBusy] = useState(false)

  const here = { key: space ? null : key }
  const back = () => navigate(routinesHref(here))
  const problem = draftProblem(draft)
  const why = !project ? 'Loading' : createWhy({ title, instructions, agentId }, problem?.text ?? null, !mayWork)
  const submit = async () => {
    if (!project || why || busy) return
    setBusy(true)
    try {
      const { id } = await create({
        projectId: project.id, title: title.trim(), instructions: instructions.trim(), agentId,
        cron: draft.cron.trim(), timezone: draft.timezone, modelChoice: modelChoice || null,
      })
      navigate(routineHref(here, id))
    } catch (e) {
      attention.show({ title: 'The routine was not made', text: refusalText(e, 'That did not work. Nothing was changed.'), retry: () => void submit() })
    } finally {
      setBusy(false)
    }
  }
  const name = space ? 'Your space' : project?.name
  const listHref = routinesHref(here)
  const breadcrumbs = space
    ? [{ label: 'Your space', href: '/chat' }, { label: 'Routines', href: listHref }, { label: 'New routine' }]
    : [
        { label: 'Projects', href: '/projects' },
        ...(project ? [{ label: project.name, href: place?.homePath, list: 'projects' as const }] : []),
        { label: 'Routines', href: listHref },
        { label: 'New routine' },
      ]
  const submitButton = { label: 'Create routine', onClick: () => void submit(), disabled: !!why || busy, why }

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      placeNav={place && !space ? placeNavOf(place, ROUTINES_SECTION) : null}
      mobileHeader={<FormTopBar title="New routine" under={[name, 'Routines'].filter(Boolean).join(' · ')} onCancel={back} submit={submitButton} />}
    >
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-4 px-6 pb-6 pt-4 max-lg:px-3 max-lg:pt-3">
          <header className="flex items-center gap-3 max-lg:hidden">
            <h1 className="min-w-0 flex-1 truncate text-h2 font-medium text-text-primary">New routine</h1>
            <Button variant="secondary" onClick={back}>Cancel</Button>
            <Button onClick={submitButton.onClick} disabled={submitButton.disabled} title={why}>Create routine</Button>
          </header>
          <label className="relative block">
            <input
              autoFocus aria-label="Name" value={title} placeholder="Name, e.g. Weekly link check" onChange={e => setTitle(e.target.value)}
              className={`${FIELD} w-full pr-9 text-h3`}
            />
            <Pencil size={14} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
          </label>
          <div>
            <p className="mb-2 text-micro font-medium uppercase tracking-wide text-text-muted max-sm:text-small max-sm:font-normal max-sm:normal-case max-sm:tracking-normal max-sm:text-text-secondary">Instructions</p>
            <NewInstructions value={instructions} onChange={setInstructions} />
          </div>
          {project && (
            <RoutineDetails
              agent={<AgentField agentId={agentId} agents={agents} onChange={setAgentId} />}
              model={<ModelField projectId={project.id} agentId={agentId} value={modelChoice} onChange={setModelChoice} />}
              repeats={(
                <div className="flex flex-col gap-2">
                  <ScheduleBuilder draft={draft} onChange={setDraft} now={now} />
                  <p className="text-micro text-text-muted">It starts on; its first run is the first time above.</p>
                </div>
              )}
              onBehalfOf={<span>You</span>}
              where={<WhereFact projectId={project.id} name={name ?? ''} />}
            />
          )}
        </div>
      </main>
      {attention.dialog}
    </AppShell>
  )
}
