import type { ModelChoices } from '@agenthix/core'
import { ModelPicker } from '../../conversations/components/ModelPicker'
import type { ChoiceView } from '../types'
import { LINK, SettingRow, Whose } from './SettingRow'

/** The value a picker holds for a choice: the provider's id and the model. */
export const valueOf = (c: ChoiceView | null) => (c ? `${c.providerId}/${c.model}` : '')

/** A value no choice holds, so the picker's button says what the row's button says instead of the model. */
const BUTTON = '\u0000change'

/** What an agent's row says about whose it is, and how to go back to the organisation's. */
export type Whom = { org: string; agent: string; onFollow: () => void }

/**
 * One model setting: its name, the choice in one line (`model · via provider`), at most one plain line under it, and
 * *Change*, which opens the one picker used everywhere a model is chosen (search box, a provider that is not working
 * greyed out). On an agent's page `whom` says whether the setting is the organisation's or the agent's own.
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
  return (
    <SettingRow
      label={label}
      value={shown ? <>{shown.text}{shown.notWorking ? ' · not working' : ''}{whom && <Whose text={own ? `${whom.agent}'s own` : `${whom.org}'s`} />}</> : <span className="text-text-muted">Not chosen</span>}
      hint={hint}
      actions={(
        <>
          <ModelPicker choices={choices} value={BUTTON} labelOf={() => buttonText} onChange={onChange} ariaLabel={`Change ${label.toLowerCase()}`} />
          {whom && own && <button type="button" className={LINK} onClick={whom.onFollow}>Follow {whom.org}</button>}
        </>
      )}
    />
  )
}
