import { ShowAttention } from '@agenthix/ui/attention'

/** The skills a template carries that the Library no longer holds: the agents were made without them. */
export function MissingSkillsNotice({ skills }: { skills: readonly string[] }) {
  if (skills.length === 0) return null
  const one = skills.length === 1
  return (
    // The agents exist and the press worked: what is missing is part of that result, said beside it and never in a dialog.
    <ShowAttention kind="nudge" place="meta"
      text={`${one ? 'This skill' : 'These skills'} could not be brought, because the Library no longer holds ${one ? 'it' : 'them'}: ${skills.join(', ')}. The agents were made without ${one ? 'it' : 'them'}. You can add ${one ? 'it' : 'them'} from the Library.`}
    />
  )
}
