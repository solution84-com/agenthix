/**
 * Filters for the voice list. A provider's voices carry a free-text description and tags, not fields for gender or
 * accent, so both are read from the words: "a clear, refined British female voice", or "gender: male" in a
 * structured description.
 */
export interface FilterableVoice {
  displayName: string
  description: string
  tags?: string[]
}

export type VoiceGender = 'female' | 'male'

const FEMALE = /\b(female|woman|girl|feminine)\b/i
const MALE = /\b(male|man|boy|masculine)\b/i

const ACCENTS: [string, RegExp][] = [
  ['American', /\b(american|us english|general american)\b/i],
  ['Australian', /\baustralian\b/i],
  ['Brazilian', /\bbrazilian\b/i],
  ['British', /\b(british|english accent|received pronunciation|yorkshire|london|cockney|scouse|geordie)\b/i],
  ['Canadian', /\bcanadian\b/i],
  ['Castilian', /\bcastilian\b/i],
  ['Indian', /\bindian\b/i],
  ['Irish', /\birish\b/i],
  ['Latin American', /\blatin american\b/i],
  ['Mexican', /\bmexican\b/i],
  ['New Zealand', /\b(new zealand|kiwi)\b/i],
  ['Scottish', /\bscottish\b/i],
  ['Singaporean', /\bsingaporean\b/i],
  ['South African', /\bsouth african\b/i],
]

/** Words people type for an accent or a gender, and what they mean. */
const SYNONYMS: Record<string, string> = {
  uk: 'british', gb: 'british', england: 'british', english: 'british', brit: 'british',
  us: 'american', usa: 'american', america: 'american',
  au: 'australian', aus: 'australian', aussie: 'australian', australia: 'australian',
  nz: 'new zealand', kiwi: 'new zealand',
  man: 'male', men: 'male', guy: 'male', masculine: 'male',
  woman: 'female', women: 'female', lady: 'female', feminine: 'female',
}

const textOf = (v: FilterableVoice) => `${v.description} ${(v.tags ?? []).join(' ')}`

export function voiceGender(v: FilterableVoice): VoiceGender | null {
  const text = textOf(v)
  if (FEMALE.test(text)) return 'female'
  if (MALE.test(text)) return 'male'
  return null
}

export function voiceAccents(v: FilterableVoice): string[] {
  const text = textOf(v)
  return ACCENTS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
}

/**
 * Whether a voice matches every word of the search. A gender word matches the voice's gender only ("male" never
 * finds a female voice), an accent word its accent, and any other word its name, description or tags.
 */
export function matchesVoiceSearch(v: FilterableVoice, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const gender = voiceGender(v)
  const accents = voiceAccents(v).map(a => a.toLowerCase())
  const text = `${v.displayName} ${textOf(v)}`.toLowerCase()
  return words.every(word => {
    const meant = SYNONYMS[word] ?? word
    if (meant === 'male' || meant === 'female') return gender === meant
    const accent = ACCENTS.find(([name]) => name.toLowerCase() === meant)
    if (accent) return accents.includes(meant)
    return text.includes(meant)
  })
}
