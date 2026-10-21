/**
 * The location-file error vocabulary.
 *
 * A channel failure and a content-stream failure each carry exactly one
 * string, so a distinction hq needs — not found, already exists, refused —
 * has nowhere to live but inside that string. Encoding it means hq reads a
 * CODE rather than matching on prose, and it means the prose itself can stay
 * free of anything hq should not learn: a site's error message used to carry
 * the absolute path of the file on the site's disk, which is the same leak the
 * result types were designed to avoid, arriving by the other door.
 */
import { describe, it, expect } from 'vitest'
import {
  LOCATION_FILE_METHODS,
  KNOWLEDGE_LIST_MAX_FILES,
  KNOWLEDGE_LIST_MAX_DEPTH,
  LOCATION_FILE_ERROR_CODES,
  LOCATION_SEED_MAX_BYTES,
  LOCATION_SEED_MAX_FILES,
  LOCATION_FILE_ERROR_MARKER,
  LocationFileError,
  encodeLocationFileError,
  decodeLocationFileError,
} from '../locationFiles.js'

describe('the error vocabulary', () => {
  it('round-trips every code it publishes', () => {
    for (const code of LOCATION_FILE_ERROR_CODES) {
      expect(decodeLocationFileError(encodeLocationFileError(code, 'a detail'))).toEqual({ code, message: 'a detail' })
    }
  })

  it('keeps the detail intact, including a colon inside it', () => {
    const wire = encodeLocationFileError('not_found', 'location.statFile "a: b.md" in project p1')
    expect(decodeLocationFileError(wire)?.message).toBe('location.statFile "a: b.md" in project p1')
  })

  it('reads nothing out of a message that is not one of ours', () => {
    for (const junk of ['', 'boom', 'ENOENT: no such file', 'Unknown method: location.listFiles', 'nope: x']) {
      expect(decodeLocationFileError(junk)).toBeNull()
    }
  })

  /**
   * Several of the codes are ordinary English words, so a message that merely
   * BEGINS with one is not evidence of anything — `failed: the run was
   * cancelled` is a sentence, not one of these. Sniffing a prefix out of free
   * text would adopt it, hand hq a code nobody set, and lose the real message
   * behind it. The marker is what makes the encoding a statement rather than a
   * coincidence.
   */
  it('does not adopt an unrelated message that happens to start with a code word', () => {
    for (const impostor of [
      'failed: the run was cancelled',
      'refused: the site refused the handshake',
      'cancelled: Stream closed by the site',
      'exists: a session with that name already exists',
      'not_found: something else entirely',
    ]) {
      expect(decodeLocationFileError(impostor)).toBeNull()
      expect(LocationFileError.fromWire(impostor)).toBeNull()
    }
  })

  it('marks its own encoding so a reader can tell it apart from prose', () => {
    const wire = encodeLocationFileError('not_found', 'location.statFile "a.md" in project p1')
    expect(wire.startsWith(LOCATION_FILE_ERROR_MARKER)).toBe(true)
    // And the human half is still readable in a log, after the marker.
    expect(wire).toContain('location.statFile "a.md" in project p1')
  })

  it('carries its code on the error and its encoding in the message', () => {
    const err = new LocationFileError('refused', 'location.listFiles "history" in project p1')
    expect(err.code).toBe('refused')
    expect(err.message).toBe(`${LOCATION_FILE_ERROR_MARKER}refused: location.listFiles "history" in project p1`)
    expect(err).toBeInstanceOf(Error)
  })

  it('rebuilds itself from the one string a failure carries, and refuses to guess', () => {
    const rebuilt = LocationFileError.fromWire(
      `${LOCATION_FILE_ERROR_MARKER}not_found: location.statFile "a.md" in project p1`,
    )
    expect(rebuilt?.code).toBe('not_found')
    expect(rebuilt?.detail).toBe('location.statFile "a.md" in project p1')
    expect(LocationFileError.fromWire('ENOENT: no such file or directory')).toBeNull()
  })
})

describe('the seed bounds', () => {
  // A cap on bytes alone lets a thousand empty files through, and a thousand
  // empty files is not a set of starter documents.
  it('bounds the file count as well as the byte total', () => {
    expect(LOCATION_SEED_MAX_FILES).toBeGreaterThan(0)
    expect(LOCATION_SEED_MAX_BYTES).toBeGreaterThan(0)
  })
})

describe('location.remove', () => {
  it('is named under the location. prefix, distinct from every other method', () => {
    expect(LOCATION_FILE_METHODS.removeLocation).toBe('location.remove')
    const names = Object.values(LOCATION_FILE_METHODS)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("an owner's artefacts and knowledge @SC-760", () => {
  it('are four methods of their own, under the location. prefix', () => {
    expect(LOCATION_FILE_METHODS.listArtefacts).toBe('location.listArtefacts')
    expect(LOCATION_FILE_METHODS.readArtefact).toBe('location.readArtefact')
    expect(LOCATION_FILE_METHODS.listKnowledge).toBe('location.listKnowledge')
    expect(LOCATION_FILE_METHODS.readKnowledge).toBe('location.readKnowledge')
  })

  it('bound the knowledge listing by count and depth', () => {
    expect(KNOWLEDGE_LIST_MAX_FILES).toBeGreaterThan(0)
    expect(KNOWLEDGE_LIST_MAX_DEPTH).toBeGreaterThan(0)
  })
})

describe('location.searchKnowledge @SC-1017', () => {
  it('is a method of its own', () => {
    expect(LOCATION_FILE_METHODS.searchKnowledge).toBe('location.searchKnowledge')
  })
})
