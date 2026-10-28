import { useState } from 'react'
import { useAction, useQuery, getBuiltInSkills, setBuiltInSkillSwitch } from 'wasp/client/operations'
import { RefusedAction } from '../../../shared/components/RefusedAction'
import { refusalText } from '../../../shared/refusal'
import { SettingBlock } from './ChoiceGroup'

/** The built-in skills' switches (board R2): one organisation-wide flag each. Never editable here. */
export function BuiltInSkillsSection() {
  const { data, error, refetch } = useQuery(getBuiltInSkills)
  const set = useAction(setBuiltInSkillSwitch)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const flip = async (assetId: string, on: boolean) => {
    setState({ busy: true, error: null })
    try {
      await set({ assetId, on })
      setState({ busy: false, error: null })
    } catch (err) {
      setState({ busy: false, error: refusalText(err) })
    }
    void refetch()
  }
  return (
    <SettingBlock title="Built-in skills" intro="Shipped with Agenthix, on for every agent, updated with each release. Switching one off removes it from every agent.">
      {error && <RefusedAction reason={refusalText(error)} />}
      <ul className="mt-2 divide-y divide-border-subtle" data-testid="built-ins">
        {(data ?? []).map(b => (
          <li key={b.assetId} className="flex items-start gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-text-primary">{b.title} <span className="text-small font-normal text-text-muted">{b.identity} {b.version}</span></p>
              <p className="text-small text-text-secondary">{b.description}{b.repositoryOnly && ' Used only in a workspace with a repository.'}</p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-small text-text-secondary">
              <input type="checkbox" role="switch" aria-label={`${b.title} is on`} checked={b.on} disabled={state.busy} onChange={e => void flip(b.assetId, e.target.checked)} />
              {b.on ? 'On' : 'Off'}
            </label>
          </li>
        ))}
      </ul>
      <RefusedAction reason={state.error} onDismiss={() => setState({ busy: false, error: null })} className="mt-2" />
    </SettingBlock>
  )
}
