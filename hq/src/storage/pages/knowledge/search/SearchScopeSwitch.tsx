import { DEFAULT_SCOPE, scopesFor, type SearchScope } from './searchScope'
import { SegmentedControl } from '@agenthix/ui/primitives'

/**
 * *This project · Organisation · Both* over a project's knowledge search (U5), Both by default. A person's own space
 * shows it with *Your space* in place of *This project*.
 */
export function SearchScopeSwitch({ value = DEFAULT_SCOPE, onChange, personal = false }: {
  value?: SearchScope
  onChange: (scope: SearchScope) => void
  personal?: boolean
}) {
  return (
    <span data-testid="search-scope" className="inline-flex">
      <SegmentedControl label="Search in" options={scopesFor(personal)} value={value} onChange={onChange} />
    </span>
  )
}
