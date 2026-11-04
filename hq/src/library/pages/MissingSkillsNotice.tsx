import { Link } from 'react-router'

/** The skills a template carries that the Library no longer holds: the agents were made without them. */
export function MissingSkillsNotice({ skills }: { skills: readonly string[] }) {
  if (skills.length === 0) return null
  return (
    <p role="status" className="text-small text-warning">
      {skills.length === 1 ? 'This skill' : 'These skills'} could not be brought, because the Library no longer holds {skills.length === 1 ? 'it' : 'them'}:{' '}
      <span className="font-mono">{skills.join(', ')}</span>. The agents were made without {skills.length === 1 ? 'it' : 'them'}. You can add {skills.length === 1 ? 'it' : 'them'} from the <Link to="/library" className="underline">Library</Link>.
    </p>
  )
}
