import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'

vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error {
    statusCode: number
    constructor(statusCode: number, message?: string) { super(message); this.statusCode = statusCode }
  },
}))

import { parseAllowedToolsInput } from '../allowedToolsService'

describe('workspace allowed-tools cap @SC-311', () => {
  describe('parseAllowedToolsInput', () => {
    it('null clears the cap', () => {
      expect(parseAllowedToolsInput(null)).toBeNull()
    })

    it('dedupes and trims a valid string list of real catalogue names', () => {
      expect(parseAllowedToolsInput(['read_file', 'read_file', ' write_file '])).toEqual(['read_file', 'write_file'])
    })

    it('[] returns [] — an explicit empty list is NOT collapsed to null (schema: [] = no tools)', () => {
      expect(parseAllowedToolsInput([])).toEqual([])
    })

    it('refuses the legacy ToolPermission[] object shape — this is the silent-lockout guard (5b-1 ledger 15)', () => {
      expect(() => parseAllowedToolsInput([{ name: 'read_file', state: 'always' }])).toThrow(/tool names/i)
      try {
        parseAllowedToolsInput([{ name: 'read_file', state: 'always' }])
      } catch (e: any) {
        expect(e.statusCode).toBe(400)
      }
    })

    it('refuses a typo\'d tool name, naming the tool in the error — closes the typo-to-total-lockout path', () => {
      expect(() => parseAllowedToolsInput(['read_fil'])).toThrow(/unknown tool name: read_fil/)
      try {
        parseAllowedToolsInput(['read_fil'])
      } catch (e: any) {
        expect(e.statusCode).toBe(400)
      }
    })

    it('refuses a bare string', () => {
      expect(() => parseAllowedToolsInput('read_file')).toThrow()
    })

    it('refuses a number', () => {
      expect(() => parseAllowedToolsInput(42)).toThrow()
    })

    it('refuses a plain object', () => {
      expect(() => parseAllowedToolsInput({})).toThrow()
    })

    it('refuses an empty-string entry', () => {
      expect(() => parseAllowedToolsInput([''])).toThrow()
    })

    it('undefined is refused — a missing key can\'t write', () => {
      expect(() => parseAllowedToolsInput(undefined)).toThrow()
      try {
        parseAllowedToolsInput(undefined)
      } catch (e: any) {
        expect(e.statusCode).toBe(400)
      }
    })

    it('refuses an array longer than 200 entries — garbage-input guard (catalogue is ~45)', () => {
      const tooMany = Array.from({ length: 201 }, (_, i) => `tool_${i}`)
      expect(() => parseAllowedToolsInput(tooMany)).toThrow(/200/)
    })
  })
})
