import { Input, NativeSelect } from '@agenthix/ui/primitives'
import { TagSelect } from './TagSelect'
import {
  AGE_WORDS, GENDER_WORDS, categoryWords, languageName, optionsOf, type VoiceFilterState,
} from './voiceFilter'

/** A search, then six dropdowns of equal width in two rows: language, accent, gender / age, use, tag. */
export function VoiceFilters({ options, filters, onChange }: {
  options: ReturnType<typeof optionsOf>
  filters: VoiceFilterState
  onChange: (next: VoiceFilterState) => void
}) {
  const set = (key: keyof VoiceFilterState) => (value: string) => onChange({ ...filters, [key]: value })
  const select = (label: string, key: Exclude<keyof VoiceFilterState, 'search' | 'tag'>, any: string, values: readonly string[], words: (v: string) => string) => (
    <NativeSelect aria-label={label} value={filters[key]} onChange={e => set(key)(e.target.value)}>
      <option value="">{any}</option>
      {values.map(v => <option key={v} value={v}>{words(v)}</option>)}
    </NativeSelect>
  )
  return (
    <div className="space-y-2">
      <Input value={filters.search} onChange={e => set('search')(e.target.value)} placeholder="Search voices" aria-label="Search voices" />
      <div className="grid grid-cols-3 gap-2">
        {select('Language', 'language', 'Any language', options.languages, languageName)}
        {select('Accent', 'accent', 'Any accent', options.accents, a => a)}
        {select('Gender', 'gender', 'Any gender', options.genders, g => GENDER_WORDS[g] ?? g)}
        {select('Age', 'age', 'Any age', options.ages, a => AGE_WORDS[a] ?? a)}
        {select('Use', 'use', 'Any use', options.uses, categoryWords)}
        <TagSelect tags={options.tags} value={filters.tag} onChange={set('tag')} />
      </div>
    </div>
  )
}
