import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAction, createSkillDraft, createPlaceSkillDraft } from 'wasp/client/operations'
import { isAssetName } from '@agenthix/core'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { LIBRARY_PATH } from '../../../library/components/libraryRoutes'
import { DESCRIPTION_MAX } from '../../validation'
import { useAskAgent } from './askAgent'
import { assetEditPath, placeSkillEditPath } from './editorRoutes'
import { newSkillProblems, newSkillRequest, type StartingPoint } from './newSkill'

const CHOICES: { id: StartingPoint; label: string; help: string }[] = [
  { id: 'plain', label: 'A plain skill', help: 'SKILL.md with the usual headings' },
  { id: 'scripts', label: 'A skill with scripts', help: 'Adds scripts/ and references/, as the Agent Skills format lays out' },
  { id: 'agent', label: 'Ask an agent to write it', help: 'Opens a conversation with the skill creator; the agent fills the draft' },
]

const FIELD = 'mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent'

/**
 * New skill (board U3b section 1): a name and what it does and when to use it, checked as they are typed against the
 * Agent Skills rules, then a draft opens in the editor. Nothing is installed until a person publishes it as version 1.
 */
export function NewSkillPage() {
  const navigate = useNavigate()
  const create = useAction(createSkillDraft)
  const createInPlace = useAction(createPlaceSkillDraft)
  const [params] = useSearchParams()
  const place = params.get('place')
  const forAgent = params.get('agent')
  const agent = useAskAgent()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [start, setStart] = useState<StartingPoint>('plain')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const problems = useMemo(() => newSkillProblems(name, description), [name, description])
  const ready = problems.name === null && problems.description === null && isAssetName(name) && description.trim() !== ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setError('')
    if (start === 'agent') {
      if (await agent.ask(newSkillRequest(name, description))) navigate(LIBRARY_PATH)
      return
    }
    setBusy(true)
    try {
      if (place) {
        const made = await createInPlace({ projectId: place, name, description, shape: start, agentId: forAgent ?? undefined })
        navigate(placeSkillEditPath(made.placeSkillId))
      } else {
        const made = await create({ name, description, shape: start })
        navigate(assetEditPath(made.assetId))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The draft could not be made. Nothing was changed.')
      setBusy(false)
    }
  }

  return (
    <AppLayout breadcrumbs={[{ label: 'Library', href: LIBRARY_PATH }, { label: 'New skill' }]} title="New skill" subtitle={place ? 'For this place’s files. You can change everything later.' : 'Made here. You can change everything later.'}>
      <form onSubmit={e => void submit(e)} className="mx-auto max-w-2xl px-4 py-5 lg:px-8" data-testid="new-skill">
        <label className="block text-small font-medium text-text-secondary" htmlFor="skill-name">Name</label>
        <input id="skill-name" className={`${FIELD} font-mono`} value={name} onChange={e => setName(e.target.value)} placeholder="release-notes" autoFocus aria-describedby="skill-name-help" />
        <p id="skill-name-help" className={`mt-1 text-small ${problems.name ? 'text-danger' : 'text-text-muted'}`} role={problems.name ? 'alert' : undefined}>
          {problems.name ?? 'Lowercase letters, digits and hyphens. It’s also the skill’s folder name.'}
        </p>

        <label className="mt-4 block text-small font-medium text-text-secondary" htmlFor="skill-description">What it does, and when to use it</label>
        <textarea
          id="skill-description" className={FIELD} rows={3} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Write release notes from the merged pull requests since the last tag. Use when asked for release notes or a changelog."
          aria-describedby="skill-description-help"
        />
        <p id="skill-description-help" className={`mt-1 text-small ${problems.description ? 'text-danger' : 'text-text-muted'}`} role={problems.description ? 'alert' : undefined}>
          {problems.description ?? `Agents read this to decide when the skill fits. ${description.trim().length} of ${DESCRIPTION_MAX.toLocaleString('en-GB')} characters.`}
        </p>

        <fieldset className="mt-4">
          <legend className="text-small font-medium text-text-secondary">Start from</legend>
          <div className="mt-1 flex flex-col gap-1.5">
            {CHOICES.map(c => (
              <label key={c.id} className="flex items-start gap-2 rounded-lg border border-border-subtle px-3 py-2 text-small">
                <input type="radio" name="start" className="mt-1" checked={start === c.id} onChange={() => setStart(c.id)} />
                <span><span className="font-medium text-text-primary">{c.label}</span> <span className="text-text-secondary">{c.help}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        {(error || agent.error) && <p role="alert" className="mt-3 text-small text-danger">{error || agent.error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Link to={LIBRARY_PATH} className="rounded-button border border-border px-4 py-2 text-body text-text-primary hover:bg-surface-hover">Cancel</Link>
          <Button type="submit" disabled={!ready || busy || agent.sending}>{start === 'agent' ? 'Ask an agent' : 'Create draft'}</Button>
        </div>
      </form>
    </AppLayout>
  )
}
