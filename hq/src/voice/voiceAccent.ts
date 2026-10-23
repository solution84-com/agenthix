/** The accent a voice speaks with, in words, from the region of its language code (`en-GB` is British). */
const ACCENTS: Record<string, string> = {
  US: 'American', GB: 'British', AU: 'Australian', CA: 'Canadian', IE: 'Irish', IN: 'Indian', NZ: 'New Zealand',
  ZA: 'South African', SG: 'Singaporean', PH: 'Philippine', NG: 'Nigerian', SC: 'Scottish', MX: 'Mexican', ES: 'Castilian',
  AR: 'Argentine', CO: 'Colombian', BR: 'Brazilian', PT: 'Portuguese', FR: 'French', DE: 'German', AT: 'Austrian',
  CH: 'Swiss', IT: 'Italian', NL: 'Dutch', BE: 'Belgian', PL: 'Polish', RU: 'Russian', JP: 'Japanese', KR: 'Korean',
  CN: 'Chinese', TW: 'Taiwanese', HK: 'Hong Kong', SA: 'Saudi', IL: 'Israeli',
}

/** The region part of a language code, upper case: `GB` for `en-GB` or `en_GB`; null when there is none. */
export function regionOf(languageCode: string): string | null {
  const m = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(languageCode)
  return m ? m[1].toUpperCase() : null
}

/** A name for the accent; a region not in the table is shown by its code, and no region gives an empty string. */
export function accentOf(languageCode: string): string {
  const region = regionOf(languageCode)
  return region ? ACCENTS[region] ?? region : ''
}
