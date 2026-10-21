/** How the Files tools refer to a file in a message, and how a link to an artefact is read (spec §3, §9). */
import { describe, it, expect } from 'vitest'
import { mentionReference, artefactNameFromHref } from '../fileReferences'

describe('mentionReference', () => {
  it('names the file by its folder in the place', () => {
    expect(mentionReference('files', 'specs/pricing-page.md')).toBe('files/specs/pricing-page.md')
    expect(mentionReference('artefacts', 'Pricing options.pdf')).toBe('artefacts/Pricing options.pdf')
    expect(mentionReference('knowledge', 'payments.md')).toBe('knowledge/payments.md')
  })
})

describe('artefactNameFromHref', () => {
  it('reads the link an agent writes: artefacts/<file name>', () => {
    expect(artefactNameFromHref('artefacts/pricing-options.pdf')).toBe('pricing-options.pdf')
    expect(artefactNameFromHref('./artefacts/notes.md')).toBe('notes.md')
  })

  it('decodes a name written as a Markdown link address', () => {
    expect(artefactNameFromHref('artefacts/Pricing%20options.pdf')).toBe('Pricing options.pdf')
  })

  it('leaves every other link alone', () => {
    expect(artefactNameFromHref('https://example.com/artefacts/x.md')).toBeNull()
    expect(artefactNameFromHref('/artefacts/x.md')).toBeNull()
    expect(artefactNameFromHref('artefacts/sub/x.md')).toBeNull()
    expect(artefactNameFromHref('artefacts/')).toBeNull()
    expect(artefactNameFromHref('artefacts/%E0%A4%A')).toBeNull()
    expect(artefactNameFromHref(null)).toBeNull()
  })
})
