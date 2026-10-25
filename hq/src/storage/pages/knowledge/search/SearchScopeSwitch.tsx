import { DEFAULT_SCOPE, scopesFor, type SearchScope } from './searchScope'

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
    <div role="radiogroup" aria-label="Search in" data-testid="search-scope" className="inline-flex overflow-hidden rounded-lg border border-border text-small">
      {scopesFor(personal).map(s => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={value === s.value}
          onClick={() => onChange(s.value)}
          className={`px-3 py-1 max-lg:min-h-10 ${value === s.value ? 'bg-accent text-on-accent' : 'bg-surface-1 text-text-secondary hover:bg-surface-hover'}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
