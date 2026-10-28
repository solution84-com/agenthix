import { describe, expect, it } from 'vitest'
import {
  AGENTHIX_PUBLISHER, ASSET_KINDS, ASSET_NAME_MAX_LENGTH, RESERVED_PUBLISHERS, UNSIGNED_PUBLISHER,
  formatAssetIdentity, isAssetName, isReservedPublisher, parseAssetIdentity, roleSkillName,
} from '../identity.js'

describe('asset identity', () => {
  it('names the four kinds', () => {
    expect([...ASSET_KINDS]).toEqual(['skill', 'agent', 'board', 'team'])
  })

  it('accepts names by the Agent Skills rule, 1 to 64 characters', () => {
    for (const ok of ['a', 'code-review', 'pm-sprint-planning', 'x1', '9', 'a'.repeat(ASSET_NAME_MAX_LENGTH)]) {
      expect(isAssetName(ok), ok).toBe(true)
    }
    for (const bad of [
      '', 'Code-Review', 'code_review', 'code review', '-code', 'code-', 'code--review', 'a'.repeat(65), 'café',
      'a/b', '.hidden', 'x\n', 42, null,
    ]) expect(isAssetName(bad), String(bad)).toBe(false)
  })

  it('parses and formats publisher/name', () => {
    expect(parseAssetIdentity('agenthix/pm-sprint-planning')).toEqual({ publisher: 'agenthix', name: 'pm-sprint-planning' })
    expect(formatAssetIdentity({ publisher: 'fernhill', name: 'code-review' })).toBe('fernhill/code-review')
  })

  it("names a template's role skill under the template", () => {
    const id = parseAssetIdentity('agenthix/project-manager/read-context')
    expect(id).toEqual({ publisher: 'agenthix', name: 'project-manager/read-context' })
    expect(formatAssetIdentity(id!)).toBe('agenthix/project-manager/read-context')
    expect(roleSkillName('project-manager', 'read-context')).toBe('project-manager/read-context')
    expect(roleSkillName('Project', 'read-context')).toBeNull()
  })

  it('refuses a malformed identity', () => {
    for (const bad of [
      '', 'agenthix', '/name', 'agenthix/', 'a/b/c/d', 'Agenthix/x', 'a//b', 'a/b/', ' a/b', 'a/b ',
      `a/${'b'.repeat(65)}`, `${'p'.repeat(65)}/b`, 'github.com/acme/skills', 'a/../b', 42, undefined,
    ]) expect(parseAssetIdentity(bad), String(bad)).toBeNull()
  })

  it('reserves unsigned and agenthix', () => {
    expect(UNSIGNED_PUBLISHER).toBe('unsigned')
    expect(AGENTHIX_PUBLISHER).toBe('agenthix')
    expect([...RESERVED_PUBLISHERS].sort()).toEqual(['agenthix', 'unsigned'])
    expect(isReservedPublisher('unsigned')).toBe(true)
    expect(isReservedPublisher('agenthix')).toBe(true)
    expect(isReservedPublisher('fernhill')).toBe(false)
  })
})
