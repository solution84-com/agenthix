import { describe, it, expect } from 'vitest'
import { askedFirst, callSummary, durationText, outputPreview, usageText } from '../components/runFormat'

describe('the Runs screen\'s wording @SC-530 @SC-649 @SC-652', () => {
  it('says how long a run took', () => {
    expect(durationText('2026-10-09T09:06:00Z', '2026-10-09T09:06:42Z')).toBe('42 s')
    expect(durationText('2026-10-09T09:06:00Z', '2026-10-09T09:12:00Z')).toBe('6 min')
    expect(durationText('2026-10-09T09:00:00Z', '2026-10-09T10:05:00Z')).toBe('1 h 5 min')
    expect(durationText(null, '2026-10-09T10:05:00Z')).toBeNull()
  })

  it('words usage as the reply\'s usage line does, leaving out a cost it cannot price', () => {
    const usage = { inputTokens: 182_000, outputTokens: 9_000, totalTokens: 191_000 }
    const unpriced = usageText(usage, 'no-such-model')!
    expect(unpriced.startsWith('182.0k in · 9.0k out · ')).toBe(true)
    expect(unpriced.split(' · ')).toHaveLength(3)
    expect(unpriced).toMatch(/Wh$/)
    expect(usageText(null, 'x')).toBeNull()
  })

  it('cuts long output to its first lines and counts them all', () => {
    const output = Array.from({ length: 1204 }, (_, i) => `line ${i}`).join('\n')
    const preview = outputPreview(output, 3)
    expect(preview).toEqual({ text: 'line 0\nline 1\nline 2', total: 1204, cut: true })
    expect(outputPreview('one\ntwo\n', 3)).toEqual({ text: 'one\ntwo\n', total: 2, cut: false })
  })

  it('sums a call up in a line', () => {
    expect(callSummary('bash', { command: 'git push origin web-24\nsecond' })).toBe('bash git push origin web-24')
    expect(callSummary('read_file', { file_path: 'src/a.ts' })).toBe('read_file src/a.ts')
    expect(callSummary('create_comment', { body: 'x' })).toBe('create_comment')
  })

  it('tells a call that was approved after asking from one that was not', () => {
    const given = { tools: ['web_fetch'], bashPatterns: ['git push origin web-24'], by: 'Ana', at: '2026-10-09T09:10:00Z' }
    expect(askedFirst({ toolName: 'web_fetch', toolInput: {}, blocked: false }, given)).toBe(true)
    expect(askedFirst({ toolName: 'bash', toolInput: { command: 'git push origin web-24' }, blocked: false }, given)).toBe(true)
    expect(askedFirst({ toolName: 'bash', toolInput: { command: 'git push origin web-24 --force' }, blocked: false }, given)).toBe(false)
    expect(askedFirst({ toolName: 'bash', toolInput: { command: 'git status' }, blocked: false }, given)).toBe(false)
    expect(askedFirst({ toolName: 'web_fetch', toolInput: {}, blocked: true }, given)).toBe(false)
    expect(askedFirst({ toolName: 'web_fetch', toolInput: {}, blocked: false }, null)).toBe(false)
  })
})
