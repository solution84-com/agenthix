import { describe, it, expect } from 'vitest'
import { computeRiskLevel, type RiskRule } from '../riskRating'

describe('computeRiskLevel @SC-055', () => {
  // ── Built-in defaults ──────────────────────────────────────────────────────

  it('rates rm -rf as FLAGGED', () => {
    expect(computeRiskLevel('bash', { command: 'rm -rf /kernel/agents' }, [])).toBe('FLAGGED')
  })

  it('rates cat as SAFE', () => {
    expect(computeRiskLevel('bash', { command: 'cat package.json' }, [])).toBe('SAFE')
  })

  it('rates git commit as MEDIUM', () => {
    expect(computeRiskLevel('bash', { command: 'git commit -m "test"' }, [])).toBe('MEDIUM')
  })

  it('rates npm install as MEDIUM', () => {
    expect(computeRiskLevel('bash', { command: 'npm install lodash' }, [])).toBe('MEDIUM')
  })

  it('rates read_file as SAFE', () => {
    expect(computeRiskLevel('read_file', { file_path: 'src/main.ts' }, [])).toBe('SAFE')
  })

  it('rates edit_file as LOW', () => {
    expect(computeRiskLevel('edit_file', { file_path: 'src/main.ts' }, [])).toBe('LOW')
  })

  it('rates write_file as LOW', () => {
    expect(computeRiskLevel('write_file', { file_path: 'src/main.ts' }, [])).toBe('LOW')
  })

  it('returns MEDIUM for unknown bash commands', () => {
    expect(computeRiskLevel('bash', { command: 'some-obscure-tool --flag' }, [])).toBe('MEDIUM')
  })

  it('returns LOW for unknown non-bash tools', () => {
    expect(computeRiskLevel('UnknownTool', {}, [])).toBe('LOW')
  })

  // ── Custom rules ───────────────────────────────────────────────────────────

  it('custom rule overrides built-in for matching pattern', () => {
    const customRules: RiskRule[] = [
      { pattern: 'cat', riskLevel: 'HIGH' },
    ]
    expect(computeRiskLevel('bash', { command: 'cat /etc/passwd' }, customRules)).toBe('HIGH')
  })

  it('custom rule matches via substring (includes semantics)', () => {
    const customRules: RiskRule[] = [
      { pattern: 'rm', riskLevel: 'FLAGGED' },
    ]
    // 'npm rm' contains 'rm' as a substring — custom rule fires
    expect(computeRiskLevel('bash', { command: 'npm rm lodash' }, customRules)).toBe('FLAGGED')
  })

  it('first custom rule wins when multiple match', () => {
    const customRules: RiskRule[] = [
      { pattern: 'git push', riskLevel: 'FLAGGED' },
      { pattern: 'git', riskLevel: 'LOW' },
    ]
    expect(computeRiskLevel('bash', { command: 'git push origin main' }, customRules)).toBe('FLAGGED')
  })

  it('falls through to built-in when no custom rule matches', () => {
    const customRules: RiskRule[] = [
      { pattern: 'docker', riskLevel: 'HIGH' },
    ]
    expect(computeRiskLevel('bash', { command: 'cat README.md' }, customRules)).toBe('SAFE')
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('handles null toolInput gracefully', () => {
    expect(() => computeRiskLevel('bash', null, [])).not.toThrow()
  })

  it('rates by canonical name only, which is what the gate passes', () => {
    expect(computeRiskLevel('glob_files', {}, [])).toBe('SAFE')
    expect(computeRiskLevel('web_fetch', {}, [])).toBe('LOW')
    expect(computeRiskLevel('Bash', { command: 'rm -rf /' }, [])).toBe('LOW')
  })

  it('handles missing command key gracefully', () => {
    expect(computeRiskLevel('bash', {}, [])).toBe('MEDIUM')
  })
})
