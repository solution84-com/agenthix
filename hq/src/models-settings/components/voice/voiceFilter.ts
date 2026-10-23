import type { Voice } from '../../../voice/ttsAdapter'

/** What the dialog's filters hold; an empty string is *Any*. */
export interface VoiceFilterState {
  language: string
  accent: string
  gender: string
  age: string
  use: string
  tag: string
  search: string
}

export const NO_FILTERS: VoiceFilterState = { language: '', accent: '', gender: '', age: '', use: '', tag: '', search: '' }

export const GENDER_WORDS: Record<string, string> = { male: 'Male', female: 'Female', neutral: 'Neutral' }
export const AGE_WORDS: Record<string, string> = { young: 'Young', middle_aged: 'Middle aged', elderly: 'Old' }
export const USE_WORDS: Record<string, string> = {
  companions: 'Companions', enterprise: 'Enterprise', education_training: 'Education and training',
  developer_assistants: 'Developer assistants', healthcare: 'Healthcare', interactive_media: 'Interactive media',
}

export const languageOf = (v: Pick<Voice, 'languageCode'>) => v.languageCode.split(/[-_]/)[0].toLowerCase()

/** A language's name in English; its code when the browser does not know it. */
export function languageName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code } catch { return code }
}

export const categoryWords = (use: string) => USE_WORDS[use] ?? (use.charAt(0).toUpperCase() + use.slice(1).replace(/_/g, ' '))

/** The voices every dropdown filter lets through; the search is applied after. */
export function filterByDropdowns(voices: readonly Voice[], f: VoiceFilterState): Voice[] {
  return voices.filter(v =>
    (!f.language || languageOf(v) === f.language) &&
    (!f.accent || v.accent === f.accent) &&
    (!f.gender || v.gender === f.gender) &&
    (!f.age || v.ageGroup === f.age) &&
    (!f.use || v.categories.includes(f.use)) &&
    (!f.tag || v.tags.includes(f.tag)))
}

/** The search looks only inside what the filters left: each of its words in the name or the description. */
export function searchWithin(voices: readonly Voice[], search: string): Voice[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...voices]
  return voices.filter(v => {
    const text = `${v.displayName} ${v.description}`.toLowerCase()
    return words.every(w => text.includes(w))
  })
}

/** Custom voices first, each group by name. */
export function ordered(voices: readonly Voice[]): Voice[] {
  return [...voices].sort((a, b) => Number(b.isCustom) - Number(a.isCustom) || a.displayName.localeCompare(b.displayName))
}

export function filterVoices(voices: readonly Voice[], f: VoiceFilterState): { shown: Voice[]; withinFilters: number } {
  const within = filterByDropdowns(voices, f)
  return { shown: ordered(searchWithin(within, f.search)), withinFilters: within.length }
}

export const isFiltered = (f: VoiceFilterState) => Object.values(f).some(Boolean)

/** The values each dropdown offers, from the voices there are. */
export function optionsOf(voices: readonly Voice[]) {
  const set = (pick: (v: Voice) => string[]) => [...new Set(voices.flatMap(pick).filter(Boolean))]
  return {
    languages: set(v => [languageOf(v)]).sort((a, b) => languageName(a).localeCompare(languageName(b))),
    accents: set(v => [v.accent]).sort(),
    genders: set(v => [v.gender]).sort(),
    ages: Object.keys(AGE_WORDS).filter(a => voices.some(v => v.ageGroup === a)),
    uses: set(v => v.categories).sort((a, b) => categoryWords(a).localeCompare(categoryWords(b))),
    tags: set(v => v.tags).sort(),
  }
}

/** What is shown and how many, in words: `2 of 13 male English voices with a British accent match "calm"`. */
export function describeShown(f: VoiceFilterState, shown: number, withinFilters: number): string {
  const what = [
    f.gender ? (GENDER_WORDS[f.gender] ?? f.gender).toLowerCase() : '',
    f.age ? (AGE_WORDS[f.age] ?? f.age).toLowerCase() : '',
    f.language ? languageName(f.language) : '',
  ].filter(Boolean).join(' ')
  const noun = `${what ? `${what} ` : ''}voices`
  const extras = [
    f.accent ? `with a ${f.accent} accent` : '',
    f.use ? `for ${categoryWords(f.use).toLowerCase()}` : '',
    f.tag ? `tagged ${f.tag}` : '',
  ].filter(Boolean).join(' ')
  const subject = `${noun}${extras ? ` ${extras}` : ''}`
  const search = f.search.trim()
  if (search) return `${shown} of ${withinFilters} ${subject} match “${search}”`
  const one = withinFilters === 1 ? subject.replace('voices', 'voice') : subject
  return `${withinFilters} ${one}`
}
