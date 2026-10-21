import { useEffect, useState } from 'react'
import { useQuery, useAction, getModelPolicy, setModelPolicy, getModelChoices } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { ModelPicker } from '../../conversations/components/ModelPicker'
import { Part, ReadOnlyValue } from '../../projects/pages/settings/Part'
import { SaveMark, usePartSave } from '../../projects/pages/settings/usePartSave'
import { policyModelLabel, POLICY_TIERS, type ModelPolicyScope } from '../policyModels'
import {
  TIER_LABELS, choosableModels, draftFromPolicy, draftProblem, emptyDraft, inheritedLabel, saveArgs, type PolicyDraft,
} from './policyFormLogic'

type Props = {
  scope: ModelPolicyScope
  /** Required for a project's. */
  projectId?: string
  /** Who may change it: a person their own, a project's admins, the organisation's admins. Others read it. */
  canEdit: boolean
}

const models = choosableModels()

/**
 * The models a person, a project or the organisation picks by: for talking, light work and heavy work, which models
 * may be picked at all, and a ceiling. Saved together with one button, since the server checks the rows against the
 * list and the ceiling as a whole.
 */
export function ModelPolicyForm({ scope, projectId, canEdit }: Props) {
  const args = { scope, ...(scope === 'project' ? { projectId } : {}) }
  const { data, error } = useQuery(getModelPolicy, args)
  const setPolicy = useAction(setModelPolicy)
  const { data: choices } = useQuery(getModelChoices, scope === 'project' ? { policyScope: 'project', projectId } : { policyScope: scope })
  const [draft, setDraft] = useState<PolicyDraft>(emptyDraft)
  const save = usePartSave()
  useEffect(() => { if (data) setDraft(draftFromPolicy(data.policy)) }, [data])

  if (error) return <p role="alert" className="text-small text-danger">{error.message}</p>
  if (!data) return <p className="text-small text-text-muted">Loading…</p>

  const org = data.organisation
  const set = (patch: Partial<PolicyDraft>) => { save.clear(); setDraft(d => ({ ...d, ...patch })) }
  const toggle = (model: string) =>
    set({ allowed: draft.allowed.includes(model) ? draft.allowed.filter(m => m !== model) : [...draft.allowed, model] })

  const submit = async () => {
    const problem = draftProblem(draft)
    if (problem) { save.fail(problem); return }
    await save.save(() => setPolicy(saveArgs(scope, projectId, draft)))
  }

  if (!canEdit) return <ReadOnlyModels draft={draft} scope={scope} organisation={org} />

  return (
    <div className="space-y-4">
      {POLICY_TIERS.map(tier => (
        <Part key={tier} label={TIER_LABELS[tier]} htmlFor={`policy-${tier}`}>
          <ModelPicker
            id={`policy-${tier}`}
            choices={choices}
            value={draft[tier]}
            onChange={model => set({ [tier]: model })}
            emptyLabel={inheritedLabel(scope, org, tier)}
            labelOf={policyModelLabel}
          />
        </Part>
      ))}

      <Part label="Which models may be picked" hint="Narrows what the organisation allows; it cannot add to it.">
        <div className="space-y-2" role="radiogroup" aria-label="Which models may be picked">
          <label className="flex items-center gap-2 text-body text-text-primary">
            <input type="radio" name={`policy-allowed-${scope}`} className="accent-accent" checked={!draft.restrict} onChange={() => set({ restrict: false })} />
            All models
          </label>
          <label className="flex items-center gap-2 text-body text-text-primary">
            <input type="radio" name={`policy-allowed-${scope}`} className="accent-accent" checked={draft.restrict} onChange={() => set({ restrict: true })} />
            Only these
          </label>
          {draft.restrict && (
            <div className="ml-6 space-y-1">
              {models.map(m => (
                <label key={m.value} className="flex items-center gap-2 text-small text-text-secondary">
                  <input type="checkbox" className="accent-accent" checked={draft.allowed.includes(m.value)} onChange={() => toggle(m.value)} />
                  {m.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </Part>

      <Part label="Ceiling" htmlFor="policy-ceiling" hint="No model dearer than this one is picked.">
        <ModelPicker
          id="policy-ceiling"
          choices={choices}
          value={draft.ceiling}
          onChange={model => set({ ceiling: model })}
          emptyLabel="No ceiling"
          labelOf={policyModelLabel}
        />
      </Part>

      <div className="flex items-center gap-3">
        <Button onClick={() => void submit()} disabled={save.state === 'saving'}>Save models</Button>
        <SaveMark save={save} />
      </div>

      {scope === 'org' && (
        <p className="text-small text-text-muted">
          This is the default for every person and project. Their lists and ceilings can only narrow it.
        </p>
      )}
    </div>
  )
}

function ReadOnlyModels({ draft, scope, organisation }: { draft: PolicyDraft; scope: ModelPolicyScope; organisation: Parameters<typeof inheritedLabel>[1] }) {
  return (
    <div className="space-y-3">
      {POLICY_TIERS.map(tier => (
        <Part key={tier} label={TIER_LABELS[tier]}>
          <ReadOnlyValue>{draft[tier] ? policyModelLabel(draft[tier]) : inheritedLabel(scope, organisation, tier)}</ReadOnlyValue>
        </Part>
      ))}
      <Part label="Which models may be picked">
        <ReadOnlyValue>{draft.restrict ? draft.allowed.map(policyModelLabel).join(', ') : 'All models'}</ReadOnlyValue>
      </Part>
      <Part label="Ceiling">
        <ReadOnlyValue>{draft.ceiling ? policyModelLabel(draft.ceiling) : 'No ceiling'}</ReadOnlyValue>
      </Part>
    </div>
  )
}
