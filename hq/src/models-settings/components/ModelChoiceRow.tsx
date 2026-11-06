import type { ModelChoices } from '@agenthix/core'
import { ModelPicker } from '../../shared/components/models/ModelPicker'
import type { ChoiceView } from '../types'
import { LINK, SettingRow, Whose } from './SettingRow'

/** The value a picker holds for a choice: the provider's id and the model. */
export const valueOf = (c: ChoiceView | null) => (c ? `${c.providerId}/${c.model}` : '')

/** The default row's value on an agent's page: following the organisation's, which no choice holds. */
const FOLLOW = '\u0000follow'

/**
 * What an agent's row says about whose it is, and how to go back to the organisation's. `orgChoice` is the
 * organisation's, the default row the list puts first.
 */
export type Whom = { org: string; agent: string; onFollow: () => void; orgChoice?: ChoiceView | null }

/**
 * One model setting: its name, the choice in one line (`model · via provider`), at most one plain line under it, and
 * *Change*, which opens the one model list used everywhere a model is chosen. On an agent's page `whom` says whether
 * the setting is the organisation's or the agent's own, and the list puts the organisation's first as the default.
 */
export function ModelChoiceRow({ label, hint, choices, own, shown, whom, onChange }: {
  label: string
  hint?: string
  choices: ModelChoices | undefined
  /** What is set here; null follows the layer above. */
  own: ChoiceView | null
  /** What applies: `own`, else the layer above's. */
  shown: ChoiceView | null
  whom?: Whom
  onChange: (value: string) => void
}) {
  const buttonText = whom && !own ? `Give ${whom.agent} its own` : 'Change'
  const orgValue = valueOf(whom?.orgChoice ?? null)
  const defaultRow = whom && {
    model: choices?.models.find(m => m.value === orgValue)?.label ?? whom.orgChoice?.text, setBy: whom.org, value: FOLLOW,
  }
  const value = whom && !own ? FOLLOW : valueOf(own)
  return (
    <SettingRow
      label={label}
      value={shown ? <>{shown.text}{shown.notWorking ? ' · not working' : ''}{whom && <Whose text={own ? `${whom.agent}'s own` : `${whom.org}'s`} />}</> : <span className="text-text-muted">Not chosen</span>}
      hint={hint}
      actions={(
        <>
          <ModelPicker choices={choices} value={value} buttonText={buttonText} defaultRow={defaultRow}
            onChange={v => (v === FOLLOW ? whom?.onFollow() : onChange(v))} ariaLabel={`Change ${label.toLowerCase()}`} />
          {whom && own && <button type="button" className={LINK} onClick={whom.onFollow}>Follow {whom.org}</button>}
        </>
      )}
    />
  )
}
