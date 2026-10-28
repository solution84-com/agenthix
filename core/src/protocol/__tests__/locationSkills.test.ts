import { describe, it, expect } from 'vitest'
import {
  LOCATION_FILE_METHODS, agentSkillsRoot, PLACE_SKILLS_ROOT, WORKSPACE_SKILL_ROOTS,
  SCAN_SKILLS_MAX_PER_PLACE, SKILL_TREE_MAX_ENTRIES, SKILL_TREE_MAX_DEPTH, SKILL_WRITE_MAX_BYTES, placeSkillFolder,
} from '../locationFiles.js'
import { PACKAGE_KINDS, PACKAGE_MAX_BYTES, isPackageRef } from '../packages.js'

describe('scanning a place for skills', () => {
  it('is a control method of its own', () => {
    expect(LOCATION_FILE_METHODS.scanSkills).toBe('location.scanSkills')
  })

  it('names the roots and bounds the scan', () => {
    expect(PLACE_SKILLS_ROOT).toBe('.agents/skills')
    expect(WORKSPACE_SKILL_ROOTS).toEqual(['.agents/skills', '.claude/skills', '.github/skills'])
    expect(SCAN_SKILLS_MAX_PER_PLACE).toBeGreaterThan(0)
    expect(SKILL_TREE_MAX_ENTRIES).toBeGreaterThan(0)
    expect(SKILL_TREE_MAX_DEPTH).toBeGreaterThan(0)
  })

  it('builds an agent root only from a safe id', () => {
    expect(agentSkillsRoot('a1b2')).toBe('.agents/agents/a1b2/skills')
    for (const bad of ['', '../x', 'a/b', '.hidden', 'a b', 'x'.repeat(129)]) expect(agentSkillsRoot(bad)).toBeNull()
  })
})

describe('the skill package kind', () => {
  it('is a package kind whose key is a version row id', () => {
    expect(PACKAGE_KINDS).toContain('skill')
    expect(isPackageRef({ kind: 'skill', key: 'cm1abc', digest: 'a'.repeat(64) })).toBe(true)
    expect(isPackageRef({ kind: 'skill', key: '../x', digest: 'a'.repeat(64) })).toBe(false)
  })
})

describe('writing and removing a place\'s skill folder', () => {
  it('names the two methods', () => {
    expect(LOCATION_FILE_METHODS.writeSkill).toBe('location.writeSkill')
    expect(LOCATION_FILE_METHODS.removeSkill).toBe('location.removeSkill')
  })

  it('takes a place\'s own skill folder and one agent\'s', () => {
    expect(placeSkillFolder('.agents/skills/review')).toEqual({ group: 'place', slug: 'review' })
    expect(placeSkillFolder('.agents/agents/a1b2/skills/review-2')).toEqual({ group: 'agent', agentId: 'a1b2', slug: 'review-2' })
  })

  it('takes no other path: a workspace\'s, a root itself, a climb, a hidden or unnamed folder', () => {
    for (const bad of [
      '', 'review', '.agents/skills', '.agents/skills/', '.agents/skills/../x', '.agents/skills/.hidden', '.agents/skills/Review',
      '.agents/skills/a/b', '/.agents/skills/x', '.claude/skills/x', 'workspace/w1/.agents/skills/x', '.agents/agents/../skills/x',
      '.agents/agents/a b/skills/x', '.agents/agents/a/b/skills/x', '.agents\\skills\\x', `.agents/skills/${'x'.repeat(80)}`, 42,
    ]) expect(placeSkillFolder(bad)).toBeNull()
  })

  it('carries no more than a package may, inside staging\'s bound', () => {
    expect(SKILL_WRITE_MAX_BYTES).toBeLessThanOrEqual(PACKAGE_MAX_BYTES)
  })
})
