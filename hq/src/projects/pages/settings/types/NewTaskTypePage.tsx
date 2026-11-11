import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useQuery, createTaskType, createTaskTypeFromTemplate, getNewTaskTypeChoices } from 'wasp/client/operations'
import { CARD_CHOSEN, CARD_CLICKABLE } from '@agenthix/ui/primitives'
import { stateColumns, type TypeColumnDefinition } from '@agenthix/core'
import { useProjectPlace } from '../../../place/useProjectPlace'
import { useMayWork } from '../../../../shared/hooks/useMayWork'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { refusalText } from '../../../../shared/refusal'
import { StateColumnsInline } from '../../../components/TypeStateColumns'
import { settingsTabHref } from '../SettingsTabs'
import { SettingsFormFrame } from './SettingsFormFrame'
import { TypeNameField } from './TypeNameField'
import { taskTypePath } from './typePaths'
import { VIEWER_CANNOT_CHANGE_TYPES, alreadyHereWords } from './typeRules'

type Choice = { id: string; title: string; from: string | null; name: string; icon: string; columns: TypeColumnDefinition[]; assetId: string | null }

const BLANK: Choice = { id: 'blank', title: 'Blank', from: null, name: '', icon: 'task', columns: stateColumns(), assetId: null }

function ChoiceCard({ choice, on, onPick }: { choice: Choice; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button" role="radio" aria-checked={on} onClick={onPick}
      className={`flex w-full items-start gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left text-small ${CARD_CLICKABLE} ${on ? CARD_CHOSEN : ''}`}
    >
      <span aria-hidden className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${on ? 'border-accent' : 'border-border-strong'}`}>
        {on && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="block text-text-secondary"><b className="font-medium text-text-primary">{choice.title}</b> · {choice.from ?? 'One column per state'}</span>
        <StateColumnsInline columns={choice.columns} />
      </span>
    </button>
  )
}

/**
 * New task type, at `/projects/:key/settings/types/new` (spec D16): start from one of a Library template's types, or
 * Blank (one column per state); name it and pick its mark; Create type. It is a copy for this project: later changes
 * to the template don't reach it. A type the project already has is not offered twice.
 */
export function NewTaskTypePage() {
  const { key = '' } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const { project, place } = useProjectPlace(key)
  const projectId = project?.id
  const mayChange = useMayWork(projectId)
  const { data: templates } = useQuery(getNewTaskTypeChoices, projectId ? { projectId } : undefined, { enabled: !!projectId && mayChange })
  const fromBlank = useAction(createTaskType)
  const fromTemplate = useAction(createTaskTypeFromTemplate)
  const attention = useAttention()

  const choices = useMemo<Choice[]>(() => [
    ...(templates ?? []).flatMap(t => t.types.map(ty => ({
      id: `${t.assetId}:${ty.name}`, title: ty.name, from: 'From the Library', name: ty.name, icon: ty.icon, columns: ty.columns, assetId: t.assetId,
    }))),
    BLANK,
  ], [templates])
  const [picked, setPicked] = useState<string | null>(null)
  const [typed, setTyped] = useState<{ name?: string; icon?: string }>({})
  const choice = choices.find(c => c.id === picked) ?? choices[0] ?? BLANK
  const name = typed.name ?? choice.name
  const icon = typed.icon ?? choice.icon
  const here = alreadyHereWords((templates ?? []).flatMap(t => t.alreadyHere))

  const back = () => navigate(settingsTabHref(key, 'types'))
  const why = !mayChange ? VIEWER_CANNOT_CHANGE_TYPES : name.trim() === '' ? 'Give the type a name' : undefined
  const create = () => {
    if (!projectId || why) return
    const made = choice.assetId
      ? fromTemplate({ projectId, assetId: choice.assetId, typeName: choice.name, name: name.trim(), icon })
      : fromBlank({ projectId, name: name.trim(), icon })
    made.then(t => navigate(taskTypePath(key, t.id)), err => attention.show({ title: 'The type was not made', text: refusalText(err), retry: create }))
  }

  return (
    <SettingsFormFrame
      projectKey={key} place={place} projectName={project?.name} title="New task type" under="From a Library template, or blank."
      onCancel={back} submit={{ label: 'Create type', onClick: create, disabled: !!why, why }}
    >
      <div className="max-w-2xl space-y-4">
        <div>
          <p id="start-from" className="mb-1.5 text-small text-text-secondary">Start from</p>
          {!templates && mayChange ? <p className="text-small text-text-muted">Loading…</p> : (
            <div role="radiogroup" aria-labelledby="start-from" className="space-y-2">
              {choices.map(c => <ChoiceCard key={c.id} choice={c} on={c.id === choice.id} onPick={() => { setPicked(c.id); setTyped({}) }} />)}
            </div>
          )}
          {here && <p className="mt-1.5 text-micro text-text-muted">{here}</p>}
        </div>
        <div className="border-t border-border-subtle pt-4">
          <TypeNameField
            name={name} icon={icon} disabled={!mayChange}
            onName={n => setTyped(t => ({ ...t, name: n }))} onIcon={i => setTyped(t => ({ ...t, icon: i }))}
            hint="A copy for this project: change its columns after. Later changes to the Library template don't change it."
          />
        </div>
      </div>
      {attention.dialog}
    </SettingsFormFrame>
  )
}
