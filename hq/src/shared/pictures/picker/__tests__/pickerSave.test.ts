import { describe, it, expect } from 'vitest'
import { saveFailureWords } from '../pickerSave'
import { NOT_READABLE } from '../../upload/cropAndCompress'

describe('what a failed Save says', () => {
  it("is HQ's refusal when it gave one, and the browser's own words for a picture it could not read", () => {
    expect(saveFailureWords(Object.assign(new Error('That picture is too large to use.'), { statusCode: 400 }))).toBe('That picture is too large to use.')
    expect(saveFailureWords(new Error(NOT_READABLE))).toBe(NOT_READABLE)
  })

  it('is plain words for anything else, which says nothing the person can act on', () => {
    expect(saveFailureWords(Object.assign(new Error('Internal Server Error'), { statusCode: 500 }))).toMatch(/Nothing was changed/)
    expect(saveFailureWords(new TypeError('Failed to fetch'))).toMatch(/Nothing was changed/)
  })
})
