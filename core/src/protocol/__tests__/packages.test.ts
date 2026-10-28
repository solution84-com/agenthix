import { describe, it, expect } from 'vitest'
import {
  PACKAGE_METHODS, PACKAGE_FORMAT_VERSION, MAX_SKILL_SLUG_LENGTH, MAX_SKILL_NAME_LENGTH, MAX_WORKSPACE_SKILL_INDEX, SKILL_SOURCES,
  workspaceSkillName,
  isValidPackagePath, isPackageRef, canonicalJson, packageDigestInput, namespacedSkillName,
  type PackageContents,
} from '../packages.js'

const DIGEST = 'a'.repeat(64)

describe('package contracts', () => {
  it('names the two methods', () => {
    expect(PACKAGE_METHODS).toEqual({ missing: 'packages.missing', put: 'packages.put' })
  })

  it('accepts relative package paths and refuses anything that could leave the package', () => {
    expect(isValidPackagePath('instructions.md')).toBe(true)
    expect(isValidPackagePath('skills/review/SKILL.md')).toBe(true)
    for (const bad of ['', '/etc/passwd', '../x', 'skills/../x', 'skills//x', '.hidden', 'skills/.gitkeep', 'a\\b', 'skills/x/']) {
      expect(isValidPackagePath(bad)).toBe(false)
    }
  })

  it('validates a ref exactly, and a ref names content by digest with no version (ADR-0072)', () => {
    expect(isPackageRef({ kind: 'agent', key: 'a1b2', digest: DIGEST })).toBe(true)
    expect(isPackageRef({ kind: 'team', key: 'a1b2', digest: DIGEST })).toBe(false)
    expect(isPackageRef({ kind: 'org', key: '../x', digest: DIGEST })).toBe(false)
    expect(isPackageRef({ kind: 'org', key: 'o1', digest: 'ABC' })).toBe(false)
    expect(isPackageRef({ kind: 'org', key: 'o1' })).toBe(false)
  })

  it('serialises objects with sorted keys and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: undefined, c: 'x' }] })).toBe('{"a":[2,{"c":"x"}],"b":1}')
  })

  it('gives the same digest input whatever order files arrive in', () => {
    const one: PackageContents = {
      formatVersion: PACKAGE_FORMAT_VERSION,
      files: [{ path: 'skills/a/SKILL.md', sha256: '1' }, { path: 'instructions.md', sha256: '2' }],
    }
    const two: PackageContents = {
      formatVersion: PACKAGE_FORMAT_VERSION,
      files: [{ path: 'instructions.md', sha256: '2' }, { path: 'skills/a/SKILL.md', sha256: '1' }],
    }
    expect(packageDigestInput(one)).toBe(packageDigestInput(two))
  })

  it('changes the digest input when a file hash or the format changes, and covers nothing else', () => {
    const base: PackageContents = { formatVersion: PACKAGE_FORMAT_VERSION, files: [{ path: 'instructions.md', sha256: '2' }] }
    const input = packageDigestInput(base)
    expect(packageDigestInput({ ...base, files: [{ path: 'instructions.md', sha256: '3' }] })).not.toBe(input)
    expect(packageDigestInput({ ...base, formatVersion: PACKAGE_FORMAT_VERSION + 1 })).not.toBe(input)
    expect(packageDigestInput({ ...base, settings: { model: 'x' } } as PackageContents)).toBe(input)
  })

  it('namespaces a skill by source with one hyphen, within 64 characters', () => {
    expect(namespacedSkillName('org', 'review')).toBe('org-review')
    expect(namespacedSkillName('boundary', 'x'.repeat(MAX_SKILL_SLUG_LENGTH))).toHaveLength(MAX_SKILL_SLUG_LENGTH + 9)
    expect(namespacedSkillName('boundary', 'x'.repeat(MAX_SKILL_SLUG_LENGTH + 1))).toBeNull()
    expect(namespacedSkillName('agent', 'Bad Slug')).toBeNull()
    expect(namespacedSkillName('platform', 'review')).not.toBe(namespacedSkillName('org', 'review'))
  })

  it('gives a boundary\'s shared skills their own namespace, which no other source can produce', () => {
    expect(namespacedSkillName('shared', 'review')).toBe('shared-review')
    for (const a of SKILL_SOURCES) {
      for (const b of SKILL_SOURCES) {
        if (a !== b) expect(a.startsWith(`${b}-`)).toBe(false)
      }
    }
  })

  it('names a person\'s skills with a source of their own', () => {
    expect(SKILL_SOURCES).toContain('person')
    expect(namespacedSkillName('person', 'review')).toBe('person-review')
  })

  it('names a workspace\'s skills per workspace and folder, workspace-<n>-<slug>, n from 1 to 99', () => {
    expect(SKILL_SOURCES).toContain('workspace')
    expect(workspaceSkillName(1, 'review')).toBe('workspace-1-review')
    expect(workspaceSkillName(MAX_WORKSPACE_SKILL_INDEX, 'review')).toBe('workspace-99-review')
    for (const n of [0, 100, -1, 1.5, Number.NaN]) expect(workspaceSkillName(n, 'review'), String(n)).toBeNull()
    expect(workspaceSkillName(2, 'Bad Slug')).toBeNull()
    // Without its number a workspace skill could clash with another workspace's, so the plain form refuses it.
    expect(namespacedSkillName('workspace', 'review')).toBeNull()
    expect(workspaceSkillName(12, 'x')).not.toBe(workspaceSkillName(1, '2-x'))
  })

  it('takes the slug limit from the longest prefix, workspace-99-', () => {
    expect(MAX_SKILL_SLUG_LENGTH).toBe(MAX_SKILL_NAME_LENGTH - 'workspace-99-'.length)
    expect(workspaceSkillName(99, 'x'.repeat(MAX_SKILL_SLUG_LENGTH))).toHaveLength(MAX_SKILL_NAME_LENGTH)
    expect(workspaceSkillName(99, 'x'.repeat(MAX_SKILL_SLUG_LENGTH + 1))).toBeNull()
    for (const source of SKILL_SOURCES.filter(s => s !== 'workspace')) {
      expect(namespacedSkillName(source, 'x'.repeat(MAX_SKILL_SLUG_LENGTH))!.length).toBeLessThanOrEqual(MAX_SKILL_NAME_LENGTH)
    }
  })

  it('still accepts the deprecated agent source', () => {
    expect(namespacedSkillName('agent', 'review')).toBe('agent-review')
  })
})
