import { describe, expect, it } from 'vitest'
import { failingPreviewCheck, normalisePreviewDomain, previewDomainProblem, previewsOn, type PreviewsFigures } from '../previews.js'

const hosts = { hqHost: 'hq.example.com', filesHost: 'files.hq.example.com' }

describe('the preview domain @SC-1756', () => {
  it('takes a domain of its own, or one beside HQ', () => {
    expect(previewDomainProblem('preview.example.net', hosts)).toBeNull()
    expect(previewDomainProblem('preview.example.com', hosts)).toBeNull()
    expect(previewDomainProblem(' Preview.Example.NET. ', hosts)).toBeNull()
    expect(normalisePreviewDomain(' Preview.Example.NET. ')).toBe('preview.example.net')
  })

  it("refuses HQ's and the files address's own names", () => {
    expect(previewDomainProblem('hq.example.com', hosts)).toMatch(/HQ's own address/)
    expect(previewDomainProblem('files.hq.example.com', hosts)).toMatch(/uploaded files' own address/)
  })

  it('refuses a domain whose wildcard would take HQ or the files address', () => {
    expect(previewDomainProblem('example.com', hosts)).toMatch(/hq\.example\.com is directly under it/)
    expect(previewDomainProblem('hq.example.com', { hqHost: 'x.example.com', filesHost: 'files.hq.example.com' })).toMatch(/files\.hq\.example\.com is directly under it/)
  })

  it('refuses network addresses, local names and what is not a domain', () => {
    expect(previewDomainProblem('203.0.113.7', hosts)).toMatch(/network address/)
    expect(previewDomainProblem('preview.localhost', hosts)).toMatch(/only this machine/)
    expect(previewDomainProblem('box.local', hosts)).toMatch(/only this machine/)
    expect(previewDomainProblem('preview', hosts)).toMatch(/not a domain name/)
    expect(previewDomainProblem('pre view.example.com', hosts)).toMatch(/not a domain name/)
    expect(previewDomainProblem('https://preview.example.com', hosts)).toMatch(/not a domain name|network address/)
    expect(previewDomainProblem(`${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`, hosts)).toMatch(/longer/)
  })
})

describe('whether live apps are on @SC-1756', () => {
  const passed: PreviewsFigures = {
    domain: 'preview.example.net', checkedAt: '2026-10-29T10:00:00.000Z',
    checks: [
      { name: 'dns', ok: true, addresses: ['203.0.113.7'], expected: ['203.0.113.7'] },
      { name: 'certificate', ok: true, problem: null },
      { name: 'testApp', ok: true, problem: null },
    ],
  }

  it('is on only with a domain and all three checks passing', () => {
    expect(previewsOn(passed)).toBe(true)
    expect(previewsOn({ ...passed, checks: passed.checks.slice(0, 2) })).toBe(false)
    expect(previewsOn({ domain: null, checkedAt: null, checks: [] })).toBe(false)
    const failed = { ...passed, checks: [passed.checks[0], { name: 'certificate' as const, ok: false, problem: 'nothing answered' }, passed.checks[2]] }
    expect(previewsOn(failed)).toBe(false)
    expect(failingPreviewCheck(failed)?.name).toBe('certificate')
  })
})
